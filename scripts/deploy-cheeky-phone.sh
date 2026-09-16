#!/usr/bin/env bash
# Runtime-only update. Deployment identity is supplied outside this repository.
set -euo pipefail
: "${DEPLOY_HOST:?Set the established SSH user@host}"
: "${DEPLOY_PATH:?Set the verified Apache document root}"
: "${LIVE_URL:?Set the HTTPS origin}"
: "${BASE_REF:?Set the reviewed pre-change source revision}"
DEPLOY_PORT="${DEPLOY_PORT:-2222}"
[[ "$DEPLOY_HOST" =~ ^[A-Za-z0-9_.@-]+$ && "$DEPLOY_HOST" != -* ]]
[[ "$DEPLOY_PATH" =~ ^/[A-Za-z0-9_./-]+$ && "$DEPLOY_PATH" != / && "$DEPLOY_PATH" != *..* ]]
[[ "$DEPLOY_PORT" =~ ^[0-9]+$ && "$LIVE_URL" == https://* ]]
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
for command in python3 node rsync curl ssh git; do command -v "$command" >/dev/null; done
[[ -z "$(git status --porcelain)" ]] || { echo 'A clean, committed checkout is required.' >&2; exit 2; }
git rev-parse --verify "$BASE_REF^{commit}" >/dev/null
for script in assets/cheeky-{phone,water,scene,lines,clips,audio}.js; do node --check "$script"; done
node --test tests/cheeky-*.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/build_publication.py
python3 scripts/publication_privacy.py --allowlist config/publication-privacy-allowlist.json site "${LIVE_URL%/}/"
review="$(mktemp -d)"
trap 'rm -rf -- "$review"' EXIT
python3 - "$BASE_REF" "$review" <<'PY'
import hashlib, json, subprocess, sys
from pathlib import Path
base, review = sys.argv[1], Path(sys.argv[2])
files=['cheeky-phone.html']+['assets/cheeky-'+n for n in ['phone.css','phone.js','water.js','scene.js','lines.js','clips.js','audio.js','george.mp3']]
manifest=[]
for name in files:
    old=subprocess.run(['git','show',base+':'+name],capture_output=True)
    if old.returncode not in (0,128): raise SystemExit('Could not read baseline source')
    manifest.append(dict(path=name, baseline=hashlib.sha256(old.stdout).hexdigest() if old.returncode==0 else None,sha256=hashlib.sha256((Path('build/publication')/name).read_bytes()).hexdigest()))
(review/'runtime.json').write_text(json.dumps(manifest,indent=2))
(review/'files.txt').write_text('\n'.join(files)+'\n')
PY
ssh_options=(-p "$DEPLOY_PORT" -o BatchMode=yes -o ConnectTimeout=15)
remote_stage="$(ssh "${ssh_options[@]}" "$DEPLOY_HOST" 'mktemp -d /var/tmp/cheeky-phone-deploy.XXXXXXXX')"
[[ "$remote_stage" =~ ^/var/tmp/cheeky-phone-deploy\.[A-Za-z0-9]+$ ]]
rsync -av --files-from="$review/files.txt" -e "ssh -p $DEPLOY_PORT -o BatchMode=yes -o ConnectTimeout=15" build/publication/ "$DEPLOY_HOST:$remote_stage/new/"
rsync -av -e "ssh -p $DEPLOY_PORT -o BatchMode=yes -o ConnectTimeout=15" "$review/runtime.json" scripts/apply-cheeky-phone.py "$DEPLOY_HOST:$remote_stage/"
ssh "${ssh_options[@]}" "$DEPLOY_HOST" python3 "$remote_stage/apply-cheeky-phone.py" "$DEPLOY_PATH" "$remote_stage"
printf 'Backup retained outside the web root: %s\n' "$remote_stage"
while IFS= read -r file; do
  mkdir -p "$review/verified/$(dirname "$file")"
  curl --fail --silent --show-error --location --max-time 30 --header 'Cache-Control: no-cache' "${LIVE_URL%/}/$file?cheeky-verify=$(date +%s)" -o "$review/verified/$file"
  cmp "build/publication/$file" "$review/verified/$file"
done < "$review/files.txt"
python3 scripts/publication_privacy.py --allowlist config/publication-privacy-allowlist.json site "${LIVE_URL%/}/"
printf 'Deployment and live crawl verified: %s/cheeky-phone.html\n' "${LIVE_URL%/}"
printf 'Physical sensor and audio qualification remains a separate check.\n'
