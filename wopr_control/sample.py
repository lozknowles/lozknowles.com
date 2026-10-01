"""Bounded read-only Linux telemetry; executed locally or over allowlisted SSH."""
import json, pathlib, shutil, subprocess, time, socket, math
P=pathlib.Path
def cpu():
 f=[int(x) for x in P('/proc/stat').read_text().splitlines()[0].split()[1:9]]
 return sum(f),f[3]+f[4]
def net():
 return sum(int(l.split(':')[1].split()[0])+int(l.split(':')[1].split()[8]) for l in P('/proc/net/dev').read_text().splitlines()[2:] if not l.strip().startswith('lo:'))
a=cpu();n=net();time.sleep(.25);b=cpu()
m={l.split(':')[0]:int(l.split()[1]) for l in P('/proc/meminfo').read_text().splitlines()}
cpu_pct=round(max(0,min(100,100*(1-(b[1]-a[1])/max(1,b[0]-a[0])))),1)
disk=shutil.disk_usage('/')
def run(args):
 try:return subprocess.run(args,text=True,capture_output=True,timeout=2,check=True).stdout.strip()
 except (OSError,subprocess.SubprocessError):return None
gpu=run(['nvidia-smi','--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu','--format=csv,noheader,nounits'])
g=None
try:
 if gpu:
  numbers=[float(x.strip()) for x in gpu.splitlines()[0].split(',')]
  if all(math.isfinite(x) for x in numbers):g=dict(zip(('utilisation','vram_used_mb','vram_total_mb','temperature_c'),numbers))
except ValueError:pass
temps=[]
for f in P('/sys/class/thermal').glob('thermal_zone*/temp'):
 try:temps.append(int(f.read_text())/1000)
 except (ValueError,OSError):pass
release={}
try:release=dict(l.split('=',1) for l in P('/etc/os-release').read_text().splitlines() if '=' in l)
except OSError:pass
print(json.dumps({'sampled_at':time.time(),'hostname':socket.gethostname(),'os':release.get('PRETTY_NAME','Linux').strip('"'),'cpu':cpu_pct,'ram':round(100*(1-m['MemAvailable']/m['MemTotal']),1),'storage':round(100*disk.used/disk.total,1),'uptime_seconds':float(P('/proc/uptime').read_text().split()[0]),'network_bytes_second':max(0,(net()-n)/.25),'temperature_c':max(temps) if temps else None,'gpu':g,'tmux':bool(shutil.which('tmux'))}))
