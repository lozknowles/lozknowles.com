#!/usr/bin/env python3
"""Collect bounded read-only samples concurrently, then publish explicit public schema."""
import json,os,subprocess,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
source=Path(__file__).with_name('wopr_health_sample.py').read_text(encoding='utf-8-sig')
CONTROL_DIR=Path(f'/run/user/{os.getuid()}/wopr-health-ssh')
def cottage_ssh(command,connect_timeout):
 CONTROL_DIR.mkdir(mode=0o700,exist_ok=True)
 if CONTROL_DIR.stat().st_mode & 0o077:raise PermissionError('Insecure WOPR SSH control directory')
 return ['ssh','-o','BatchMode=yes','-o',f'ConnectTimeout={connect_timeout}',
  '-o','ControlMaster=auto','-o','ControlPersist=60',
  '-o',f'ControlPath={CONTROL_DIR}/%C','-p','2222','cottageserver']+([command] if command else [])
def warm_cottage():
 started=time.monotonic()
 try:
  subprocess.run(cottage_ssh('true',5),capture_output=True,text=True,timeout=12,check=True)
  print(f'C session seconds={time.monotonic()-started:.2f} result=ok',flush=True)
 except (OSError,subprocess.SubprocessError) as exc:
  print(f'C session seconds={time.monotonic()-started:.2f} result={type(exc).__name__}',flush=True)
def sample(target):
 try:
  cmd=['python3','-'] if target is None else ['ssh','-o','BatchMode=yes','-o','ConnectTimeout=4','-p','2222',target,'python3 -']
  r=subprocess.run(cmd,input=source,text=True,capture_output=True,timeout=8,check=True)
  if len(r.stdout)>1024:raise ValueError('Oversized sample')
  return json.loads(r.stdout)
 except (OSError,ValueError,subprocess.SubprocessError):return None
def sample_power():
 try:
  r=subprocess.run(['/home/loz/.local/share/wopr-power/venv/bin/python','/home/loz/bin/wopr-power-sample.py'],capture_output=True,text=True,timeout=5,check=True)
  if len(r.stdout)>256:raise ValueError('Oversized power sample')
  return json.loads(r.stdout)
 except (OSError,ValueError,subprocess.SubprocessError):return None
def collect():
 with ThreadPoolExecutor(max_workers=4) as pool:
  jobs={id:pool.submit(sample,target) for id,target in (('H',None),('S','sentinel'))}
  power=pool.submit(sample_power)
  servers={id:job.result() for id,job in jobs.items()}
  servers['C']=None
  power=power.result()
 h=servers['H'] or {'sampled_at':int(time.time()),'values':[None]*6}
 return {'version':1,**h,'servers':servers,'power':{'wopr':power}}

if __name__=='__main__':
 warm_cottage()
 warmed=time.monotonic()
 data=collect()
 sampled=time.monotonic()
 subprocess.run(cottage_ssh('python3 /home/loz/bin/wopr-health-receive.py',5),input=json.dumps(data),text=True,timeout=14,check=True)
 print(f'collector sample_seconds={sampled-warmed:.2f} publish_seconds={time.monotonic()-sampled:.2f}',flush=True)
