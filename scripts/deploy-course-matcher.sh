#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_REPO="${COURSE_MATCHER_REPO:?Set COURSE_MATCHER_REPO to the canonical checkout}"
DEPLOY_HOST="${DEPLOY_HOST:?Set DEPLOY_HOST outside the repository}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_ROOT="${DEPLOY_ROOT:?Set DEPLOY_ROOT outside the repository}"
DEPLOY_DIR="${DEPLOY_DIR:-$DEPLOY_ROOT/lincoln-course-match}"
PUBLIC_URL="${PUBLIC_URL:?Set PUBLIC_URL to the published Course Match route}"
REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:?Set REMOTE_BACKUP_DIR outside the document root}"
PRIVACY_CHECK="${PUBLICATION_PRIVACY_CHECK:-$SCRIPT_DIR/publication_privacy.py}"
PRIVACY_ALLOWLIST="${PUBLICATION_PRIVACY_ALLOWLIST:-$SCRIPT_DIR/../config/publication-privacy-allowlist.json}"
COURSE_BUILD="${COURSE_MATCHER_PUBLICATION_BUILD:-$SCRIPT_DIR/build_course_matcher_publication.py}"
PYTHON="${PYTHON:-python3}"
STAMP="$(date +%Y%m%dT%H%M%S)"
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

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

"$PYTHON" "$COURSE_BUILD" "$SOURCE_REPO" "$STAGE_DIR"
"$PYTHON" "$PRIVACY_CHECK" --allowlist "$PRIVACY_ALLOWLIST" artifact "$STAGE_DIR"

ssh -p "$DEPLOY_PORT" "$DEPLOY_HOST" \
  "mkdir -p '$REMOTE_BACKUP_DIR'; if [ -d '$DEPLOY_DIR' ]; then tar -C '$DEPLOY_ROOT' -czf '$REMOTE_BACKUP_DIR/lincoln-course-match-$STAMP.tgz' lincoln-course-match; fi; mkdir -p '$DEPLOY_DIR'"

rsync -av --delete-after \
  -e "ssh -p $DEPLOY_PORT" \
  "$STAGE_DIR/" \
  "$DEPLOY_HOST:$DEPLOY_DIR/"

curl -fsS "$PUBLIC_URL?release=1.0.0-$STAMP" | grep -q 'Turn your results into useful course conversations'
curl -fsS "$PUBLIC_URL?release=1.0.0-$STAMP" | grep -q 'What are you interested in?'

echo "Course Match 1.0.0 deployed and verified at $PUBLIC_URL"
