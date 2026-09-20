# Public LLM Fight Club

The homepage links to `/llm-debate.html`, including the workbench entry previously
labelled Voice Clone. The shared site menu and typography are rendered into the
page by `scripts/site_shell.py`. Its embedded studio and the standalone link both
open `/llm-debate/audio.html` without a login.

## Application source

- Repository: https://github.com/lozknowles/llm-fight-club
- Branch: `feature/public-llm-debate-20260920`
- Release revision: `b985a9ffc2a89d642b2b7217de70bcadc80dee4a`
- Server entry: `server-spoken.mjs`, with `FIGHT_CLUB_PUBLIC=1` and
  `FIGHT_CLUB_CSM_MENU_ENABLED=1`.
- Public deployment and visitor isolation: `docs/PUBLIC-DEBATE.md` in that repo.

All public formats default to CSM Fighter A and Fighter B. A third speaker or
referee defaults to CSM Mallow. These are original synthetic voices. The existing
speech capability prepares the audio before playback, so the page explains the
wait between turns. Saved replay uses the already-generated audio; CSM audio
downloads remain unavailable under the existing export policy.

The application is a separate instance with its own visitor-owned conversation
storage. Its route has no HTTP Basic Auth and does not require a file-store
session. The private Area 51 instance, voice enrolment and original Voice Clone
service retain their existing access controls. No private conversations or voice
profiles are copied into the public application.

## Publication

`scripts/build_publication.py` publishes the wrapper, its CSS and iframe-height
handler. The running studio is served by a separate reverse proxy under
`/llm-debate/`; it is not copied into the static artefact. The privacy scanner
recognizes exactly `llm-debate/audio.html` as a managed route, and continues to
reject missing local assets and unlisted files.

The static release changes only `index.html`, `llm-debate.html`,
`assets/llm-debate.css` and `assets/llm-debate.js`. Deployment uses checksums,
preflight checks of the existing site and a rollback copy outside the webroot.

## Verification

The pinned application passed all 126 tests on its Linux release host, including
public visitor isolation, cross-origin rejection, fixed CSM voice identities,
saved replay and the audio-export restriction. The website's publication tests,
JavaScript checks and artefact privacy scan are required before publication.

Live checks on 20 September 2026 covered the homepage link, anonymous access to
both public pages, and a completed two-turn CSM conversation using Fighter A and
Fighter B. Both saved turns replayed, and application pause/resume controls worked.
The public saved-debate button reopens within the embedded studio, avoiding a
new-tab popup. All four formats selected CSM voices by default; the optional
referee selected Mallow.

Desktop and 390-by-844 browser layouts had no horizontal overflow. An independent
browser session had an empty conversation list and could not access the test
conversation. Voice Lab remained unavailable from the public route, and the old
Voice Clone endpoint retained its login. A browser viewport check does not qualify
audio behavior on a physical phone or Safari.
