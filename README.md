# lozknowles.com

Static files for [lozknowles.com](https://lozknowles.com), including the site's images, scripts, styles, and optional looping background music.

Serve the repository root with any static web server. For example:

```sh
npx serve .
```

## Production deployment

The production site is served by Apache from the `main` branch. Publish a change by committing it and pushing `main` to `origin`.

After deployment, verify both the page content and its response headers:

```powershell
$response = Invoke-WebRequest -Uri 'https://lozknowles.com/' -UseBasicParsing
$response.StatusCode
([regex]::Matches($response.Content, 'youtube-nocookie\.com/embed/')).Count
$response.Headers['Content-Security-Policy']
```

The expected experiment-video count is `6`. The Content Security Policy is maintained in `.htaccess`; YouTube playback requires `frame-src https://www.youtube-nocookie.com`. The embeds use YouTube's privacy-enhanced host and load lazily.

If GitHub contains the new commit but production is stale, check the deployment service on `cottageserver`. SSH must be running for interactive server maintenance; it was unavailable during the July 2026 video deployment.
