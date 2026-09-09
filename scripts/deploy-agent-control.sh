#!/usr/bin/env bash
# Run on the existing hpubuntu media host. Stage only the reviewed files.
set -euo pipefail
: "${SITE_MEDIA_DIR:?Set accepted media directory}"
: "${MEDIA_REVIEW_MANIFEST:?Set accepted media review manifest}"
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
test -z "$(git status --porcelain)" || { echo 'Commit the reviewed site source first.'; exit 2; }
test "$(hostname -s)" = hpubuntu
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/build_publication.py
curl --fail --silent --show-error --location --output /dev/null https://github.com/lozknowles/agent-control/releases/tag/v4.1.0
prep=$(mktemp -d /var/tmp/agent-control-site-local.XXXXXXXX)
python3 - "$prep" "$SITE_MEDIA_DIR" "$MEDIA_REVIEW_MANIFEST" <<'PY'
from pathlib import Path
import json,hashlib,subprocess,shutil,sys
stage,media,accepted=map(Path,sys.argv[1:])
review=json.loads(accepted.read_text())
assert review['privacyAccepted'] is True and review['synchronizationAccepted'] is True and review['operatorAccepted'] is True
assert review['publicReady'] is True
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
baseline={'index.html':'7db569c57eba02ec67fdcf95cb65c9103293d862560e70162b679067bb355648','assets/cv.css':'c0c5675930bcb1c4ac918f254f6a994e6cffb768f94741402fca04009dedaa7f'}
files=['assets/cv.css','agent-control.html','assets/agent-control.css','index.html']
names=['agent-control-overview-poster.jpg','agent-control-overview.en.vtt','agent-control-overview-transcript.html']
commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
for kind,paths in [('static',files+['assets/videos/'+n for n in names]),('media-origin',['agent-control-overview.mp4'])]:
    rows=[]
    target=stage/kind
    for name in paths:
        source=media/Path(name).name if name.startswith('assets/videos/') or kind=='media-origin' else Path('build/publication')/name
        digest=sha(source)
        if source.parent==media:assert review['files'][source.name]['sha256']==digest,source.name
        dest=target/'new'/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,dest)
        rows.append(dict(path=name,sha256=digest,baselineSha256=baseline.get(name)))
    manifest=dict(siteCommit=commit,kind=kind,files=rows)
    if kind=='static':
        original=json.loads(Path('/fast/qualification/poe-dashboard-operator-20260908/site-access-review-20260909/server-readonly.json').read_text())
        manifest['protected']=[dict(path=n,sha256=original['live'][n]['sha256']) for n in ['cheeky-phone.html','assets/cheeky-phone.css','assets/cheeky-phone.js','assets/cheeky-nav.css']]
    (target/'deploy-manifest.json').write_text(json.dumps(manifest,indent=2))
PY
remote_stage=$(ssh -p 2222 -o BatchMode=yes -o ConnectTimeout=15 cottageserver 'mktemp -d /var/tmp/agent-control-site-deploy.XXXXXXXX')
[[ "$remote_stage" =~ ^/var/tmp/agent-control-site-deploy\.[A-Za-z0-9]+$ ]]
rsync -a -e 'ssh -p 2222 -o BatchMode=yes' "$prep/static/" "cottageserver:$remote_stage/"
scp -P 2222 scripts/apply-agent-control-site.py "cottageserver:$remote_stage/apply.py"
# The existing Apache MP4 rule proxies to this existing private media origin.
python3 scripts/apply-agent-control-site.py /fast/media/lozknowles.com "$prep/media-origin"
curl --fail --silent --show-error --range 0-1023 --output "$prep/media-range.bin" --dump-header "$prep/media-range.headers" https://lozknowles.com/assets/videos/agent-control-overview.mp4
grep -q '206 Partial Content' "$prep/media-range.headers"
ssh -p 2222 -o BatchMode=yes cottageserver python3 "$remote_stage/apply.py" /var/www/lozknowles.com/public_html/dist "$remote_stage"
printf 'Static rollback: cottageserver:%s/rollback.json\nMedia rollback: hpubuntu:%s/media-origin/rollback.json\n' "$remote_stage" "$prep"
printf '%s\n' "$remote_stage" > "$prep/remote-stage.txt"
# Run the full existing scanner separately through the trusted LAN route to avoid
# Fail2ban bans from required negative probes. Retain all existing findings and
# compare before/after. Do not alter scan rules, allowlists or authentication.
printf 'Installed. Complete public browser checks and unchanged full before/after privacy scan.\n'
