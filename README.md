# lozknowles.com

Static files for [lozknowles.com](https://lozknowles.com), including the site's images, scripts, styles, and optional looping background music.

## Interactive experiments

- **Murmuration** — added 8 August 2026 at `/murmuration.html`. An interactive flock of 10–2,500 starlings that responds to a mouse, touch input, or stylus-controlled bird of prey. Each starling follows its seven closest influential neighbours with distance, field-of-view, turn-rate, variable-speed, and locally propagated fear behaviours for more lifelike flight. Birds also move through simulated depth: distant birds are smaller and paler, nearby birds are larger and darker, depth alters neighbour influence, and near layers pass in front of far ones. The optional **Ground view** places a stationary observer on the ground beneath a bounded half-mile volume of sky. Drag, swipe, and arrow-key controls provide smoothed, human-like left/right and up/down head movement, while an overhead viewpoint graphic shows the observer, flock position, flock centre, and current viewing cone. In this mode, flock alignment, cohesion, and separation operate across all three dimensions. A **Speed** slider accelerates the full simulation from its normal `1×` rate up to `5×`, including motion, steering response, depth, fear decay, and timed formations. A **Dusk sky** toggle adds a rising cratered moon, warm afterglow near the horizon, and denser animated grey cloud banks; the existing **Clouds** switch controls cloud visibility in both sky modes. In Ground view the moon is anchored in world space and moves across or outside the viewport as the observer turns, just like the birds. Camera movement changes bird positions on screen without changing their flight-controlled silhouette orientation. Occasional formation events compress the flock into dark knots before accelerating it into long twisting ribbons with inward, outward, and toward-camera vortex waves. The flock-size input defaults to 100, and spatial neighbour indexing keeps larger flocks practical. An **Avoid edges** checkbox switches the standard view between seamless screen wrapping and a soft bounding box. The page is linked from both the desktop primary navigation and a dedicated mobile navigation action, and uses `assets/murmuration.css` and `assets/murmuration.js`.

Serve the repository root with any static web server. For example:

```sh
npx serve .
```

## Production deployment

The production site is served by Apache from `/var/www/lozknowles.com/public_html/dist` on `cottageserver`. Commit and push `main` to `origin`, then deploy over SSH on port `2222`:

```bash
scp -P 2222 index.html cv.html murmuration.html LawrenceKnowlesCV.pdf README.md .htaccess cottageserver:/var/www/lozknowles.com/public_html/dist/
scp -P 2222 assets/project-video.css assets/project-video.js assets/cv.css assets/cv-popup.js assets/cv-page.js assets/murmuration.css assets/murmuration.js cottageserver:/var/www/lozknowles.com/public_html/dist/assets/
ssh -p 2222 cottageserver 'chmod 644 /var/www/lozknowles.com/public_html/dist/.htaccess /var/www/lozknowles.com/public_html/dist/index.html /var/www/lozknowles.com/public_html/dist/cv.html /var/www/lozknowles.com/public_html/dist/murmuration.html /var/www/lozknowles.com/public_html/dist/LawrenceKnowlesCV.pdf /var/www/lozknowles.com/public_html/dist/README.md /var/www/lozknowles.com/public_html/dist/assets/project-video.css /var/www/lozknowles.com/public_html/dist/assets/project-video.js /var/www/lozknowles.com/public_html/dist/assets/cv.css /var/www/lozknowles.com/public_html/dist/assets/cv-popup.js /var/www/lozknowles.com/public_html/dist/assets/cv-page.js /var/www/lozknowles.com/public_html/dist/assets/murmuration.css /var/www/lozknowles.com/public_html/dist/assets/murmuration.js'
```

Deploy only the intended files so unrelated content in the document root is preserved. Ensure `.htaccess` is readable by Apache; an unreadable file causes Apache to return `403` for the whole site.

After deployment, verify both the page content and its response headers:

```powershell
$response = Invoke-WebRequest -Uri 'https://lozknowles.com/' -UseBasicParsing
$response.StatusCode
([regex]::Matches($response.Content, '<video controls')).Count
$response.Headers['Content-Security-Policy']
```

The expected experiment-video count is `6`. Videos use the existing project images as posters and preload metadata only. `assets/project-video.js` pauses a video when its carousel card becomes inactive, pauses other project videos when one starts, pauses the background music to prevent overlapping audio, and restores the poster as a static image if media is unavailable. The Content Security Policy is maintained in `.htaccess` and blocks third-party frames.

## Video storage and delivery

MP4 files are deliberately excluded from GitHub. Their source of truth is `/fast/media/lozknowles.com` on `hpubuntu`. A persistent user service, `lozknowles-media.service`, serves that directory privately over Tailscale at `100.125.120.114:8100` with HTTP byte-range support. Apache on `cottageserver` proxies same-origin requests from `/assets/videos/*.mp4` to that private origin through the rewrite rule in `.htaccess`.

To check the private origin:

```bash
ssh hpubuntu 'systemctl --user status lozknowles-media.service'
curl -I -H 'Range: bytes=0-99' http://100.125.120.114:8100/flower-detection.mp4
```

Pushing GitHub does not update the Apache document root automatically. If GitHub contains the new commit but production is stale, run the SSH deployment commands above.
