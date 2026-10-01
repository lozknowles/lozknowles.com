import asyncio, json, pathlib, tempfile, time, unittest
from unittest.mock import AsyncMock, Mock, patch
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from wopr_control.server import inventory, parse_sample, failure_state, confirm_termination, make_app, TerminalSession, ssh_args

HERE=pathlib.Path(__file__).resolve().parents[1]
ORIGIN='https://controller.test.ts.net:8445'
def sample():return {'sampled_at':time.time(),'hostname':'fixture','os':'Linux','cpu':14,'ram':31,'storage':20,'uptime_seconds':100,'network_bytes_second':0,'temperature_c':None,'gpu':None,'tmux':True}

class Parsing(unittest.TestCase):
 def test_inventory_has_five_and_no_credentials(self):
  d=inventory(HERE/'inventory.example.json');self.assertEqual(len(d),5);self.assertEqual(d['cottageserver']['ssh_port'],2222)
 def test_rejects_injection_duplicates_credentials_and_unavailable_controls(self):
  with tempfile.TemporaryDirectory() as td:
   path=pathlib.Path(td)/'inventory.json'
   for key,value in [('id','../../root'),('ssh_target','sentinel;shutdown'),('password','forbidden'),('ssh_port',True),('capabilities',['reboot'])]:
    d=json.loads((HERE/'inventory.example.json').read_text());d['machines'][1][key]=value;path.write_text(json.dumps(d))
    with self.assertRaises(ValueError):inventory(path)
   d=json.loads((HERE/'inventory.example.json').read_text());d['machines'].append(d['machines'][0]);path.write_text(json.dumps(d))
   with self.assertRaises(ValueError):inventory(path)
 def test_telemetry_true_samples_only(self):
  self.assertEqual(parse_sample(json.dumps(sample()))['cpu'],14)
  for value in (-1,101,float('nan'),None,'14'):
   d=sample();d['cpu']=value
   with self.assertRaises(ValueError):parse_sample(json.dumps(d))
  d=sample();d['sampled_at']-=90
  with self.assertRaises(ValueError):parse_sample(json.dumps(d))
 def test_failure_classification(self):
  self.assertEqual(failure_state('Permission denied')[0],'degraded');self.assertEqual(failure_state('Host key verification failed')[0],'unknown');self.assertEqual(failure_state('Connection refused')[0],'offline')
 def test_ssh_security_and_confirmation(self):
  a=ssh_args(inventory(HERE/'inventory.example.json')['sentinel']);self.assertIn('StrictHostKeyChecking=yes',a);self.assertIn('ForwardAgent=no',a)
  self.assertFalse(confirm_termination({},'a'));self.assertFalse(confirm_termination({'confirm':'yes'},'a'));self.assertTrue(confirm_termination({'confirm':'TERMINATE a'},'a'))
 def test_resize_signals_only_owned_terminal_group(self):
  s=TerminalSession(None,{'state':'resumable'});s.fd=42;s.proc=Mock(pid=1234);s.proc.poll.return_value=None
  with patch('wopr_control.server.fcntl.ioctl') as ioctl,patch('wopr_control.server.os.killpg') as kill:
   s.resize(500,300);self.assertEqual(ioctl.call_args.args[0],42);self.assertEqual(kill.call_args.args[0],1234)
   s.proc.poll.return_value=0;s.resize(80,24);self.assertEqual(kill.call_count,1)

