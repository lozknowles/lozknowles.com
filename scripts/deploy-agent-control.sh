#!/usr/bin/env bash
# Scoped deployment using the site's existing SSH/rsync/Apache process.
set -euo pipefail
: "${DEPLOY_HOST:?Set verified SSH host}"
: "${DEPLOY_PATH:?Set verified existing public document root}"
: "${LIVE_URL:?Set public HTTPS origin}"
: "${SITE_MEDIA_DIR:?Set reviewed media directory}"
: "${MEDIA_REVIEW_MANIFEST:?Set accepted media review manifest}"
DEPLOY_PORT=${DEPLOY_PORT:-2222}
[[ "$DEPLOY_HOST" =~ ^[A-Za-z0-9_.@-]+$ && "$DEPLOY_HOST" != -* ]] || exit 2
[[ "$DEPLOY_PATH" =~ ^/[A-Za-z0-9_./-]+$ && "$DEPLOY_PATH" != / && "$DEPLOY_PATH" != *..* ]] || exit 2
[[ "$DEPLOY_PORT" =~ ^[0-9]+$ && "$LIVE_URL" == https://* ]] || exit 2
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
test -z "$(git status --porcelain)" || { echo 'Commit the reviewed site source before deployment.'; exit 2; }
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/build_publication.py
curl --fail --silent --show-error --location --output /dev/null https://github.com/lozknowles/agent-control/releases/tag/v4.1.0
prep=$(mktemp -d /var/tmp/agent-control-site-local.XXXXXXXX)
python3 - "$prep" "$SITE_MEDIA_DIR" "$MEDIA_REVIEW_MANIFEST" <<'PY'
import pathlib,json,hashlib,subprocess,shutil,sys
stage,media,accepted=map(pathlib.Path,sys.argv[1:])
review=json.loads(accepted.read_text())
assert review['privacyAccepted'] is True and review['synchronizationAccepted'] is True and review['listeningAccepted'] is True
files=['assets/cv.css','agent-control.html','assets/agent-control.css','index.html']
names=['agent-control-overview.mp4','agent-control-overview-poster.jpg','agent-control-overview.en.vtt','agent-control-overview-transcript.html']
rows=[]
for name in files+['assets/videos/'+n for n in names]:
    source=media/pathlib.Path(name).name if name.startswith('assets/videos/') else pathlib.Path('build/publication')/name
    sha=hashlib.sha256(source.read_bytes()).hexdigest()
    if name.startswith('assets/videos/'):assert review['files'][source.name]['sha256']==sha,source.name
    baseline=None
    if name in ['index.html','assets/cv.css']:
        baseline=hashlib.sha256(subprocess.check_output(['git','show','b846a4165a4628be48274089bbd14d2d3bb89428:'+name])).hexdigest()
    dest=stage/'new'/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,dest)
    rows.append(dict(path=name,sha256=sha,baselineSha256=baseline))
(stage/'deploy-manifest.json').write_text(json.dumps(dict(siteCommit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),files=rows),indent=2))
PY
ssh_options=(-p "$DEPLOY_PORT" -o BatchMode=yes -o ConnectTimeout=15)
remote_stage=$(ssh "${ssh_options[@]}" "$DEPLOY_HOST" 'mktemp -d /var/tmp/agent-control-site-deploy.XXXXXXXX')
[[ "$remote_stage" =~ ^/var/tmp/agent-control-site-deploy\.[A-Za-z0-9]+$ ]] || exit 2
rsync -a -e "ssh -p $DEPLOY_PORT -o BatchMode=yes" "$prep/" "$DEPLOY_HOST:$remote_stage/"
scp -P "$DEPLOY_PORT" scripts/apply-agent-control-site.py "$DEPLOY_HOST:$remote_stage/apply.py"
ssh "${ssh_options[@]}" "$DEPLOY_HOST" python3 "$remote_stage/apply.py" "$DEPLOY_PATH" "$remote_stage"
python3 scripts/publication_privacy.py --allowlist config/publication-privacy-allowlist.json site "${LIVE_URL%/}/"
printf 'Scoped files installed. Rollback record: %s/rollback.json\n' "$remote_stage"
printf 'Complete actual public playback, seeking, captions and mobile checks: %s/agent-control.html\n' "${LIVE_URL%/}"
