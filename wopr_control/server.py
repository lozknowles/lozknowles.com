"""Localhost-only, Tailscale-authenticated WOPR controller. Linux host required."""
import asyncio, codecs, contextlib, fcntl, json, logging, math, os, pathlib, pty, re, secrets, shlex, signal, struct, subprocess, termios, time, tty
from urllib.parse import urlsplit
from aiohttp import web, WSMsgType

ROOT=pathlib.Path(__file__).resolve().parent
LOG=logging.getLogger('wopr')
ID=re.compile(r'^[a-z][a-z0-9-]{0,31}$')
TARGET=re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$')
CAPS={'terminal','status','processes','services','gpu','logs'}
READS={
 'processes':'ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -30',
 'services':'systemctl --no-pager --plain list-units --type=service --state=running,failed | head -45',
 'gpu':'nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv',
 'logs':'journalctl --user --no-pager -n 35',
}

def inventory(path):
 data=json.loads(pathlib.Path(path).read_text())
 if data.get('version')!=1 or not isinstance(data.get('machines'),list):raise ValueError('Inventory schema')
 result={}
 for m in data['machines']:
  if not isinstance(m,dict) or not ID.fullmatch(m.get('id','')) or m['id'] in result:raise ValueError('Machine id')
  if any(k in m for k in ('password','private_key','token','secret')):raise ValueError('Credentials forbidden')
  if m.get('connection') not in ('local','ssh','unavailable'):raise ValueError('Connection method')
  if m['connection']=='ssh' and not TARGET.fullmatch(m.get('ssh_target','')):raise ValueError('SSH alias')
  if type(m.get('ssh_port')) is not int or not 1<=m['ssh_port']<=65535:raise ValueError('SSH port')
  if not isinstance(m.get('capabilities'),list) or set(m['capabilities'])-CAPS:raise ValueError('Capabilities')
  if m['connection']=='unavailable' and set(m['capabilities'])-{'status'}:raise ValueError('Unavailable controls')
  for k in ('name','hostname','os','role','icon'):
   if not isinstance(m.get(k),str) or not 0<len(m[k])<=160:raise ValueError('Machine metadata')
  result[m['id']]=m
 if not result or len(result)>64:raise ValueError('Inventory size')
 return result

def ssh_args(m):
 return ['ssh','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','PasswordAuthentication=no','-o','KbdInteractiveAuthentication=no','-o','ForwardAgent=no','-o','ClearAllForwardings=yes','-o','PermitLocalCommand=no','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','-o','ConnectTimeout=4','-p',str(m['ssh_port'])]

def parse_sample(raw):
 if len(raw)>8192:raise ValueError('Telemetry limit')
 d=json.loads(raw)
 if not isinstance(d,dict):raise ValueError('Telemetry object')
 for k in ('sampled_at','cpu','ram','storage','uptime_seconds','network_bytes_second'):
  if type(d.get(k)) not in (int,float) or not math.isfinite(d[k]):raise ValueError('Telemetry numeric')
 for k in ('cpu','ram','storage'):
  if not 0<=d[k]<=100:raise ValueError('Telemetry range')
 if abs(time.time()-d['sampled_at'])>45:raise ValueError('Telemetry stale')
 for k in ('hostname','os'):
  if not isinstance(d.get(k),str) or len(d[k])>200:raise ValueError('Telemetry text')
 if type(d.get('tmux')) is not bool:raise ValueError('Telemetry tmux')
 if d.get('temperature_c') is not None and (type(d['temperature_c']) not in (int,float) or not math.isfinite(d['temperature_c'])):raise ValueError('Telemetry temperature')
 if d.get('gpu') is not None:
  if not isinstance(d['gpu'],dict) or set(d['gpu'])!={'utilisation','vram_used_mb','vram_total_mb','temperature_c'}:raise ValueError('Telemetry GPU')
  if any(type(v) not in (int,float) or not math.isfinite(v) or v<0 for v in d['gpu'].values()):raise ValueError('Telemetry GPU numeric')
 return d

def failure_state(stderr):
 s=stderr.lower()
 if 'permission denied' in s:return 'degraded','SSH authentication failed'
 if 'host key' in s or 'identification has changed' in s:return 'unknown','SSH host-key trust unavailable'
 if 'connection refused' in s or 'no route to host' in s:return 'offline','SSH endpoint unreachable'
 return 'unknown','SSH or telemetry unavailable'

