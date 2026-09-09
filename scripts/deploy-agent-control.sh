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
baseline={
    'index.html':'2581fdaaaa45db273be5e62ac2a057ce82652a0c3761728d4476fc99b27a8c5b',
    'assets/cv.css':'1fb27ed09044957b6eaa75111246988b8be8672af2608e1e9688f876009100ad',
    'agent-control.html':'111326efae179da49039418a7322cdd549a95900cd96cd54a5a395f75a9471bc',
    'assets/agent-control.css':'9e419249b9072803b277ab9e53b1b391ae2f612069a19943b5d51e40d159fa88',
    'assets/videos/agent-control-overview-poster.jpg':'d7a6048ebbc84884a004b9e648f3ebb5ea0ca21e5b7ba7432734ea705cb3bfe2',
    'assets/videos/agent-control-overview.en.vtt':'33f4f1e6cd13fc514b6402190615e555e49372fe319ed80a31dd4a493e53e47b',
    'assets/videos/agent-control-overview-transcript.html':'8c35389d8f48faa19a7d36b5ecd861f88b5ff603d715099244bec3ea88e07628',
    'assets/videos/agent-control-live-run-poster.jpg':'3b4cad7aae2387e67c8942f476145aa27e6b26cccbb0f33a50e771a996930204',
    'assets/videos/agent-control-live-run-transcript.html':'76ea7a8e8a3d840b7419e205401ca639d4a364d397fd49114a3e7d00b6ec552c',
    'agent-control-overview.mp4':'6b4c0326bf62e74fc3fdbe027d9f780195c30e3b7bb16b91c991cc0197c912a8',
    'agent-control-live-run.mp4':'cb61e287a5fa711e9a351510cde60253c63238abe481cf2fa509c82bb4020cf1',
}
files=['assets/cv.css','agent-control.html','assets/agent-control.css','index.html']
names=['agent-control-overview-poster.jpg','agent-control-overview.en.vtt','agent-control-overview-transcript.html',
       'agent-control-live-run-poster.jpg','agent-control-live-run-transcript.html']
commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
for kind,paths in [('static',files+['assets/videos/'+n for n in names]),
                   ('media-origin',['agent-control-overview.mp4','agent-control-live-run.mp4'])]:
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
        protected={
            'cheeky-phone.html':'6a7d80e8ef4ce79f2b76feddf998f9bca824103dd3a7d7ec3d8c2ed640f57bc2',
            'assets/cheeky-phone.css':'e13cec4510de9320a53267a0daae5e6d19ba60f821b11d54a92ccb2da115df76',
            'assets/cheeky-phone.js':'7e52bdd8fb785a53200c83ad89478bb1174c6c94f3e645cbe6e2174c4bcafde3',
            'assets/cheeky-nav.css':'012e7a07568f9f0f646f9a159466a3643ba8445881eb1763a8d27fc1debb7331',
        }
        manifest['protected']=[dict(path=name,sha256=digest) for name,digest in protected.items()]
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
curl --fail --silent --show-error --range 0-1023 --output "$prep/live-run-range.bin" --dump-header "$prep/live-run-range.headers" https://lozknowles.com/assets/videos/agent-control-live-run.mp4
grep -q '206 Partial Content' "$prep/live-run-range.headers"
ssh -p 2222 -o BatchMode=yes cottageserver python3 "$remote_stage/apply.py" /var/www/lozknowles.com/public_html/dist "$remote_stage"
printf 'Static rollback: cottageserver:%s/rollback.json\nMedia rollback: hpubuntu:%s/media-origin/rollback.json\n' "$remote_stage" "$prep"
printf '%s\n' "$remote_stage" > "$prep/remote-stage.txt"
# Run the full existing scanner separately through the trusted LAN route to avoid
# Fail2ban bans from required negative probes. Retain all existing findings and
# compare before/after. Do not alter scan rules, allowlists or authentication.
printf 'Installed. Complete public browser checks and unchanged full before/after privacy scan.\n'
