# Reading the Landscape

The homepage Workbench contains eight existing links in equal-width, aligned
columns and a documentary feature at `/#reading-the-landscape`. Below 560px the
links use one column. The film uses native, inline, full-screen-capable controls;
it loads only when requested. Starting narration pauses the homepage music.

The film is the corrected 5:49 documentary, including the revised physical page
turns and visible English subtitles. The public description preserves research
uncertainty. Only the finished film and its poster are public; the private map
application, source scans, production files and research data are not published.

## Build and media

Large media stays outside Git. `config/documentary-media.json` pins the public
MP4 by SHA-256 and size, and records the approved original's SHA-256. The public
derivative strips container/encoder metadata, H.264 encoder SEI and duplicate
selectable captions. The AAC encoder labels in ignored fill elements are blanked
without changing element lengths. Full decoded video and audio hashes must
match the approved master; this is a metadata-only publication derivative.

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.cjs tests/*.test.mjs
python3 scripts/build_publication.py --documentary-media /path/to/reading-the-landscape-v2.mp4
```

The normal source-only build omits external MP4 binaries, matching the existing
arcade workflow. Install the pinned film in the existing video media origin
before publishing the homepage; the public video route uses that origin.
Do not change the proxy or private map authentication.

Publish only these five files, preserving all other live content:

- `assets/workbench.css`
- `assets/workbench.js`
- `assets/reading-the-landscape-poster.jpg`
- `assets/videos/reading-the-landscape-v2.mp4` (existing media origin)
- `index.html` (last)

Retain the previous homepage outside the document root and guard its hash before
promotion. Verify Apache configuration, public response hashes, byte-range
seeking, privacy scan and real-browser playback. Verify aligned pairs at desktop
and tablet widths, single-column phone layout, keyboard focus, poster, narration
versus background music, seeking and full-screen playback.

## Rollback

Restore the backed-up homepage atomically. The four uniquely named new assets
can remain unreferenced, or be removed only after verifying that their hashes
still match this release. No shared CSS, existing movie, site configuration or
private application needs restoring. The release receipt records the exact
backup directory, baseline hash, promoted hashes and source revision.
