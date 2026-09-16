# Cheeky Phone water implementation

The primary view looks straight down into water held within the screen's rectangular glass rim. It extends the original Cheeky Phone and keeps all 16 original/new quips, device voice selection, Start, Stop, Quiet mode and permission prompts.

## Water and input

A 37 × 21 height field stores surface height and momentum. A damped wave equation runs at a fixed 120 Hz with bounded frame catch-up. Gravity moves the equilibrium surface, acceleration adds inertial impulses, and pointer/keyboard input adds local disturbances. A constrained projection conserves the chosen volume and stops blocked columns accumulating momentum against the glass. The renderer uses the computed heights and slopes for the water boundary, lighting and refracted highlights.

The projection is deliberately shallow, like a reservoir inside the screen. The percentage is water volume, not the percentage of visible pixels. Looking flat down covers the floor; tilting exposes the upper floor and pools water at the lower side. This is a practical height-field approximation, not a full 3D fluid solver: it cannot represent breaking waves, detached droplets, vortices through the depth or arbitrary overturning. A staged spill empties the visible reservoir before the underwater wash covers it. Recovery drains that wash and restores the requested fill volume.

Device coordinates are mapped through the current screen orientation angle (including 90°, 180° and 270°). Orientation events may be coalesced while a phone is stationary, so a held pose is confirmed by elapsed time, not by demanding repeated change events. Periodic motion data provides a liveness check when available. Background/resume clears pose history. Motion-only gravity fallback is supported. Manual tilt suppresses physical pose triggers until Use phone motion is selected; Preview underwater is explicitly labelled.

Entry requires z < -0.65 for 1.1 seconds. Exit requires z > -0.30 for 0.3 seconds. The first submerged line has a 12-second cooldown. Its actual playback completion schedules the breathing request five seconds later. Return, Stop, Quiet, voice change, refill and backgrounding invalidate the sequence and clear pending speech. Normal pose quips retain the selected minimum gap. There is no speech queue.

## Voice and privacy

The original page used speechSynthesis, preferring the first local en-GB voice. On the inspected desktop this was Microsoft George. The same installed George engine generated all 16 source WAVs locally using scripts/record-cheeky-voice.ps1; scripts/package-cheeky-voice.py produces a 66.58-second, approximately 533 KB MP3 sprite and exact clip timings. No paid service, credential, microphone or network voice generation was used.

The exact known local Microsoft George voice and the explicit George recorded option both use these recordings for every line. Underwater playback applies a 110 Hz high-pass, a 1450 Hz low-pass, and a small modulated delay with restrained bubble accompaniment. Normal and underwater speech use the identical source buffer. Other device voices remain selected and unfiltered, with a visible explanation and an explicit recorded-voice alternative. There is no silent switch to George. A recording download failure leaves text and explains the problem.

Audio is unlocked by Start; cached playback waits for AudioContext.resume to finish. Quiet mutes the master output and cancels speech/effects. Stop and hidden-page transitions stop sources/oscillators, discard callbacks, suspend audio and cancel rendering. Sensor values stay in memory on the device and are never recorded or uploaded by the application. Recordings are fetched from the same site. Device speech voices may still use their browser/provider's online service, as before.

## Quality and accessibility

Canvas resolution is capped at 1.5 device pixels per CSS pixel. Lower-core devices start at lower quality. Sustained expensive draws lower the mesh drawing density and resolution; low quality and reduced motion target 30 draws per second. Reduced motion damps waves more strongly, reduces impulses/bubbles and removes the tipping transform. Controls support keyboard focus, labelled sliders, pointer capture, 320px screens and enlarged text.

## Verification

Run:

    node --test tests/cheeky-*.test.cjs
    python3 -m unittest discover -s tests -p 'test_*.py'
    python3 scripts/build_publication.py

The suites cover volume, non-planar waves, settling, coordinate mapping, coalesced readings, threshold chatter, cooldown, permission denial, Stop during permission/resume, audio cancellation, exact breathing timing, manual-mode isolation, background/resume and scoped deployment/rollback. The browser review exercises the real application and Web Audio graph with explicitly simulated sensor/visibility input. A recorded demonstration captures the live water canvas, live captions and the actual Web Audio output; its simulation/preview labels remain visible throughout.

Physical Pixel 8 Pro motion, on-device performance, hardware-speaker listening and screen-lock qualification require an attached device. Desktop viewport emulation and measured audio processing do not establish those physical results.

## Release

Only the allowlisted publication output is deployable. deploy-cheeky-phone.sh requires a clean committed checkout, BASE_REF for the reviewed previous source, environment-specific deployment values, local tests/build, and a passing live preflight crawl. It transfers exactly nine Cheeky Phone runtime files, checks drift against the baseline/new hashes, backs up outside the web root and updates HTML last. The homepage, navigation and independently maintained applications are excluded. Remote hashes, nine public response hashes and a full live crawl are required after transfer.

The scanner's map-probe construction now appends .map to the URL path, not after a cache query string; a regression test covers this. This corrects false positives for versioned assets without exempting real source maps.

Primary references: [device coordinate frames](https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events/Orientation_and_motion_data_explained), [screen orientation angles](https://www.w3.org/TR/screen-orientation/#dfn-current-orientation-angle), [coalesced orientation events](https://www.w3.org/TR/orientation-event/), [speech utterance API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance).
