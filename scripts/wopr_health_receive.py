#!/usr/bin/env python3
"""Receive an allowlisted snapshot and atomically publish a single public JSON file."""
import json,math,os,sys,tempfile,time
from pathlib import Path
raw=sys.stdin.read(2049)
if len(raw)>2048:raise ValueError('Oversized snapshot')
d=json.loads(raw)
assert set(d)=={'version','sampled_at','values'} and d['version']==1
assert type(d['sampled_at']) is int and abs(time.time()-d['sampled_at'])<30
assert type(d['values']) is list and len(d['values'])==6
assert all(v is None or (type(v) in (int,float) and math.isfinite(v) and 0<=v<=100) for v in d['values'])
root=Path('/var/www/lozknowles.com/public_html/dist')
staging=root.parent/'wopr-health-private'
staging.mkdir(mode=0o700,exist_ok=True)
fd,name=tempfile.mkstemp(dir=staging)
try:
 with os.fdopen(fd,'w') as f:json.dump(d,f,separators=(',',':'));f.write('\n')
 os.chmod(name,0o644)
 os.replace(name,root/'wopr-health.json')
finally:
 if os.path.exists(name):os.unlink(name)