async def command(m,cmd,stdin=None,timeout=7):
 args=([*ssh_args(m),m['ssh_target'],cmd] if m['connection']=='ssh' else ['sh','-c',cmd])
 p=await asyncio.create_subprocess_exec(*args,stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE)
 try:
  out,err=await asyncio.wait_for(p.communicate(stdin),timeout)
  return p.returncode,out,err.decode(errors='replace')
 except (asyncio.TimeoutError,asyncio.CancelledError):
  p.kill();await p.communicate();raise

def confirm_termination(data,sid):
 return isinstance(data,dict) and data.get('confirm')=='TERMINATE '+sid

class TerminalSession:
 def __init__(self,ctrl,record):
  self.ctrl=ctrl;self.record=record;self.proc=None;self.fd=None;self.clients=set();self.replay='';self.lock=asyncio.Lock();self.task=None
  self.state='resumable' if record.get('state')!='terminated' else 'terminated'
 def public(self):return {k:self.record[k] for k in ('id','machine','created_at')}|{'state':self.state,'clients':len(self.clients)}
 def tmux(self):
  m=self.ctrl.machines[self.record['machine']]
  return 'tmux -L wopr' if m['connection']=='ssh' else 'tmux -S '+shlex.quote(str(self.ctrl.state_dir/'tmux.sock'))
 async def attach(self):
  async with self.lock:
   if self.state=='terminated':raise web.HTTPGone(text='Session terminated')
   if self.proc and self.proc.poll() is None:return
   m=self.ctrl.machines[self.record['machine']];name=self.record['name']
   rc,_,err=await command(m,f'{self.tmux()} has-session -t {name}',timeout=15)
   if rc and self.record.get('opened'):
    if 'no server running' in err or "can't find" in err or 'No such file' in err:
     self.state='terminated';self.record['state']='terminated';self.ctrl.save();raise web.HTTPGone(text='Persistent tmux session disappeared; create a new session explicitly')
    raise web.HTTPBadGateway(text='SSH session currently unavailable')
   if rc and not any(x in err for x in ('no server running',"can't find",'No such file')):
    raise web.HTTPBadGateway(text='SSH authentication, host trust or tmux unavailable')
   if rc:
    created,_,_=await command(m,f'{self.tmux()} new-session -d -s {name} -e DISABLE_AUTO_UPDATE=true',timeout=15)
    if created:raise web.HTTPBadGateway(text='Persistent shell creation failed')
   # Create a detached persistent shell before attaching the interactive client.
   cmd=f'{self.tmux()} attach-session -t {name}'
   args=[*ssh_args(m),'-tt',m['ssh_target'],cmd] if m['connection']=='ssh' else ['tmux','-S',str(self.ctrl.state_dir/'tmux.sock'),'attach-session','-t',name]
   master,slave=pty.openpty();tty.setraw(slave);env=os.environ.copy();env['TERM']='xterm-256color'
   try:self.proc=subprocess.Popen(args,stdin=slave,stdout=slave,stderr=slave,env=env,start_new_session=True)
   finally:os.close(slave)
   self.fd=master;os.set_blocking(master,False);self.state='active';self.record['state']='resumable';self.record['opened']=True;self.ctrl.save();self.replay=''
   self.task=asyncio.create_task(self.pump());self.ctrl.audit('terminal-attach',session=self.record['id'],machine=m['id'])
 async def pump(self):
  loop=asyncio.get_running_loop();q=asyncio.Queue(maxsize=64);decoder=codecs.getincrementaldecoder('utf-8')('replace')
  def read():
   if q.full():loop.remove_reader(self.fd);return
   try:data=os.read(self.fd,8192)
   except BlockingIOError:return
   except OSError:data=b''
   q.put_nowait(data)
   if not data:loop.remove_reader(self.fd)
  loop.add_reader(self.fd,read)
  try:
   while True:
    data=await q.get()
    if not data:break
    if q.qsize()<32:loop.add_reader(self.fd,read)
    text=decoder.decode(data);self.replay=(self.replay+text)[-262144:]
    for ws in list(self.clients):
     try:await asyncio.wait_for(ws.send_json({'type':'output','data':text}),3)
     except (ConnectionError,asyncio.TimeoutError,RuntimeError):self.clients.discard(ws);await ws.close()
   rc=await asyncio.to_thread(self.proc.wait)
   # SSH transport loss is resumable; a normally exited shell is terminated.
   self.state='terminated' if rc==0 else 'disconnected';self.record['state']=self.state;self.ctrl.save()
   for ws in list(self.clients):
    with contextlib.suppress(Exception):await ws.send_json({'type':'state','state':self.state});await ws.close()
   self.clients.clear();self.ctrl.audit('terminal-end',session=self.record['id'],state=self.state)
  finally:
   loop.remove_reader(self.fd);os.close(self.fd);self.fd=None
 def resize(self,cols,rows):
  if self.fd is not None:
   fcntl.ioctl(self.fd,termios.TIOCSWINSZ,struct.pack('HHHH',max(2,min(200,rows)),max(10,min(300,cols)),0,0))
   # Popen's new session may have no controlling tty; signal its isolated group
   # explicitly so SSH forwards the real window change and tmux redraws cleanly.
   if self.proc and self.proc.poll() is None:
    with contextlib.suppress(ProcessLookupError):os.killpg(self.proc.pid,signal.SIGWINCH)
 async def write(self,data):
  if not isinstance(data,str) or len(data)>8192:raise ValueError('Input limit')
  encoded=data.encode()
  while encoded:
   try:n=os.write(self.fd,encoded);encoded=encoded[n:]
   except BlockingIOError:await asyncio.sleep(.01)
 async def stop_transport(self):
  if self.proc and self.proc.poll() is None:
   with contextlib.suppress(ProcessLookupError):os.killpg(self.proc.pid,signal.SIGTERM)
   await asyncio.to_thread(self.proc.wait)
  if self.task:await asyncio.gather(self.task,return_exceptions=True)

