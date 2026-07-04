# Black Hole

A cinematic, physically inspired black hole simulation in Three.js — runs entirely in the browser.

**▶ Live demo: [arecibo-sys.github.io/black-hole](https://arecibo-sys.github.io/black-hole/)** — drag to orbit, pinch or scroll to zoom, tap for ambient sound.

![](https://img.shields.io/badge/three.js-r160-black) ![](https://img.shields.io/badge/WebGL2-GPU%20shaders-orange)

## What you're looking at

- **Real gravitational lensing** — every pixel integrates a null geodesic through the Schwarzschild metric (`a = −1.5 h² r̂ / r⁴`), producing the photon ring and the accretion disk wrapping above and below the shadow, exactly like *Interstellar*'s Gargantua.
- **Accretion disk** with Keplerian differential rotation (inner rings orbit at `ω ∝ r^-1.5`), sheared fbm filaments, a deep-orange → white temperature ramp with blue high-energy tint at the ISCO, and relativistic doppler beaming (the approaching side glows brighter).
- **Warped star field** — a procedural, multi-layer star grid sampled along the *bent* ray direction, so background stars smear and slide around the shadow. Subtle per-star twinkle.
- **22,000 infalling dust particles** in one GPU draw call, spiraling inward with turbulent, never-repeating orbits.
- **Cinematic camera** on a perpetual smoothed orbit — incommensurate sinusoid frequencies mean the path never repeats.
- **Post pipeline**: restrained Unreal bloom → color grade (vignette, split-tone, dither) → ACES filmic tone mapping.

## Run it

Any static server works (ES modules need http):

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Three.js loads from CDN — no build step, no dependencies.

## Tuning

Everything lives in [`src/config.js`](src/config.js): disk speed, lensing strength, particle density, bloom intensity, camera speed, and the full color palette.

## Architecture

```
index.html
src/
  config.js            all tunable parameters
  main.js              renderer + loop wiring
  scene/blackhole.js   fullscreen geodesic ray-marching shader
  scene/particles.js   GPU-animated infalling dust
  scene/camera.js      smoothed cinematic orbit
  post/composer.js     bloom → grade → ACES tone map
```

The shader math is documented inline in `src/scene/blackhole.js`.
