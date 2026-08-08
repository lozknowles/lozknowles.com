# Changelog

All notable changes to lozknowles.com are recorded here.

## 2026-08-08

### Added

- Added **Murmuration**, an interactive browser experiment featuring 100 flocking starlings.
- Added mouse, touch, and stylus control for a bird of prey that the flock dynamically avoids.
- Added seamless horizontal and vertical wrapping so birds leaving one edge reappear on the opposite edge.
- Added pause and gather-flock controls, responsive presentation, and reduced-motion support.
- Added Murmuration to the website's primary navigation.
- Added an editable flock-size control supporting 10–500 starlings, defaulting to 100.
- Added spatial neighbour indexing to keep larger murmurations responsive.
- Added an **Avoid edges** checkbox that switches between seamless wraparound and soft bounding-box steering.
- Added a blue-grey hazy sky and layered wispy clouds with a checked-by-default **Clouds** visibility toggle.
- Increased the adjustable flock limit to 2,500 starlings.
- Added an **Inside flock** mode that places the viewer at the centre of a bounded half-mile cube filled with birds.
- Added drag, touch-swipe, and arrow-key controls for looking left, right, up, and down from inside the flock.
- Added a `1×`–`5×` **Speed** slider that accelerates movement, steering, depth, fear decay, and timed formations together.
- Added a **Dusk sky** mode with a rising moon, warm afterglow, and additional layered grey clouds.

### Changed

- Made flight paths more lifelike with seven-neighbour flock awareness, distance and field-of-view weighting, smooth turn limits, individual speed variation, banking, and predator fear that ripples through nearby birds.
- Updated the simulation in two phases so every bird reacts to the same instant in the flock, avoiding update-order artefacts while retaining spatial indexing for large flocks.
- Added occasional large-scale formation events that gather starlings into dense dark groups, accelerate the flock into elongated trails, and create twisting inward-and-outward vortex waves.
- Added simulated depth flight with individual forward/back movement, perspective scaling, atmospheric fading, depth-aware neighbour influence, and far-to-near drawing layers.
- Restored access to Murmuration on mobile with a dedicated navigation action beside the CV button.
- Extended alignment, cohesion, and separation into the depth axis in Inside flock mode, with perspective projection and far-to-near rendering around a stationary viewer.
- Reworked Inside flock as **Ground view**, placing the observer beneath the flock with a visible horizon, natural smoothed head movement, and an overhead flock-and-viewing-cone graphic.
- Anchored the moon and birds in world space so head movement changes only their projected viewport positions; bird silhouette rotation remains driven by flight rather than the camera.
- Reduced the moon's apparent head-movement parallax so it reads as a distant celestial object rather than occupying the flock's airspace.

### Documentation

- Documented the Murmuration page and its assets in `README.md`.
- Extended the cottageserver deployment instructions to include the new page, stylesheet, and script.
