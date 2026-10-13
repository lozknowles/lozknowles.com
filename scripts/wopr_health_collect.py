#!/usr/bin/env python3
"""Collect bounded read-only samples concurrently, then publish explicit public schema."""
import json,subprocess,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
source=Path(__file__).with_name('wopr_health_sample.py').read_text(encoding='utf-8-sig')
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
  jobs={id:pool.submit(sample,target) for id,target in (('H',None),('S','sentinel'),('C','cottageserver'))}
  power=pool.submit(sample_power)
  servers={id:job.result() for id,job in jobs.items()}
  power=power.result()
 h=servers['H'] or {'sampled_at':int(time.time()),'values':[None]*6}
 return {'version':1,**h,'servers':servers,'power':{'wopr':power}}

if __name__=='__main__':
 data=collect()
 subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=5','-p','2222','cottageserver','python3 /home/loz/bin/wopr-health-receive.py'],input=json.dumps(data),text=True,timeout=20,check=True)
