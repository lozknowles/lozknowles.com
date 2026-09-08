#!/usr/bin/env bash
# Run from a checkout with Python 3, Node, rsync, curl and SSH key access.
set -euo pipefail
: "${DEPLOY_HOST:?Set DEPLOY_HOST to the SSH user@host}"
: "${DEPLOY_PATH:?Set DEPLOY_PATH to the verified live document root}"
: "${LIVE_URL:?Set LIVE_URL to the HTTPS site origin}"
DEPLOY_PORT="${DEPLOY_PORT:-2222}"
[[ "$DEPLOY_HOST" =~ ^[A-Za-z0-9_.@-]+$ && "$DEPLOY_HOST" != -* ]] || exit 2
[[ "$DEPLOY_PATH" =~ ^/[A-Za-z0-9_./-]+$ && "$DEPLOY_PATH" != / && "$DEPLOY_PATH" != *..* ]] || exit 2
[[ "$DEPLOY_PORT" =~ ^[0-9]+$ && "$LIVE_URL" == https://* ]] || exit 2
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
for command in python3 node rsync curl ssh git; do command -v "$command" >/dev/null; done
node --check assets/cheeky-phone.js
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/build_publication.py
ssh_options=(-p "$DEPLOY_PORT" -o BatchMode=yes -o ConnectTimeout=15)
# The parent homepage is checked on the server before replacing any live file.
baseline="$(git show e6bad46dd1acee2f1711ec7e6e48548eeeb4d9b0:index.html | sha256sum | cut -d ' ' -f 1)"
replacement="$(sha256sum build/publication/index.html | cut -d ' ' -f 1)"
remote_stage="$(ssh "${ssh_options[@]}" "$DEPLOY_HOST" 'mktemp -d /var/tmp/cheeky-phone-deploy.XXXXXXXX')"
[[ "$remote_stage" =~ ^/var/tmp/cheeky-phone-deploy\.[A-Za-z0-9]+$ ]] || exit 2
file_list="$(mktemp)"
trap 'rm -f "$file_list"' EXIT
cat > "$file_list" <<'FILES'
index.html
cheeky-phone.html
assets/cheeky-phone.css
assets/cheeky-phone.js
assets/cheeky-nav.css
FILES
rsync -av --files-from="$file_list" -e "ssh -p $DEPLOY_PORT -o BatchMode=yes -o ConnectTimeout=15" build/publication/ "$DEPLOY_HOST:$remote_stage/new/"
ssh "${ssh_options[@]}" "$DEPLOY_HOST" python3 - "$DEPLOY_PATH" "$remote_stage" "$baseline" "$replacement" <<'PY'
import hashlib, json, os, shutil, sys
from pathlib import Path
root, stage = map(Path, sys.argv[1:3])
baseline, replacement = sys.argv[3:5]
files = ['index.html', 'cheeky-phone.html', 'assets/cheeky-phone.css', 'assets/cheeky-phone.js', 'assets/cheeky-nav.css']
if not root.is_dir() or not (root/'index.html').is_file():
    raise SystemExit('Verified document root and existing homepage required.')
if root.resolve() in stage.resolve().parents:
    raise SystemExit('Backup must be outside the public root.')
if hashlib.sha256((root/'index.html').read_bytes()).hexdigest() not in (baseline, replacement):
    raise SystemExit('Live homepage differs from the checked source. Reconcile its menu changes before deploying; nothing has been replaced.')
for name in files:
    target = root/name
    if target.is_symlink() or target.parent.is_symlink():
        raise SystemExit('Refusing to overwrite a symlink: '+name)
    if not target.parent.is_dir():
        raise SystemExit('Expected existing public directory: '+str(target.parent))
backup = stage/'backup'
backup.mkdir()
manifest = []
# Back up all targets before the first write; upload assets before the menu.
for name in files:
    target = root/name
    exists = target.exists()
    manifest.append({'path':name, 'existed':exists})
    if exists:
        dest=backup/name; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(target,dest)
(stage/'rollback.json').write_text(json.dumps(manifest))
ordered = files[1:] + files[:1]
try:
    for name in ordered:
        target=root/name; temp=target.with_name(target.name+'.cheeky-upload')
        shutil.copyfile(stage/'new'/name,temp); temp.chmod(0o644); os.replace(temp,target)
    for name in files:
        assert (root/name).read_bytes()==(stage/'new'/name).read_bytes(), name
except Exception:
    for entry in manifest:
        target=root/entry['path']
        if entry['existed']: shutil.copy2(backup/entry['path'], target)
        else: target.unlink(missing_ok=True)
    raise
print('Transferred five files. Retained rollback directory: '+str(stage))
PY
printf 'Backup retained outside the web root: %s\n' "$remote_stage"
verification="$(mktemp -d)"
trap 'rm -f "$file_list"; rm -rf "$verification"' EXIT
for file in index.html cheeky-phone.html assets/cheeky-phone.css assets/cheeky-phone.js assets/cheeky-nav.css; do
  mkdir -p "$verification/$(dirname "$file")"
  curl --fail --silent --show-error --location --max-time 30 --header 'Cache-Control: no-cache' "${LIVE_URL%/}/$file?cheeky-verify=$(date +%s)" -o "$verification/$file"
  cmp "build/publication/$file" "$verification/$file"
done
python3 scripts/publication_privacy.py --allowlist config/publication-privacy-allowlist.json site "${LIVE_URL%/}/"
printf 'Deployment verified: %s/cheeky-phone.html\n' "${LIVE_URL%/}"
printf 'Next: open on a physical phone, allow motion, test face-down speech and Stop.\n'
