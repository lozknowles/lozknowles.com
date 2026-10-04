# Reach & Growth (private portal)

This service is deployed separately from the existing static publication. The normal site builder does not publish this directory. Never place its config, SQLite database, credentials, raw logs or evidence inside a DocumentRoot or commit them.

## Authorized boundary

The owner permits only the private lozknowles.com /reach/ route and the necessary backend/routing. Existing public website files, navigation, content and apps are preserved. Collingham.org is read-only. Consequently no action instrumentation is deployed on either public app; walk starts and narration plays remain explicitly unmeasured. The collector adapter is prepared/tested but no Apache collector route is enabled.

## Metrics and storage

Successful public GET document requests exclude known bots, monitors, static files, APIs, private/dynamic paths, redirects and malformed lines. All arbitrary query fields are discarded; strict lowercase UTM source/medium/campaign/content are the only campaign dimensions. Referrals retain hostnames only. IP/user agent observations are transient in memory; 30-minute sessions reset at local midnight and are not unique people.

Daily snapshots are rebuilt transactionally from readable combined logs and numbered gzip archives. Plain/compressed copies of the same archive are deduplicated; repeated legitimate lines and distinct archive generations are preserved. Reimports replace snapshots rather than increment totals. Snapshots whose count or time coverage would shrink are retained, with retained_dates and individual refreshed_at provenance. Missing days remain unknown. First observed day/current day are partial, interior days provisionally complete within observed origin coverage. CDN cache hits and client-only navigation are missing from origin logs.

Comparisons require both complete calendar windows for all selected domains. Search data has independent provider dates/lag and query omissions. No prior historical report figures are treated as current baseline.

## Connections

Verified cottageserver sources:
- Apache combined access-log families for each domain, including numbered compressed archives.
- Existing /home/loz/server_reports/lozknowles.html and collingham.html, preserved as private GoAccess reports. The root 04:00 generation cron remains unchanged.
- Read-only technical audits of public pages, robots, sitemap, metadata, canonical, structured data and up to twenty internal links.
- Mobile browser lab measurement is distinct from field Core Web Vitals or a Lighthouse score.

Search Console: verify each exact sc-domain property, enable the Search Console API in the credential project, and give the existing authorized user or service-account email read access. Store authorized_user JSON (client_id, client_secret, refresh_token authorized for webmasters.readonly) or service_account JSON in a private credential file outside the web root, chmod 600. Set domains.DOMAIN.search_console.property and credential_file in /etc/reach-growth/config.json. Service-account mode also needs google-auth and requests in the service environment. Never expose a key, token or credential contents in output. Run the refresh service. Each property is independently Not connected until successful authorization/refresh.

Search Analytics does not prove indexing. URL Inspection/indexing reports require authorized Search Console access; they remain unavailable until connected. Existing public websites are not modified to supply additional telemetry.

## Installation and rollback

Use the isolated checkout on hpubuntu. Run Python tests, frontend syntax checks, and reach/verify-ui.cjs with an installed Playwright runtime (REACH_PLAYWRIGHT can select it). Stage a credential-free archive under /home/loz/deploy-staging/reach-RELEASE on cottageserver using existing SSH port 2222 access. Run:
sudo python3 STAGE/reach/install.py --release STAGE --revision COMMIT --confirm-host cottageserver

The installer backs up only the affected lozknowles TLS vhost, generates a private proxy token, installs a versioned /opt/reach-growth release, keeps aggregates under /var/lib/reach-growth, and reuses the existing maps Apache login. It adds one private route Include, validates Apache, starts loopback service/refresh timer and reloads Apache. Services use existing loz read permissions (adm for logs and owner of private reports), no-new-privileges and restricted writable directories.

Refresh runs at 04:15 and 12:15; original report generation remains independent. Source failures retain last successful data. The technical audit uses a local-origin HTTPS transport with original SNI and certificate verification; it changes no DNS.

Private portal credentials are the established maps username/password. Tests may consume the existing protected credential file in memory; never print or commit it. Verify anonymous GET/HEAD routes are blocked, authorized assets/API/reports work, spoofed proxy headers cannot bypass Apache authentication, and backend is loopback-only. Snapshot public website file hashes before/after deployment, plus Collingham's current release/config, and verify existing homepage health.

Installer prints the backup directory, containing deployment.json and rollback.sh. Run sudo sh BACKUP/rollback.sh to restore the prior vhost, validate/reload Apache, and disable the new portal service/timer. Keep private aggregates and versioned source for recovery. No DNS changes are required.

## Architect gates

PLAN: architect endorsed loopback service, Apache authentication over the entire namespace, private SQLite and independent refresh jobs. Material requirements addressed: provenance-aware reingestion, partial coverage, no persistent visitor identifiers, no inferred conversions and explicit missing sources.

NO-PROGRESS: local sandbox credential failures were resolved through approved escalated execution. Production SSH authentication succeeded but session startup stalled; a persistent session recovered. No website files were modified during diagnosis.

Scope correction: user prohibited changes to either site, then allowed only lozknowles.com portal accommodation while preserving the existing user-visible site. No Collingham instrumentation or full-site build is deployed.

COMPLETION: architect accepted the supplied live evidence after referral privacy refinement and successful authenticated legacy-report checks. Advisory review did not independently inspect source. Final runtime revision 321e8acb91c30f1d9b13e68c803dffc38f351ba2 passed45 Python tests (17 portal), alongside33 unchanged JavaScript tests. Real authenticated Chromium Pixel/iPad/desktop checks passed live HTTPS, CSP, domain switching, link builder and layout. Forty-eight live access checks passed anonymous GET/HEAD denial on both hostnames, spoofed header denial, authorized assets/API and cache/noindex headers; authorized original reports returned200. Search Console credentials and useful-action instrumentation remain unavailable as disclosed.

Deployment permission gate: both services initially failed 200/CHDIR. namei proved new root-owned release parents inherited0750. Primary fixes only /opt/reach-growth release-directory traversal to0755, preserving private data/config permissions; Apache was restored before retry.


Final deployment evidence (2026-10-04): Apache Syntax OK; loopback127.0.0.1:18196 only; service, refresh timer and Apache active. Both Apache and SEO refreshes succeeded after promotion. Reingestion rebuilt all15 available dates with no retained stale snapshots; identifier-like referral labels and the technical-audit user agent are excluded before persistence. Ordinary referral preservation is tested. Mobile lab measurements are separately timestamped and survive SEO refresh, with no field-performance claims.

Public preservation:243 stable public files match predeployment SHA256 snapshots. The remaining file, wopr-health.json, is generated by the independently verified existing10-second WOPR telemetry timer and was not edited by this task. No files were added/removed in the public DocumentRoot. Collingham current release, Apache configuration and release manifest match the baseline. Both public homepages returned200.

NO-PROGRESS compatibility gate: both SEO sources failed with the same removed Python3.12 HTTPS-handler attribute. Architect required evidence at the installed stdlib layer and verified TLS/SNI/certificate tests. The transport now uses supported arguments; live audits of both domains succeeded. No DNS change or TLS-verification bypass was made.

The versioned source and private operational evidence are retained outside the public DocumentRoot. Rollback restores the original vhost and disables the new service/timer; original reports and public websites remain intact.
