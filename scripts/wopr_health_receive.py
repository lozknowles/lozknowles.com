#!/usr/bin/env python3
"""Validate bounded public telemetry and atomically replace one JSON file."""
import json,math,os,sys,tempfile,time
from pathlib import Path
raw=sys.stdin.read(3073)
if len(raw)>3072:raise ValueError('Oversized snapshot')
d=json.loads(raw)
def valid_sample(s):
 return type(s) is dict and set(s)=={'sampled_at','values'} and type(s['sampled_at']) is int and abs(time.time()-s['sampled_at'])<30 and type(s['values']) is list and len(s['values'])==6 and all(v is None or (type(v) in (int,float) and math.isfinite(v) and 0<=v<=100) for v in s['values'])
def require(condition):
 if not condition:raise ValueError('Invalid public snapshot')
require(type(d) is dict and {'version','sampled_at','values'}<=set(d)<={'version','sampled_at','values','servers','power'} and type(d['version']) is int and d['version']==1)
require(valid_sample({k:d[k] for k in ('sampled_at','values')}))
if 'servers' in d:
 require(type(d['servers']) is dict and set(d['servers'])=={'H','S','C'})
 require(all(s is None or valid_sample(s) for s in d['servers'].values()))
if 'power' in d:
 require(type(d['power']) is dict and set(d['power'])=={'wopr'})
 p=d['power']['wopr']
 require(p is None or (type(p) is dict and set(p)=={'watts','observed_at'} and type(p['watts']) in (int,float) and math.isfinite(p['watts']) and 0<=p['watts']<=4000 and type(p['observed_at']) is int and abs(time.time()-p['observed_at'])<30))
 d['power']={'wopr':None if p is None else {'watts':p['watts'],'observed_at':p['observed_at']}}
root=Path('/var/www/lozknowles.com/public_html/dist');staging=root.parent/'wopr-health-private'
staging.mkdir(mode=0o700,exist_ok=True)
fd,name=tempfile.mkstemp(dir=staging)
try:
 with os.fdopen(fd,'w') as f:json.dump(d,f,separators=(',',':'));f.write('\n')
 os.chmod(name,0o644);os.replace(name,root/'wopr-health.json')
finally:
 if os.path.exists(name):os.unlink(name)
