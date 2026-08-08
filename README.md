# lozknowles.com

Static files for [lozknowles.com](https://lozknowles.com), including the site's images, scripts, styles, and optional looping background music.

## Interactive experiments

- **Murmuration** — added 8 August 2026 at `/murmuration.html`. An interactive flock of 10–10,000 starlings that responds to a mouse, touch input, or stylus-controlled bird of prey. Each starling follows its seven closest influential neighbours with distance, field-of-view, turn-rate, variable-speed, and locally propagated fear behaviours for more lifelike flight. Birds also move through simulated depth: distant birds are smaller and paler, nearby birds are larger and darker, depth alters neighbour influence, and near layers pass in front of far ones. The optional **Ground view** places a stationary observer beneath a deep half-mile volume of sky. A checked-by-default **Auto track** toggle uses a coarse three-dimensional density field to find the busiest part of the murmuration and smoothly turn the observer's head toward it; manual drag, swipe, and arrow-key looks temporarily take priority before automatic tracking resumes. Switching Auto track off retains a fully manual view. The overhead viewpoint graphic marks the tracked dense core and current viewing cone. In this mode, flock alignment, cohesion, and separation operate across all three dimensions. A **Speed** slider accelerates the full simulation from its normal `1×` rate up to `5×`, including motion, steering response, depth, fear decay, and timed formations. A **Dusk sky** toggle adds a rising cratered moon, warm afterglow near the horizon, and denser animated grey cloud banks; the existing **Clouds** switch controls cloud visibility in both sky modes. In Ground view the moon is anchored to the distant sky and responds to head movement with much less apparent parallax than the nearby flock. Camera movement changes bird positions on screen without changing their flight-controlled silhouette orientation. Occasional formation events compress the flock into dark knots before accelerating it into long twisting ribbons with inward, outward, and toward-camera vortex waves. The flock-size input defaults to 2,500, and spatial neighbour indexing keeps larger flocks practical. An **Avoid edges** checkbox switches the standard view between seamless screen wrapping and a soft bounding box. The page is linked from both the desktop primary navigation and a dedicated mobile navigation action, and uses `assets/murmuration.css` and `assets/murmuration.js`.

Serve the repository root with any static web server. For example:

```sh
npx serve .
```

## Deployment

This is a build-free static site. Deploy the repository contents to any static web host or web-server document root while preserving the directory structure. Suitable targets include GitHub Pages, Cloudflare Pages, Netlify, object storage with static hosting, Apache, and Nginx.

For a generic SSH deployment, configure environment-specific values outside the repository and synchronise only the intended files:

```bash
export DEPLOY_HOST="user@example-host"
export DEPLOY_PATH="/path/to/document-root"
rsync -av --delete-after --exclude='.git/' ./ "$DEPLOY_HOST:$DEPLOY_PATH/"
```

Review `--delete-after` before using it against a document root that contains files not managed by this repository. Ensure the server returns the correct MIME types for HTML, CSS, JavaScript, PDF, and media files. If `.htaccess` is not supported by the chosen host, reproduce its security headers in that platform's configuration.

After deployment, verify the public URL and important response headers:

```bash
curl -fsSI https://example.com/
curl -fsS https://example.com/murmuration.html | grep -q 'id="murmuration"'
```

## Video assets

Large MP4 files may be kept outside Git and deployed separately to `assets/videos/`, or served from a media origin configured by the operator. The host should support HTTP byte-range requests so browsers can seek efficiently. `assets/project-video.js` pauses inactive videos, prevents overlapping playback, and restores poster images when media is unavailable.
