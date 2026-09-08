# Agent Control overview: publication preparation

This page is staged source, not a published or media-qualified release. Do not
deploy its homepage links while the referenced media or versioned release links
are absent. The static publication privacy scan does not establish playback.

The homepage places Agent Control immediately after Murmuration in the primary
navigation and the mobile action row. The overview uses native video controls,
inline mobile playback, an English caption track, transcript links and versioned
documentation. It does not autoplay.

## Media gate

The existing separate media directory must receive these four privacy-reviewed
files, derived from the accepted genuine browser recording:

- `assets/videos/agent-control-overview.mp4`
- `assets/videos/agent-control-overview-poster.jpg`
- `assets/videos/agent-control-overview.en.vtt`
- `assets/videos/agent-control-overview-transcript.html`

Do not commit the large recording to Git. Do not fabricate narration, captions,
transcript or telemetry to fill these paths. Preserve the unedited qualification
recording privately. Check the complete export for intelligibility, sync, personal
information, credentials, private routes and operational details before upload.
Use caption timestamps from the actual edited recording. Strip unnecessary media
metadata. Scan the caption/transcript text as public text as well as reviewing it.

## Existing build and deployment boundary

Run `python3 scripts/build_publication.py` and the existing Python tests. The
allowlist includes the overview HTML and stylesheet; media remains separate.
Headless checks at 1920, 390 and 320 pixels verify layout and link order only.

After the Agent Control release and media gates pass, confirm all four versioned
GitHub links resolve. Verify the current website deployment identity again.
Back up only files this change replaces, outside the webroot, recording hashes
and which files were previously absent. Copy the approved media and changed
allowlisted static files to staging paths on the existing Apache host. Check
hashes, then replace each with a same-directory atomic rename. Publish the
homepage link last. Do not use a broad delete or overwrite unrelated routes.
Keep public directories 0755 and files 0644.

Verify the overview from the public origin: HTTP status, desktop and mobile
navigation, start/pause, seeking (HTTP range response), English captions,
transcript, poster, release/documentation links, secure context and no unwanted
sound autoplay. Repeat the existing publication privacy check.

For rollback, first restore the previous homepage, then restore only backed-up
files and remove only newly introduced overview files listed in this change's
deployment record. Do not remove or alter other media. Verify the previous
homepage and Murmuration remain available.

## Current evidence

The staged source passes the existing publication privacy build and all 13 Python
tests. Headless browser checks pass at 1920, 390 and 320 pixels, and the desktop
overview and narrow mobile homepage screenshots have been visually reviewed.
The referenced media and v4.1.0 release are still pending; no public playback,
seeking, caption or deployment success is claimed.
