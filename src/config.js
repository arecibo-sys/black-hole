/**
 * Central configuration — every tunable parameter of the simulation lives here.
 * Distances are expressed in Schwarzschild radii (rs = 1.0).
 */
export const CONFIG = {
  // ── Gravitational lensing ──────────────────────────────────────────────
  lensing: {
    strength: 1.0,      // multiplier on light bending (1.0 = physical)
    steps: 150,         // geodesic integration steps per ray (quality vs perf)
    horizonRadius: 1.0, // Schwarzschild radius, the event horizon
  },

  // ── Accretion disk ─────────────────────────────────────────────────────
  disk: {
    innerRadius: 2.6,   // ISCO-ish inner edge (rs units)
    outerRadius: 9.0,
    speed: 0.35,        // global rotation speed multiplier
    thickness: 0.18,    // vertical falloff of disk volume
    dopplerStrength: 0.55, // relativistic beaming (brighter approaching side)
    // Palette: temperature ramp from cold outer rim to hot inner edge
    colorOuter: [1.00, 0.36, 0.06], // deep orange
    colorMid:   [1.00, 0.72, 0.30], // golden
    colorInner: [1.00, 0.96, 0.92], // near-white
    colorBlue:  [0.55, 0.68, 1.00], // high-energy blue tint at inner edge
  },

  // ── Infalling dust / gas particles ─────────────────────────────────────
  particles: {
    count: 22000,       // instanced points — cheap on GPU
    minRadius: 1.4,
    maxRadius: 13.0,
    inspiralRate: 0.16, // how fast particles drift inward
    turbulence: 0.35,   // amplitude of non-repeating orbital wobble
    baseSize: 2.2,      // px at reference distance
  },

  // ── Star field (procedural, inside the lensing shader) ─────────────────
  stars: {
    density: 0.14,      // fraction of cells that host a star
    layers: 3,          // depth layers for parallax
    twinkleSpeed: 1.2,
    brightness: 1.0,
  },

  // ── Cinematic camera ───────────────────────────────────────────────────
  camera: {
    speed: 0.032,       // orbital angular velocity (rad/s)
    radius: 13.5,       // mean orbit distance (rs units)
    radiusDrift: 1.6,   // slow breathing in/out
    elevation: 0.30,    // mean height above disk plane (radians of tilt)
    elevationDrift: 0.10,
    fov: 60,
    smoothing: 0.55,    // exponential smoothing time-constant (s)
  },

  // ── Post-processing ────────────────────────────────────────────────────
  post: {
    bloomStrength: 0.55,
    bloomRadius: 0.8,
    bloomThreshold: 0.88,
    vignetteStrength: 0.42,
    vignetteSoftness: 0.62,
    saturation: 1.06,
    contrast: 1.04,
    exposure: 1.0,
  },
};
