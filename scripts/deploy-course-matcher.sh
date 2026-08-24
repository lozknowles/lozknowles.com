#!/usr/bin/env bash
set -euo pipefail

SOURCE_REPO="${COURSE_MATCHER_REPO:-/fast/repos/course-matcher}"
DEPLOY_HOST="${DEPLOY_HOST:-cottageserver}"
DEPLOY_PORT="${DEPLOY_PORT:-2222}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/lozknowles.com}"
DEPLOY_DIR="${DEPLOY_DIR:-$DEPLOY_ROOT/lincoln-course-match}"
PUBLIC_URL="${PUBLIC_URL:-https://lozknowles.com/lincoln-course-match/}"
REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:-/home/loz/deploy-backups/lozknowles.com}"
STAMP="$(date +%Y%m%dT%H%M%S)"

cd "$SOURCE_REPO"

if [ "$(git branch --show-current)" != "main" ]; then
  echo "Refusing deploy: course-matcher is not on main" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Refusing deploy: course-matcher worktree is not clean" >&2
  git status --short >&2
  exit 1
fi

npm install --package-lock=false
npm test
npm run vendor

for f in index.html styles.css app.js matcher-core.js courses.js; do
  test -s "$f"
done
for f in vendor/tesseract/tesseract.min.js vendor/tesseract/worker.min.js vendor/pdfjs/pdf.mjs vendor/pdfjs/pdf.worker.mjs; do
  test -s "$f"
done

ssh -p "$DEPLOY_PORT" "$DEPLOY_HOST" \
  "mkdir -p '$REMOTE_BACKUP_DIR'; if [ -d '$DEPLOY_DIR' ]; then tar -C '$DEPLOY_ROOT' -czf '$REMOTE_BACKUP_DIR/lincoln-course-match-$STAMP.tgz' lincoln-course-match; fi; mkdir -p '$DEPLOY_DIR'"

rsync -av --delete-after \
  -e "ssh -p $DEPLOY_PORT" \
  index.html styles.css app.js matcher-core.js courses.js vendor \
  "$DEPLOY_HOST:$DEPLOY_DIR/"

curl -fsS "$PUBLIC_URL?release=1.0.0-$STAMP" | grep -q 'Turn your results into useful course conversations'
curl -fsS "$PUBLIC_URL?release=1.0.0-$STAMP" | grep -q 'What are you interested in?'

echo "Course Match 1.0.0 deployed and verified at $PUBLIC_URL"
