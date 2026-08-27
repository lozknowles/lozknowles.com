# lozknowles.com

Static files for [lozknowles.com](https://lozknowles.com), including the site's images, scripts, styles, and optional looping background music.

The public professional profile is generated from `professional-profile-source.md` by
`scripts/build-professional-profile.py`. It intentionally omits direct contact details,
precise location, education history, named employer chronology, and community-role detail.
The profile links to a rotating set of supplied professional references at
`/references.html`; direct telephone and email details are not published.

## Interactive experiments

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