class API(unittest.IsolatedAsyncioTestCase):
 async def asyncSetUp(self):
  self.temp=tempfile.TemporaryDirectory();config={'bind':'127.0.0.1','origin':ORIGIN,'allowed_users':['fixture@example.test'],'inventory':str(HERE/'inventory.example.json'),'state_dir':self.temp.name}
  self.poll=patch('wopr_control.server.Controller.poll',new=AsyncMock());self.poll.start()
  self.app=make_app(config);self.c=self.app['ctrl'];self.c.auth['test-token']={'user':'fixture@example.test','expires':time.time()+60}
  self.headers={'Host':'controller.test.ts.net:8445','Origin':ORIGIN,'Tailscale-User-Login':'fixture@example.test','Cookie':'wopr_session=test-token'}
  self.client=TestClient(TestServer(self.app));await self.client.start_server()
 async def asyncTearDown(self):await self.client.close();self.poll.stop();self.temp.cleanup()
 async def test_localhost_and_tailnet_origin_enforced(self):
  for key,value in [('bind','0.0.0.0'),('origin','https://lozknowles.com')]:
   config=self.c.config.copy();config[key]=value
   with self.assertRaises(ValueError):make_app(config)
  h=self.headers|{'Host':'lozknowles.com'};self.assertEqual((await self.client.get('/api/machines',headers=h)).status,403)
 async def test_auth_origin_and_expiry(self):
  self.assertEqual((await self.client.get('/api/machines')).status,403)
  self.assertEqual((await self.client.get('/api/machines',headers=self.headers|{'Tailscale-User-Login':'other@example.test'})).status,403)
  self.assertEqual((await self.client.post('/api/sessions',json={'machine':'hpubuntu'},headers=self.headers|{'Origin':'https://evil.test'})).status,403)
  self.c.auth['test-token']['expires']=time.time()-1;self.assertEqual((await self.client.get('/api/machines',headers=self.headers)).status,401)
 async def test_bootstrap_secure_cookie(self):
  r=await self.client.post('/api/session',headers=self.headers);self.assertEqual(r.status,200)
  cookie=r.headers.get('Set-Cookie');self.assertIn('HttpOnly',cookie);self.assertIn('Secure',cookie);self.assertIn('SameSite=Strict',cookie)
 async def test_host_allowlist_and_no_generic_command(self):
  for mid in ('unlisted','msi','sentinel;reboot'):
   r=await self.client.post('/api/sessions',json={'machine':mid},headers=self.headers);self.assertEqual(r.status,403)
  self.assertIn((await self.client.post('/api/run',json={'command':'hostname'},headers=self.headers)).status,(404,405))
  self.assertEqual((await self.client.get('/api/machines/hpubuntu/reboot',headers=self.headers)).status,403)
 async def test_unknown_stale_and_failure_isolation(self):
  self.c.samples['sentinel']={'state':'online','reason':'fixture','sample':sample()};self.c.samples['sentinel']['sample']['sampled_at']-=90
  r=await self.client.get('/api/machines',headers=self.headers);data=await r.json();self.assertTrue(all(m['state']=='unknown' for m in data))
  with patch('wopr_control.server.command',AsyncMock(side_effect=asyncio.TimeoutError)):
   await self.c.sample_machine(self.c.machines['sentinel']);self.assertEqual(self.c.samples['sentinel']['state'],'unknown')
  with patch('wopr_control.server.command',AsyncMock(return_value=(255,b'','Permission denied'))):
   await self.c.sample_machine(self.c.machines['sentinel']);self.assertEqual(self.c.samples['sentinel']['state'],'degraded')
 async def create(self):
  r=await self.client.post('/api/sessions',json={'machine':'hpubuntu'},headers=self.headers);self.assertEqual(r.status,201);return await r.json()
 async def test_persistent_metadata_and_session_disappearance(self):
  s=await self.create();self.assertTrue(self.c.state_file.exists());self.assertEqual(self.c.state_file.stat().st_mode&0o777,0o600)
  r=make_app(self.c.config)['ctrl'];self.assertEqual(r.sessions[s['id']].state,'resumable')
  terminal=self.c.sessions[s['id']];terminal.record['opened']=True
  with patch('wopr_control.server.command',AsyncMock(return_value=(1,b'','no server running'))):
   with self.assertRaises(web.HTTPGone):await terminal.attach()
  self.assertEqual(terminal.state,'terminated')
 async def test_ws_requires_auth_origin_ticket_and_ticket_single_use(self):
  with self.assertRaises(Exception):await self.client.ws_connect('/ws',headers=self.headers)
  s=await self.create();r=await self.client.post('/api/sessions/'+s['id']+'/ticket',json={},headers=self.headers);token=(await r.json())['ticket']
  with patch.object(TerminalSession,'attach',AsyncMock()):
   ws=await self.client.ws_connect('/ws',headers=self.headers,protocols=('wopr',token));d=await ws.receive_json();self.assertEqual(d['state'],'active');await ws.close()
   with self.assertRaises(Exception):await self.client.ws_connect('/ws',headers=self.headers,protocols=('wopr',token))
  self.assertEqual(self.c.sessions[s['id']].state,'resumable')
 async def test_ws_wrong_origin_and_expiry(self):
  s=await self.create();r=await self.client.post('/api/sessions/'+s['id']+'/ticket',json={},headers=self.headers);tok=(await r.json())['ticket']
  with self.assertRaises(Exception) as ex:await self.client.ws_connect('/ws',headers=self.headers|{'Origin':'https://evil.test'},protocols=('wopr',tok))
  self.assertEqual(ex.exception.status,403)
  self.c.auth['test-token']['expires']=time.time()+.2
  with patch.object(TerminalSession,'attach',AsyncMock()):
   ws=await self.client.ws_connect('/ws',headers=self.headers,protocols=('wopr',tok));await ws.receive_json();msg=await asyncio.wait_for(ws.receive(),2);self.assertEqual(msg.data,1008)
 async def test_four_connection_limit(self):
  sockets=[]
  with patch.object(TerminalSession,'attach',AsyncMock()):
   for i in range(5):
    s=await self.create();r=await self.client.post('/api/sessions/'+s['id']+'/ticket',json={},headers=self.headers);tok=(await r.json())['ticket']
    if i<4:
     ws=await self.client.ws_connect('/ws',headers=self.headers,protocols=('wopr',tok));await ws.receive_json();sockets.append(ws)
    else:
     with self.assertRaises(Exception) as ex:await self.client.ws_connect('/ws',headers=self.headers,protocols=('wopr',tok))
     self.assertEqual(ex.exception.status,409)
   for ws in sockets:await ws.close()
 async def test_terminate_needs_specific_confirmation(self):
  s=await self.create();url='/api/sessions/'+s['id']+'/terminate'
  self.assertEqual((await self.client.post(url,json={},headers=self.headers)).status,409)
  with patch('wopr_control.server.command',AsyncMock(return_value=(0,b'',''))):
   r=await self.client.post(url,json={'confirm':'TERMINATE '+s['id']},headers=self.headers);self.assertEqual((await r.json())['state'],'terminated')
 async def test_public_health_and_private_source_boundary(self):
  h=self.headers.copy();h.pop('Cookie');self.assertEqual((await self.client.get('/wopr-health.json',headers=h)).status,401)
  for file in ('server.py','config.local.json','inventory.example.json','state/sessions.json','../server.py'):
   self.assertEqual((await self.client.get('/'+file,headers=self.headers)).status,404)
 async def test_readonly_capability_allowlist(self):
  with patch('wopr_control.server.command',AsyncMock(return_value=(0,b'fixture output',''))) as cmd:
   r=await self.client.get('/api/machines/sentinel/processes',headers=self.headers);self.assertTrue((await r.json())['available']);self.assertTrue(cmd.call_args.args[1].startswith('ps '))

if __name__=='__main__':unittest.main()
