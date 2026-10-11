# OpenAI usage integration for the existing private hub

The public `lozknowles.com` repository contains the website. Its **Area 51** link points to `files.lozknowles.com`, a separately managed File Store service. This review package applies the dashboard directly to that existing FastAPI application. It does not add a server, authentication mechanism, Tailscale route, or public page. PR #28's standalone server is intentionally not used.

`integration.patch` changes the File Store's existing config, authenticated routes, CSP for this page, private hub navigation, and tunnel retry handling. The tunnel correction keeps transient SSH stderr from terminating its scheduled retry loop; it does not change the tunnel destination or port. `overlay/` contains the collectors, responsive page assets, tests, and operational documentation. The package is excluded from the site's allowlisted publication build.

The patch was prepared against File Store source commit `ccc33abcf1fbb9e95b00d0bb530a2fec213e32e0`. Its `app/main.py`, `app/config.py`, and `app/templates/hub.html` matched the running File Store source on 11 October 2026. The live checkout has additional unrelated changes to Area 51 and shared CSS; the patch adds one scoped hub style without replacing those changes. The running process was identified by its local listener, but this PR does not restart or deploy it.

In a clean File Store checkout, run:

```powershell
.\private\filestore-openai-usage\integrate.ps1 -FileStoreRoot <isolated-filestore-checkout>
.\private\filestore-openai-usage\integrate.ps1 -FileStoreRoot <isolated-filestore-checkout> -Apply
```

Then run the File Store tests and review `overlay/docs/openai-usage.md` for private account setup, supported figures, and deployment checks. Do not apply this package directly to the running source without a baseline comparison, backup, rollback copy, and scoped service restart. The existing public site build needs no deployment for this feature.
