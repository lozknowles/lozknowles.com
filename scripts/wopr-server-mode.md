# WOPR server display

The Server button (or `?mode=server`) enables a repeating 30-second WOPR animation, 10-second H segment, 10-second S segment and 10-second C segment. Each server segment starts with a two-second dotted identifier, included in that segment, then shows that server's utilisation bars. The default remains the original WOPR animation. Pause freezes both drawing and the cycle; Rate affects drawing, not the 60-second cycle.

Rows, top to bottom: CPU, available-memory-based RAM use, swap use, system disk, data disk, GPU utilisation. Green is below 75 percent, amber is 75–89 percent and red is 90 percent or above. These are utilisation bands, not a service-availability diagnosis. Null and snapshots older than 35 seconds produce flashing red with an unavailable/stale status. No simulated telemetry is used.

`wopr_health_sample.py` reads operating-system counters and runs a bounded read-only GPU query. `wopr_health_collect.py` collects H locally and S/C through bounded SSH calls in parallel; failed hosts are independently marked null. `wopr_health_receive.py` accepts only six numeric percentages or null per host, the H/S/C map, schema version and fresh per-host timestamps, then atomically replaces the dedicated public JSON file. Raw paths, process names, service details, host identifiers and credentials are never sent in that JSON.

Install both sampler and collector beside one another and the supplied user service/timer on the monitored machine, and the receiver on the publication host. The existing SSH identity is used; no new credential is embedded. The receiver's private staging directory must exist with mode 0700 and be owned by the publishing user, outside the Apache document root on the same filesystem. No existing service is stopped or restarted. The timer runs about every 10–15 seconds.

Rollback: restore the two backed-up display files and stop/disable only `wopr-health.timer`. Remove the dedicated JSON if withdrawing telemetry. Preserve all other routes and services.

For publication checks, do not repeatedly issue Apache-denied `/.htaccess` or `/server-status` probes through the home public address: this site's authentication jail bans that source address. All content/privacy rules and other negative probes remain enabled.

Server segments keep a dotted H/S/C in the leftmost ten columns, with two blank columns before the six bars. The server grid uses 48 columns on desktop and 32 on narrow screens, with smaller dots and reduced horizontal gaps; the WOPR grid retains its previous layout.

The server panel is twelve rows deep: six directly labelled bars, alternating label and dot rows, alongside the persistent H/S/C glyph. Unavailable and stale values flash red only in the affected bar; steady amber means elevated utilisation, and the amber identifier is not an alarm.
