# lozknowles.com

Static files for [lozknowles.com](https://lozknowles.com), including the site's images, scripts, styles, and optional looping background music.

The public professional profile is generated from `professional-profile-source.md` by
`scripts/build-professional-profile.py`. It intentionally omits direct contact details,
precise location, education history, named employer chronology, and community-role detail.
The profile links to a rotating set of supplied professional references at
`/references.html`; direct telephone and email details are not published.

## Interactive experiments

- **Arcade** — `/arcade.html`, beside Murmuration in the desktop and mobile navigation. A public retro page connects the games that sparked an interest in computing with the existing Space Bike story. The standalone arcade sequence runs from Invaders through Pac-Man, Bomberman, the vector tunnel, Tempest and Kong's ramp finale. Play, pause, replay, a scrubber, chapter selection and full screen control the same CSS animation timeline. Device reduced-motion preferences and tab visibility pause playback. The sequence loops after 134 seconds. Area 51 retains its separate protected link and original background.

  `assets/arcade-scene.html` and `assets/arcade-sequence.css` are the self-contained SVG/CSS export of the existing sequence, with the background brightened for standalone viewing. `arcade.js` synchronizes their animations; `arcade.css` supplies the cabinet and story layout. Only these public assets are included by the publication builder. There is no dependency on the protected portal.

- **Cheeky Phone** — `/cheeky-phone.html`, linked in desktop navigation, mobile actions and the workbench. Tap Start to grant motion permission and hear occasional browser-spoken quips. A downward-facing screen triggers “Charming. I know when I’m not wanted.” after a stable reading and the selected cooldown. Includes voice choice, text-only mode, a sample button, Stop, permission/no-sensor feedback, and automatic pause when hidden. No sensor data is recorded or uploaded. Orientation cannot establish body posture; real-device speech and sensor qualification is still required. Included in the publication allowlist.

- **Murmuration** — added 8 August 2026 at `/murmuration.html`. An interactive flock of 10–10,000 starlings that responds to a mouse, touch input, or stylus-controlled bird of prey. Each starling follows its seven closest influential neighbours with distance, field-of-view, turn-rate, variable-speed, and locally propagated fear behaviours for more lifelike flight. Birds also move through simulated depth: distant birds are smaller and paler, nearby birds are larger and darker, depth alters neighbour influence, and near layers pass in front of far ones. The optional **Ground view** places a stationary observer beneath a deep half-mile volume of sky. A checked-by-default **Auto track** toggle uses a coarse three-dimensional density field to find the busiest part of the murmuration and smoothly turn the observer's head toward it; manual drag, swipe, and arrow-key looks temporarily take priority before automatic tracking resumes. Switching Auto track off retains a fully manual view. The overhead viewpoint graphic marks the tracked dense core and current viewing cone. In this mode, flock alignment, cohesion, and separation operate across all three dimensions. A **Speed** slider accelerates the full simulation from its normal `1×` rate up to `5×`, including motion, steering response, depth, fear decay, and timed formations. A **Dusk sky** toggle adds a rising cratered moon, warm afterglow near the horizon, and denser animated grey cloud banks; the existing **Clouds** switch controls cloud visibility in both sky modes. In Ground view the moon is anchored to the distant sky and responds to head movement with much less apparent parallax than the nearby flock. Camera movement changes bird positions on screen without changing their flight-controlled silhouette orientation. Occasional formation events compress the flock into dark knots before accelerating it into long twisting ribbons with inward, outward, and toward-camera vortex waves. The flock-size input defaults to 2,500, and spatial neighbour indexing keeps larger flocks practical. An **Avoid edges** checkbox switches the standard view between seamless screen wrapping and a soft bounding box. The page is linked from both the desktop primary navigation and a dedicated mobile navigation action, and uses `assets/murmuration.css` and `assets/murmuration.js`.

Build the allowlisted public artefact, then serve that directory rather than the
repository root:

```sh
python3 scripts/build_publication.py
npx serve build/publication
```

## Deployment

The site remains build-free at runtime, but publication has a deliberate privacy
boundary. `scripts/build_publication.py` copies only the public runtime files to
`build/publication` and fails if the finished artefact contains source maps,
source-only files, local infrastructure, secret-shaped values, revealing
provider/build markers, or private image/PDF metadata.

Deploy only `build/publication`, preserving its directory structure. The live
document root also contains independently managed experiments, so a base-site
release must not delete unrelated routes or server-side rollback material.
The checked-in Course Match mirror is packaged separately from its canonical
repository by `scripts/build_course_matcher_publication.py`; its deployment
wrapper applies the same privacy gate before transfer.

Configure environment-specific hostnames and paths outside the repository. A
generic file-scoped transfer looks like:

```bash
export DEPLOY_HOST="user@example-host"
export DEPLOY_PATH="/path/to/document-root"
python3 scripts/build_publication.py
rsync -av build/publication/ "$DEPLOY_HOST:$DEPLOY_PATH/"
```

Do not add a broad `--delete` against a shared document root. Keep rollback
copies outside the public tree. The video reverse proxy is server configuration,
not a public `.htaccess` value. If `.htaccess` is not supported, reproduce its
directory-index, error-document, denial, and response-header rules in the host
configuration.

After deployment, crawl the real site as well as checking its principal pages:

```bash
python3 scripts/publication_privacy.py \
  --allowlist config/publication-privacy-allowlist.json \
  site https://www.lozknowles.com/
```

The same artefact gate runs in CI. A manually dispatched workflow also performs
the live crawl after a release. Reviewed exceptions are path-and-rule specific;
the current exception preserves the explicit open-source speech attribution in
the separately deployed Cartoon Collingham experiment.

See `SECURITY.md` for the publication boundary, retained metadata, and release
verification expectations.

## Video assets

Large MP4 files may be kept outside Git and deployed separately to `assets/videos/`, or served from a media origin configured by the operator. The host should support HTTP byte-range requests so browsers can seek efficiently. `assets/project-video.js` pauses inactive videos, prevents overlapping playback, and restores poster images when media is unavailable.

The Agent Control showcase intentionally presents three distinct records: an
edited narrated tour, a continuous silent live-run recording, and the complete
non-OpenAI prompt/KV cache qualification. The live run
links to Agent Control's complete naturally generated execution transcript so
the model change, sealed baton, verification and token reconciliation remain
inspectable rather than being replaced by a release summary. Video 3 preserves
the exact final qualification MP4 and shows authoritative cache counters change
across three cold, warm and changed-prefix cycles. Large media and
generated transcript files remain outside Git and pass through the scoped
Agent Control publication procedure in `AGENT-CONTROL-PUBLICATION.md`.

## Cheeky Phone deployment

Run `scripts/deploy-cheeky-phone.sh` from a clean checkout on a machine with the
established server SSH access. Supply `DEPLOY_HOST`, `DEPLOY_PATH`, `LIVE_URL`,
and optionally `DEPLOY_PORT` (default 2222) as environment variables after
verifying the live Apache document root. Deployment values stay outside Git.
The script runs the publication checks, stages and backs up exactly five files
outside the public root, refuses a homepage that differs from the reviewed
baseline or this release, transfers assets before updating the homepage, and
compares all five public responses byte-for-byte before the full privacy crawl.
Unrelated routes are preserved. A transfer exception restores backed-up files.
If HTTP verification or the wider crawl fails after transfer, the files remain
installed and the printed backup directory is retained for investigation or
rollback; do not report that state as a verified release.

The deployment script has been syntax checked, and the app's face-down phrase,
cooldown, hidden-page pause, listener cleanup, denied-permission behaviour and
Stop-during-permission handling have been checked with mocked browser APIs.
These checks are not physical sensor/audio qualification. After deployment,
open the page on a phone, tap Start, allow motion, check the volume and hold the
screen face down for two seconds after the selected minimum gap. Confirm the
exact response, voice choice, quiet mode, Stop and return from another app.
