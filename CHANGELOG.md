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

### Changed

- Made flight paths more lifelike with seven-neighbour flock awareness, distance and field-of-view weighting, smooth turn limits, individual speed variation, banking, and predator fear that ripples through nearby birds.
- Updated the simulation in two phases so every bird reacts to the same instant in the flock, avoiding update-order artefacts while retaining spatial indexing for large flocks.
- Added occasional large-scale formation events that gather starlings into dense dark groups, accelerate the flock into elongated trails, and create twisting inward-and-outward vortex waves.

### Documentation

- Documented the Murmuration page and its assets in `README.md`.
- Extended the cottageserver deployment instructions to include the new page, stylesheet, and script.