class Controller:
 def __init__(self,config):
  if config.get('bind','127.0.0.1')!='127.0.0.1':raise ValueError('Controller must bind localhost')
  u=urlsplit(config['origin'])
  if u.scheme!='https' or not u.hostname or not u.hostname.endswith('.ts.net') or u.path:raise ValueError('Private Tailscale HTTPS origin required')
  if not config.get('allowed_users'):raise ValueError('Explicit allowed users required')
  self.config=config;self.machines=inventory(config['inventory']);self.state_dir=pathlib.Path(config['state_dir']);self.state_dir.mkdir(mode=0o700,parents=True,exist_ok=True);os.chmod(self.state_dir,0o700)
  self.auth={};self.tickets={};self.sessions={};self.samples={};self.inspect_at={};self.pending={};self.poll_task=None
  self.state_file=self.state_dir/'sessions.json'
  if self.state_file.exists():
   for r in json.loads(self.state_file.read_text()):
    if r.get('machine') in self.machines and re.fullmatch(r'wopr-[a-z0-9-]+-[a-f0-9]{16}',r.get('name','')) and re.fullmatch('[a-f0-9]{16}',r.get('id','')):
     self.sessions[r['id']]=TerminalSession(self,r)
 def save(self):
  temp=self.state_file.with_suffix('.new');temp.write_text(json.dumps([s.record for s in self.sessions.values()]));os.chmod(temp,0o600);os.replace(temp,self.state_file)
 def audit(self,event,**fields):
  # Never record shell keystrokes/output: both may contain secrets.
  LOG.info(json.dumps({'event':event,'timestamp':time.time(),**fields}))
 def identity(self,request):
  login=request.headers.get('Tailscale-User-Login','')
  if login not in self.config['allowed_users']:raise web.HTTPForbidden(text='Tailnet identity not authorized')
  return login
 def authorize(self,request):
  login=self.identity(request);token=request.cookies.get('wopr_session');entry=self.auth.get(token)
  if not entry or entry['user']!=login or entry['expires']<=time.time():raise web.HTTPUnauthorized(text='Session expired')
  if request.method!='GET' or request.path=='/ws':
   if request.headers.get('Origin')!=self.config['origin']:raise web.HTTPForbidden(text='Origin rejected')
  return entry
 async def sample_machine(self,m):
  if m['connection']=='unavailable':self.samples[m['id']]={'state':'unknown','reason':'Controller SSH trust/authentication not qualified','sample':None};return
  try:
   rc,out,err=await command(m,'python3 -',stdin=(ROOT/'sample.py').read_bytes())
   if rc:state,reason=failure_state(err);self.samples[m['id']]={'state':state,'reason':reason,'sample':None};return
   data=parse_sample(out);degraded=not data['tmux'] or (m['gpu'] and data['gpu'] is None)
   self.samples[m['id']]={'state':'degraded' if degraded else 'online','reason':'GPU telemetry or tmux unavailable' if degraded else 'Authenticated telemetry available','sample':data}
  except asyncio.TimeoutError:self.samples[m['id']]={'state':'unknown','reason':'Telemetry timed out; reachability unconfirmed','sample':None}
  except (OSError,ValueError):self.samples[m['id']]={'state':'unknown','reason':'Telemetry unavailable or invalid','sample':None}
 async def poll(self):
  while True:
   await asyncio.gather(*(self.sample_machine(m) for m in self.machines.values()))
   now=time.time();self.auth={k:v for k,v in self.auth.items() if v['expires']>now};self.tickets={k:v for k,v in self.tickets.items() if v['expires']>now}
   await asyncio.sleep(max(10,self.config.get('telemetry_seconds',15)))
 def statuses(self):
  result=[]
  for m in self.machines.values():
   status=self.samples.get(m['id'],{'state':'unknown','reason':'Awaiting authenticated sample','sample':None}).copy()
   if status['sample'] and time.time()-status['sample']['sampled_at']>45:status={'state':'unknown','reason':'Telemetry stale','sample':None}
   caps=list(m['capabilities'])
   if status['sample'] and not status['sample']['tmux']:caps=[c for c in caps if c!='terminal']
   if status['sample'] and status['sample']['gpu'] is None:caps=[c for c in caps if c!='gpu']
   result.append({k:v for k,v in m.items() if k not in ('ssh_target',)}|status|{'capabilities':caps})
  return result

