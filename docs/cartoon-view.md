# Cartoon Collingham on the portfolio

`/cartoon-collingham.html` presents the village with the site's shared header. It is linked from the homepage workbench and Place section. Its `/cartoon-view/` frame contains the 3D scene, orbit camera and map-data attribution.

The scene-only branch creates no HUD, minimap, menus, guide/audio controls, landmark pins, survey panels or first-person controls. The camera stays in overview mode, with rotation, zoom and pan. Loading and retry feedback appear only while the scene is unavailable. Existing buildings, street details, greenery, sport, trains, the bus and environmental animation use the canonical components.

## Source and maintenance

- Canonical source: `lozknowles/LocalWalks`, `apps/cartoon-collingham`, v0.38.0 at `d73f32d83da5b088c1a1cf0e1fe282ddb7a0d25e` (component code `bb74680ea67943ffb79d1f1ccb24828a8491b0fd`).
- The focused source changes are retained in `patches/cartoon-view.patch`.
- `config/cartoon-view.json` records source identity, build environment and each shipped file's SHA-256. The website build fails if a pinned file changes without updating the manifest.
- The static scene has its own `/cartoon-view/` base. Read-only map and village-guide data use the established `/cartoon-collingham/` API. The atmosphere uses the canonical default weather and local clock without an external weather request. Speech-health requests and walking collision-world construction are skipped in this presentation.
- Scene-only viewing does not write the full application's HUD/pin preferences or local survey drafts.

To rebuild, export the pinned component source into a clean temporary directory, apply the patch at the component root, install its locked dependencies, run its tests and TypeScript build, and build Vite with the three environment settings in the manifest. Review the resulting `dist` files before copying them into `cartoon-view/` and updating the checksums. The build-only patch and provenance stay outside the public artifact.

Keep the map-data copyright attribution in the view. The normal `/cartoon-collingham/` application and the independently deployed Collingham community site have their own release lifecycle.
