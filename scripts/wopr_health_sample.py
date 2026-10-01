#!/usr/bin/env python3
"""Read-only utilisation sample; emit only timestamp and six percentages."""
import json,shutil,subprocess,time
from pathlib import Path

def cpu():
 fields=[int(x) for x in Path('/proc/stat').read_text().splitlines()[0].split()[1:9]]
 return sum(fields),fields[3]+fields[4]
a=cpu();time.sleep(1);b=cpu()
cpu_pct=100*(1-(b[1]-a[1])/max(1,b[0]-a[0]))
mem={line.split(':')[0]:int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines()}
ram=100*(1-mem['MemAvailable']/mem['MemTotal'])
swap=100*(1-mem['SwapFree']/mem['SwapTotal']) if mem['SwapTotal'] else 0

def disk(path):
 if not Path(path).exists():return None
 d=shutil.disk_usage(path);return 100*d.used/d.total
try:
 result=subprocess.run(['nvidia-smi','--query-gpu=utilization.gpu','--format=csv,noheader,nounits'],capture_output=True,text=True,timeout=3,check=True)
 gpu=max(float(v.strip()) for v in result.stdout.splitlines())
except (OSError,ValueError,subprocess.SubprocessError):gpu=None
values=[cpu_pct,ram,swap,disk('/'),disk('/fast'),gpu]
print(json.dumps({'sampled_at':int(time.time()),'values':[round(max(0,min(100,v)),1) if v is not None else None for v in values]}))
