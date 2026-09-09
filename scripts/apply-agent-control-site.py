"""Apply only the reviewed overview files from an existing private staging folder."""
import hashlib,json,os,shutil,sys,tempfile
from pathlib import Path

def digest(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

root,stage=map(Path,sys.argv[1:3])
root=root.resolve();stage=stage.resolve()
if not root.is_dir() or stage==root or stage.is_relative_to(root):
    raise SystemExit('Existing document root and staging outside it are required.')
manifest=json.loads((stage/'deploy-manifest.json').read_text())
files=manifest['files']
expected={'index.html','assets/cv.css','agent-control.html','assets/agent-control.css',
    'assets/videos/agent-control-overview-poster.jpg',
    'assets/videos/agent-control-overview.en.vtt','assets/videos/agent-control-overview-transcript.html',
    'assets/videos/agent-control-live-run-poster.jpg','assets/videos/agent-control-live-run-transcript.html',
    'assets/videos/agent-control-cache-qualification-poster.jpg'}
if manifest.get('kind')=='media-origin':expected={'agent-control-overview.mp4','agent-control-live-run.mp4','agent-control-cache-qualification.mp4'}
if {e['path'] for e in files}!=expected or len(files)!=len(expected):
    raise SystemExit('Unexpected publication file list.')
protected=manifest.get('protected',[])
for e in protected:
    target=root/e['path']
    if not target.resolve().is_relative_to(root) or not target.is_file() or digest(target)!=e['sha256']:
        raise SystemExit('Protected existing content drift: '+e['path'])
for e in files:
    target=root/e['path'];source=stage/'new'/e['path']
    if not target.resolve().is_relative_to(root) or target.is_symlink() or not target.parent.is_dir():
        raise SystemExit('Unsafe or absent publication directory: '+e['path'])
    if any(p.is_symlink() for p in [target.parent,*target.parent.parents] if p!=root and p.is_relative_to(root)):
        raise SystemExit('Symlink publication directory: '+e['path'])
    current=digest(target) if target.exists() else None
    if current!=e['baselineSha256']:
        raise SystemExit('Live source drift; no files changed: '+e['path'])
    if not source.is_file() or digest(source)!=e['sha256']:
        raise SystemExit('Staged file hash mismatch: '+e['path'])
backup=stage/'backup';backup.mkdir(mode=0o700)
for e in files:
    target=root/e['path'];e['existed']=target.exists()
    if e['existed']:
        saved=backup/e['path'];saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
(stage/'rollback.json').write_text(json.dumps(manifest,indent=2))

def replace(source,target):
    fd,name=tempfile.mkstemp(dir=target.parent,prefix=target.name+'.agent-control-upload-')
    temp=Path(name)
    try:
        with os.fdopen(fd,'wb') as dst,source.open('rb') as src:
            shutil.copyfileobj(src,dst);dst.flush();os.fsync(dst.fileno())
        temp.chmod(0o644);os.replace(temp,target)
    finally:temp.unlink(missing_ok=True)

written=[]
try:
    for e in sorted(files,key=lambda e:e['path']=='index.html'):
        target=root/e['path']
        if (digest(target) if target.exists() else None)!=e['baselineSha256']:
            raise RuntimeError('Live file changed during deployment: '+e['path'])
        replace(stage/'new'/e['path'],root/e['path'])
        written.append(e)
    for e in files:
        assert digest(root/e['path'])==e['sha256'],e['path']
    for e in protected:assert digest(root/e['path'])==e['sha256'],e['path']
except BaseException:
    # Restore the old menu first so no link points to partially restored media.
    for e in sorted(written,key=lambda e:e['path']!='index.html'):
        target=root/e['path']
        if not target.exists() or digest(target)!=e['sha256']:
            raise RuntimeError('Concurrent change prevents automatic rollback: '+e['path'])
        if e['existed']:replace(backup/e['path'],target)
        else:target.unlink(missing_ok=True)
    raise
print(json.dumps({'status':'FILES_INSTALLED_PUBLIC_BROWSER_CHECK_PENDING','files':len(files),'rollback':str(stage/'rollback.json')}))
