# Agent Control public tour delivery

The public tour is at https://lozknowles.com/agent-control.html. The homepage
has POE Demo after Murmuration, Cheeky Phone, and Area 51 immediately before
Contact in both desktop and mobile navigation. Area 51 points to the existing
authenticated service at https://files.lozknowles.com.

## Narration revision, 9 September 2026

The operator requested a consistent male narrator, one introduction, and no
subsequent spoken use of the guide's name. The revised public soundtrack is
generated with OmniVoice using one fixed original synthetic male voice reference
for every chapter. It is not a real person's cloned voice. The new script is
aligned to the 21 chapters of the existing 6:12 edit, with ASR-aligned captions
and a matching transcript. An editorial label identifies the new narration;
the conversation visible inside the recorded dashboard remains the original
interaction. The page identifies recorded footage with new narration. Media
URLs have a version query so returning viewers request the revised assets.

The original qualification recording and earlier public edit remain private
evidence. This public media revision does not alter the v4.1.0 product tag,
deployed product commit, runtime voice configuration or qualification claims.
Human listening is not separately attested. Review checks include every spoken
passage against ASR, one fixed voice-prompt digest, complete caption text,
measured signal levels and pauses, representative legible frames, public
browser audio decoding, captions and forward/backward seeking.

## Live governed run, 9 September 2026

The showcase includes a second, separate video beneath the narrated tour. This
is the accepted continuous Agent Control demonstration rather than an edited
walkthrough: one normal Work Parcel traverses every primary operational view,
shows all six Crew roles responding to retained work state, exposes live token
and context authority, records the quality-gate reason, seals a baton, changes
from Qwen to Codex, verifies the destination result and reconciles the complete
10,348-token parcel ledger. The 63.96-second H.264 recording is silent,
unspliced, 1920×1080 at 25 fps and plays at 1× speed.

The complete naturally generated execution transcript is published alongside
the recording. It is not replaced by a release summary. Intentional provider
labels in that transcript have narrow path-and-rule privacy allowances. The
video, poster and transcript remain outside Git and are deployed through the
existing reviewed Agent Control media path.

The current Cheeky Phone page and assets remain independent of this publication.
Their public/server hashes were reconciled before deployment and are retained
as protected drift guards; this procedure neither sources nor replaces them.

## Scoped publication

Run the existing Python tests and `scripts/build_publication.py`; do not commit
large media. The MP4 belongs in the existing hpubuntu media origin because
Apache already proxies `/assets/videos/*.mp4` there with byte-range support.
Poster, captions and transcript are static files under `assets/videos/`.

Stage the allowlisted static files and two MP4s against their current deployed
hashes. Back up exact replaced files outside the public roots. Retain the
Cheeky Phone page and three asset hashes as protected drift guards. Use the
existing atomic applier and publish the homepage last. Keep public directories
0755 and files 0644. Preserve unrelated routes, media and service configuration.
Rollback restores only files named by this revision's recorded transaction.

Verify all media hashes from public HTTPS, 206 byte-range responses, native
video dimensions/duration, decoded audio, captions, transcript, seeking,
desktop/mobile navigation and the three menu destinations. Keep autoplay off.

## Whole-site privacy review

The earlier negative probes of `.htaccess` and `server-status` caused Fail2ban
to ban the home's public IP. Removing only that runtime ban restored access.
Subsequent complete scans retain all rules, probes and allowances, resolving
the site to its existing trusted LAN address within the scanner process only;
TLS and SNI are preserved. Normal public-address checks verify home access.

The wider scan retains seven unrelated findings: three main-site source asset
paths, two Course Matcher asset paths, a PDF.js source-map directive and the
authenticated voice-clone destination returning 401. These are reported, not
suppressed or described as a clean whole-site scan. The two exact caption and
transcript allowances cover intentional spoken provider attribution only.
