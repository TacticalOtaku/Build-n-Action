# Fire texture prototype

`fire-bed-v1.png` was generated with the built-in ImageGen tool for this module. It is a black-background texture, not a sprite sheet. `scripts/services/fire-vfx.mjs` distorts and composites it in WebGL. The editor shares one lazy renderer between its node surfaces and falls back to Canvas fire if WebGL or the texture is unavailable. Include this asset when distributing the module.

Exact generation prompt:

> Generate a production VFX texture asset, not a UI mockup. Square 1024x1024. A wide seamless-looking bed of physically convincing orange fire: turbulent curling wisps, translucent thin flame sheets with torn edges and internal vortex filaments, white-yellow thermal cores near base, deep orange edges, fine organic multi-scale detail. Straight horizontal emission base at bottom 10% of image, flames rise irregularly into the middle and fade completely into pure black across the upper 20%. Dark black background for additive compositing. Flame occupies full width with no objects, no frame, no text, no border, no icons, no illustration outlines. Real photographed/simulated pyro quality rather than cartoon flames or repeated triangular tongues. Front-facing flat view, no perspective, no ground, no smoke clouds. This texture will be distorted and advected with a GPU shader for an animated fantasy game interface.

Build the standalone comparison with `node tools/build-fire-preview.mjs`. Open `artifacts/fire-vfx-preview.html`. Run `node tools/smoke-fire-preview.mjs` with Playwright available (or set `BNA_PLAYWRIGHT` to its package directory).

Shader reference consulted: https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-shaders . No Three.js dependency or external plugin was installed.
