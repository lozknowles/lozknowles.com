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
scp -P 2222 assets/project-video.css cottageserver:/var/www/lozknowles.com/public_html/dist/assets/
ssh -p 2222 cottageserver 'chmod 644 /var/www/lozknowles.com/public_html/dist/.htaccess /var/www/lozknowles.com/public_html/dist/index.html /var/www/lozknowles.com/public_html/dist/README.md /var/www/lozknowles.com/public_html/dist/assets/project-video.css'
```

Deploy only the intended files so unrelated content in the document root is preserved. Ensure `.htaccess` is readable by Apache; an unreadable file causes Apache to return `403` for the whole site.

After deployment, verify both the page content and its response headers:

```powershell
$response = Invoke-WebRequest -Uri 'https://lozknowles.com/' -UseBasicParsing
$response.StatusCode
([regex]::Matches($response.Content, 'youtube-nocookie\.com/embed/')).Count
$response.Headers['Content-Security-Policy']
```

The expected experiment-video count is `6`. The Content Security Policy is maintained in `.htaccess`; YouTube playback requires `frame-src https://www.youtube-nocookie.com`. The embeds use YouTube's privacy-enhanced host and load lazily.

Pushing GitHub does not update the Apache document root automatically. If GitHub contains the new commit but production is stale, run the SSH deployment commands above.
