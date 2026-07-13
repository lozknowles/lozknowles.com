# lozknowles.com

Static files for [lozknowles.com](https://lozknowles.com), including the site's images, scripts, styles, and optional looping background music.

Serve the repository root with any static web server. For example:

```sh
npx serve .
```

## Production deployment

The production site is served by Apache from `/var/www/lozknowles.com/public_html/dist` on `cottageserver`. Commit and push `main` to `origin`, then deploy over SSH on port `2222`:

```bash
scp -P 2222 index.html README.md .htaccess cottageserver:/var/www/lozknowles.com/public_html/dist/
scp -P 2222 assets/project-video.css assets/project-video.js cottageserver:/var/www/lozknowles.com/public_html/dist/assets/
ssh -p 2222 cottageserver 'chmod 644 /var/www/lozknowles.com/public_html/dist/.htaccess /var/www/lozknowles.com/public_html/dist/index.html /var/www/lozknowles.com/public_html/dist/README.md /var/www/lozknowles.com/public_html/dist/assets/project-video.css /var/www/lozknowles.com/public_html/dist/assets/project-video.js'
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
