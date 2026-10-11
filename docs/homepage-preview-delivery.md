# Homepage preview delivery

The six homepage experiment previews use `preload="none"`. The existing playback controller starts only the visible active card. Loading every preview's metadata on initial page load can exhaust an HTTP/1.1 browser's connections when a media origin is unavailable, preventing navigation requests from completing.

Production serves the six approved preview files directly from `assets/videos/`, rather than proxying them through the remote media origin. The Apache media rewrite has an exact filename exclusion for:

- flower-detection.mp4
- hand-mapping.mp4
- archive-automation.mp4
- wisteria-timelapse.mp4
- space-bike.mp4
- ww1-village-walk.mp4

Preserve these independently deployed media assets during site releases; they are not bundled in the source-only publication build. A replacement document root must stage and verify them before activation. Other media routing is unchanged. Do not substitute different encodes under these names without reviewing and updating the media manifest.

The approved bytes were copied unchanged on 11 October 2026. Hashes are recorded in `config/homepage-preview-sha256.txt`. Deployment validates every hash and Apache configuration, saves the previous homepage and virtual-host configuration, and restores them if activation fails.

Release acceptance must use normal, unmocked browser networking: immediate and delayed navigation from the homepage, desktop and mobile menus, carousel changes, video playback advancement, and HTTP 206 byte-range responses. A test which blocks media requests does not establish working homepage navigation.
