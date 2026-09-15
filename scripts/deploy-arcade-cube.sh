#!/usr/bin/env bash
# Publish only the arcade page and its five new assets, with rollback outside the web root.
set -euo pipefail
: "${DEPLOY_HOST:?Set the verified SSH destination}"
: "${DEPLOY_PATH:?Set the verified public document root}"
: "${LIVE_URL:?Set the HTTPS origin}"
: "${BASELINE_ARCADE_SHA256:?Set the reviewed live arcade SHA-256}"
: "${RELEASE_REV:?Set the source commit being published}"
DEPLOY_PORT="${DEPLOY_PORT:-2222}"
[[ "$DEPLOY_HOST" =~ ^[A-Za-z0-9_.@-]+$ && "$DEPLOY_HOST" != -* ]] || exit 2
[[ "$DEPLOY_PATH" =~ ^/[A-Za-z0-9_./-]+$ && "$DEPLOY_PATH" != / && "$DEPLOY_PATH" != *..* ]] || exit 2
[[ "$DEPLOY_PORT" =~ ^[0-9]+$ && "$LIVE_URL" == https://* ]] || exit 2
[[ "$BASELINE_ARCADE_SHA256" =~ ^[a-f0-9]{64}$ && "$RELEASE_REV" =~ ^[a-f0-9]{40}$ ]] || exit 2
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
for command in python3 node rsync curl ssh; do command -v "$command" >/dev/null; done
node --check assets/arcade-cube.js
node --check assets/arcade-games.js
node --test tests/arcade-games.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/build_publication.py
ssh_options=(-p "$DEPLOY_PORT" -o BatchMode=yes -o ConnectTimeout=15)
stage="$(ssh "${ssh_options[@]}" "$DEPLOY_HOST" 'mktemp -d /var/tmp/arcade-cube-deploy.XXXXXXXX')"
[[ "$stage" =~ ^/var/tmp/arcade-cube-deploy\.[A-Za-z0-9]+$ ]] || exit 2
files="$(mktemp)"
trap 'rm -f "$files"' EXIT
cat > "$files" <<'FILES'
assets/three-0.160.0.module.min.js
assets/three-LICENSE.txt
assets/arcade-games.js
assets/arcade-cube.css
assets/arcade-cube.js
arcade.html
FILES
rsync -a --files-from="$files" -e "ssh -p $DEPLOY_PORT -o BatchMode=yes -o ConnectTimeout=15" build/publication/ "$DEPLOY_HOST:$stage/new/"
ssh "${ssh_options[@]}" "$DEPLOY_HOST" python3 - "$DEPLOY_PATH" "$stage" "$BASELINE_ARCADE_SHA256" "$RELEASE_REV" <<'PY'
import hashlib,json,os,shutil,sys
from pathlib import Path
root,stage=map(Path,sys.argv[1:3])
baseline,revision=sys.argv[3:5]
files=['assets/three-0.160.0.module.min.js','assets/three-LICENSE.txt','assets/arcade-games.js','assets/arcade-cube.css','assets/arcade-cube.js','arcade.html']
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if not root.is_dir() or not (root/'arcade.html').is_file():
    raise SystemExit('The expected live arcade page is missing.')
if root.resolve() in stage.resolve().parents:
    raise SystemExit('The backup must be outside the public root.')
if digest(root/'arcade.html') not in (baseline,digest(stage/'new/arcade.html')):
    raise SystemExit('The live arcade changed after review; nothing was replaced.')
unchanged={p:digest(root/p) for p in ['index.html','murmuration.html','.htaccess','assets/arcade.css']}
manifest=[]
for name in files:
    target=root/name
    if target.is_symlink() or target.parent.is_symlink() or not target.parent.is_dir():
        raise SystemExit('Unexpected deployment target: '+name)
    if not (stage/'new'/name).is_file():
        raise SystemExit('Missing staged asset: '+name)
    manifest.append({'path':name,'existed':target.exists()})
    if target.exists():
        backup=stage/'backup'/name
        backup.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(target,backup)
(stage/'rollback.json').write_text(json.dumps(manifest,indent=2))
try:
    for name in files:
        target=root/name
        temporary=target.with_name('.'+target.name+'.arcade-upload')
        shutil.copyfile(stage/'new'/name,temporary)
        temporary.chmod(0o644)
        os.replace(temporary,target)
    for name in files:
        assert digest(root/name)==digest(stage/'new'/name),name
    assert unchanged=={p:digest(root/p) for p in unchanged},'unrelated live files changed'
except Exception:
    for entry in manifest:
        target=root/entry['path']
        if entry['existed']:
            temporary=target.with_name('.'+target.name+'.arcade-rollback')
            shutil.copy2(stage/'backup'/entry['path'],temporary)
            os.replace(temporary,target)
        else:
            target.unlink(missing_ok=True)
    raise
report={'source_commit':revision,'files':{name:digest(root/name) for name in files},'unchanged':unchanged}
(stage/'release.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
print('ROLLBACK_DIR='+str(stage))
PY
python3 - "$LIVE_URL" "$ROOT/build/publication" "$RELEASE_REV" <<'PY'
import hashlib,json,sys,urllib.request
from pathlib import Path
origin,root,revision=sys.argv[1],Path(sys.argv[2]),sys.argv[3]
files=['arcade.html','assets/arcade-cube.js','assets/arcade-cube.css','assets/arcade-games.js','assets/three-0.160.0.module.min.js','assets/three-LICENSE.txt']
for name in files:
    request=urllib.request.Request(origin.rstrip('/')+'/'+name+'?arcade-release='+revision,headers={'Cache-Control':'no-cache'})
    with urllib.request.urlopen(request,timeout=30) as response:
        data=response.read()
        assert response.status==200,name
        assert hashlib.sha256(data).digest()==hashlib.sha256((root/name).read_bytes()).digest(),name
        if name=='arcade.html':
            assert 'no-cache' in response.headers.get('Cache-Control',''), 'HTML must revalidate'
            assert "script-src 'self'" in response.headers.get('Content-Security-Policy',''), 'The site CSP must remain enabled'
print('LIVE_VERIFICATION=passed; six file hashes match; HTML cache and CSP verified')
PY
printf 'Published arcade cube at %s/arcade.html\n' "${LIVE_URL%/}"