@web.middleware
async def security(request,handler):
 ctrl=request.app['ctrl']
 if request.host!=urlsplit(ctrl.config['origin']).netloc:raise web.HTTPForbidden(text='Host rejected')
 if request.remote not in ('127.0.0.1','::1'):raise web.HTTPForbidden(text='Local proxy only')
 ctrl.identity(request)
 if request.path.startswith('/api/') and request.path!='/api/session' or request.path in ('/ws','/wopr-health.json'):
  request['auth']=ctrl.authorize(request)
 try:response=await handler(request)
 except (ValueError,KeyError,json.JSONDecodeError):raise web.HTTPBadRequest(text='Invalid request')
 response.headers.update({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"})
 return response

async def bootstrap(request):
 c=request.app['ctrl']
 if request.headers.get('Origin')!=c.config['origin']:raise web.HTTPForbidden(text='Origin rejected')
 old=c.auth.get(request.cookies.get('wopr_session'))
 if old and old['expires']>time.time() and old['user']==c.identity(request):token=request.cookies['wopr_session']
 else:
  token=secrets.token_urlsafe(32);c.auth[token]={'user':c.identity(request),'expires':time.time()+max(60,min(28800,c.config.get('session_seconds',28800)))}
 response=web.json_response({'idle_seconds':c.config.get('idle_seconds',120),'expires_at':c.auth[token]['expires']})
 response.set_cookie('wopr_session',token,max_age=int(c.auth[token]['expires']-time.time()),httponly=True,secure=True,samesite='Strict',path='/')
 return response
async def machines(request):return web.json_response(request.app['ctrl'].statuses())
async def sessions(request):
 c=request.app['ctrl'];user=request['auth']['user']
 if request.method=='GET':return web.json_response([s.public() for s in c.sessions.values() if s.record['owner']==user])
 data=await request.json();mid=data.get('machine');m=c.machines.get(mid)
 if not m or 'terminal' not in m['capabilities'] or m['connection']=='unavailable':raise web.HTTPForbidden(text='Machine not manageable')
 active=[s for s in c.sessions.values() if s.record['owner']==user and s.state!='terminated']
 if len(active)>=12:raise web.HTTPConflict(text='Session limit; terminate an unused session first')
 sid=secrets.token_hex(8);r={'id':sid,'machine':mid,'created_at':time.time(),'name':f'wopr-{mid}-{sid}','owner':user,'state':'resumable'}
 s=TerminalSession(c,r);c.sessions[sid]=s;c.save();c.audit('session-create',session=sid,machine=mid)
 return web.json_response(s.public(),status=201)
def owned(request):
 c=request.app['ctrl'];s=c.sessions.get(request.match_info['sid'])
 if not s or s.record['owner']!=request['auth']['user']:raise web.HTTPNotFound()
 return s
async def ticket(request):
 c=request.app['ctrl'];s=owned(request)
 if s.state=='terminated':raise web.HTTPGone(text='Session terminated')
 tok=secrets.token_urlsafe(32);c.tickets[tok]={'session':s.record['id'],'user':request['auth']['user'],'expires':time.time()+30}
 return web.json_response({'ticket':tok})
async def terminate(request):
 s=owned(request);data=await request.json()
 if not confirm_termination(data,s.record['id']):raise web.HTTPConflict(text='Explicit termination confirmation required')
 if s.state=='terminated':return web.json_response(s.public())
 m=s.ctrl.machines[s.record['machine']]
 await s.stop_transport()
 rc,_,err=await command(m,f'{s.tmux()} kill-session -t {s.record["name"]}')
 if rc and 'no server running' not in err and "can't find" not in err:raise web.HTTPBadGateway(text='Termination could not be verified')
 s.state='terminated';s.record['state']='terminated';s.replay='';s.ctrl.save();s.ctrl.audit('session-terminate',session=s.record['id'])
 return web.json_response(s.public())
async def inspect_machine(request):
 c=request.app['ctrl'];m=c.machines.get(request.match_info['mid']);kind=request.match_info['kind']
 if not m or kind not in READS or kind not in m['capabilities'] or m['connection']=='unavailable':raise web.HTTPForbidden(text='Capability unavailable')
 key=(request['auth']['user'],m['id'],kind)
 if time.time()-c.inspect_at.get(key,0)<2:raise web.HTTPTooManyRequests(text='Please wait')
 c.inspect_at[key]=time.time();c.audit('inspect',machine=m['id'],kind=kind)
 try:
  rc,out,_=await command(m,READS[kind],timeout=6)
  return web.json_response({'available':rc==0,'output':out[:32768].decode(errors='replace') if rc==0 else 'Read-only capability unavailable for this account'})
 except asyncio.TimeoutError:return web.json_response({'available':False,'output':'Read-only query timed out'})
async def activity(request):
 # Provider-neutral derived events. Future adapters remain controller-side only.
 c=request.app['ctrl'];events=[]
 for m in c.statuses():
  if m['sample']:events.append({'source':'os-telemetry','machine':m['id'],'type':'cpu','state':m['state'],'timestamp':m['sample']['sampled_at'],'intensity':m['sample']['cpu']/100,'metadata':{}})
 for s in c.sessions.values():
  if s.record['owner']==request['auth']['user'] and s.state!='terminated':events.append({'source':'ssh-terminal','machine':s.record['machine'],'type':'session','state':s.state,'timestamp':time.time(),'intensity':1 if s.clients else .2,'metadata':{'clients':len(s.clients)}})
 return web.json_response(events)
async def health(request):
 c=request.app['ctrl'];out={}
 for letter,mid in [('H','hpubuntu'),('S','sentinel'),('C','cottageserver')]:
  d=next((m['sample'] for m in c.statuses() if m['id']==mid),None)
  out[letter]={'sampled_at':d['sampled_at'],'values':[d['cpu'],d['ram'],None,d['storage'],None,d['gpu']['utilisation'] if d['gpu'] else None]} if d else None
 h=out['H'] or {'sampled_at':time.time(),'values':[None]*6}
 return web.json_response({'version':1,**h,'servers':out})
async def websocket(request):
 c=request.app['ctrl'];parts=[p.strip() for p in request.headers.get('Sec-WebSocket-Protocol','').split(',')]
 t=c.tickets.pop(parts[1],None) if len(parts)==2 and parts[0]=='wopr' else None
 if not t or t['expires']<=time.time() or t['user']!=request['auth']['user']:raise web.HTTPForbidden(text='WebSocket ticket rejected')
 s=c.sessions.get(t['session'])
 if not s or s.record['owner']!=t['user']:raise web.HTTPForbidden()
 user=t['user']
 if sum(len(x.clients) for x in c.sessions.values() if x.record['owner']==user)+c.pending.get(user,0)>=4:raise web.HTTPConflict(text='Four active terminal connections already open')
 c.pending[user]=c.pending.get(user,0)+1
 try:
  try:await s.attach()
  except asyncio.TimeoutError:raise web.HTTPGatewayTimeout(text='Target SSH handshake timed out; retry to resume')
  except OSError:raise web.HTTPBadGateway(text='Terminal transport unavailable')
  ws=web.WebSocketResponse(protocols=('wopr',),heartbeat=20,max_msg_size=16384,compress=False);await ws.prepare(request)
  s.clients.add(ws);s.state='active'
 finally:c.pending[user]-=1
 await ws.send_json({'type':'state','state':'active'})
 if s.replay:await ws.send_json({'type':'replay','data':s.replay})
 async def expiry():
  await asyncio.sleep(max(0,request['auth']['expires']-time.time()));await ws.close(code=1008,message=b'Authentication expired')
 exp=asyncio.create_task(expiry())
 try:
  async for msg in ws:
   if msg.type==WSMsgType.TEXT:
    try:
     data=json.loads(msg.data)
     if data.get('type')=='input':await s.write(data.get('data'))
     elif data.get('type')=='resize':
      if type(data.get('cols')) is not int or type(data.get('rows')) is not int:raise ValueError()
      s.resize(data['cols'],data['rows'])
     else:raise ValueError()
    except (ValueError,OSError,TypeError):await ws.close(code=1008,message=b'Invalid terminal message');break
   elif msg.type==WSMsgType.ERROR:break
 finally:
  exp.cancel();s.clients.discard(ws)
  if not s.clients and s.state=='active':s.state='resumable'
  c.audit('browser-detach',session=s.record['id'],state=s.state)
 return ws
async def static(request):
 rel=request.match_info.get('file','index.html') or 'index.html'
 files={f.relative_to(ROOT/'web').as_posix():f for f in (ROOT/'web').rglob('*') if f.is_file() and not f.name.endswith('.map')}
 special={'wopr-light-display.html':ROOT.parent/'wopr-light-display.html','assets/wopr-light-display.js':ROOT.parent/'assets/wopr-light-display.js'}
 f=(files|special).get(rel)
 if not f:raise web.HTTPNotFound()
 return web.FileResponse(f)
async def startup(app):app['ctrl'].poll_task=asyncio.create_task(app['ctrl'].poll())
async def cleanup(app):
 c=app['ctrl'];c.poll_task.cancel();await asyncio.gather(c.poll_task,return_exceptions=True)
 for s in c.sessions.values():
  await s.stop_transport()
  if s.state!='terminated':s.record['state']='resumable'
 c.save()
def make_app(config):
 app=web.Application(middlewares=[security],client_max_size=16384);app['ctrl']=Controller(config)
 app.router.add_post('/api/session',bootstrap);app.router.add_get('/api/machines',machines)
 app.router.add_get('/api/sessions',sessions);app.router.add_post('/api/sessions',sessions)
 app.router.add_post('/api/sessions/{sid}/ticket',ticket);app.router.add_post('/api/sessions/{sid}/terminate',terminate)
 app.router.add_get('/api/machines/{mid}/{kind}',inspect_machine);app.router.add_get('/api/activity',activity)
 app.router.add_get('/wopr-health.json',health);app.router.add_get('/ws',websocket);app.router.add_get('/{file:.*}',static)
 app.on_startup.append(startup);app.on_cleanup.append(cleanup);return app
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--config',required=True);args=p.parse_args()
 config_path=pathlib.Path(args.config).resolve();config=json.loads(config_path.read_text())
 for k in ('inventory','state_dir'):config[k]=str((config_path.parent/config[k]).resolve())
 logging.basicConfig(level=logging.INFO,format='%(message)s')
 web.run_app(make_app(config),host='127.0.0.1',port=config.get('port',18892),access_log=None)
