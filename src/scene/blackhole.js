/**
 * Black hole + accretion disk + star field, rendered in a single fullscreen
 * fragment shader via geodesic ray marching.
 *
 * ── The physics ────────────────────────────────────────────────────────────
 * Null geodesics around a Schwarzschild black hole can be integrated with the
 * compact acceleration form (units where rs = 1):
 *
 *      a = -1.5 · h² · r̂ / r⁴        with  h = |r × v|  (conserved angular
 *                                          momentum of the photon)
 *
 * This reproduces the exact bending of light in the Schwarzschild metric,
 * including the photon sphere at r = 1.5 rs and the characteristic
 * "photon ring" — the disk image wrapping above and below the shadow.
 * We integrate with a simple leapfrog scheme; step size shrinks near the
 * hole where curvature is strong and grows far away, keeping cost low.
 *
 * Rays that fall below the horizon return pure black (the shadow).
 * Rays that escape sample a procedural multi-layer star field along their
 * final (bent) direction — this is what warps the background stars.
 * Every crossing of the equatorial plane inside the disk annulus deposits
 * emission, so we naturally get the primary image, the secondary image
 * bending over the top, and higher-order rings for free.
 */
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const vertexShader = /* glsl */ `
  // Fullscreen triangle — positions arrive already in clip space.
  varying vec2 vNdc;
  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vNdc;

  uniform float uTime;
  uniform vec2  uResolution;
  uniform vec3  uCamPos;
  uniform mat3  uCamBasis;      // camera world orientation (columns: right, up, -forward)
  uniform float uTanHalfFov;
  uniform float uAspect;

  uniform float uLensing;
  uniform float uDiskSpeed;
  uniform float uDiskInner;
  uniform float uDiskOuter;
  uniform float uDoppler;
  uniform vec3  uColorOuter;
  uniform vec3  uColorMid;
  uniform vec3  uColorInner;
  uniform vec3  uColorBlue;
  uniform float uStarDensity;
  uniform float uStarBrightness;
  uniform float uTwinkleSpeed;

  #define STEPS ${CONFIG.lensing.steps}
  #define HORIZON 1.0
  #define PI 3.14159265359

  // ── Hash / noise utilities ───────────────────────────────────────────
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash13(vec3(i, 0.0));
    float b = hash13(vec3(i + vec2(1, 0), 0.0));
    float c = hash13(vec3(i + vec2(0, 1), 0.0));
    float d = hash13(vec3(i + vec2(1, 1), 0.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  // 3-octave fbm — enough structure for disk filaments, cheap on GPU
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * vnoise(p);
      p = p * 2.13 + vec2(17.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  // ── Procedural star field, sampled by (bent) ray direction ──────────
  // 3D cell grid on the direction sphere; each cell may host one star.
  // Multiple frequencies fake depth layers; per-star phase gives twinkle.
  vec3 stars(vec3 dir) {
    vec3 col = vec3(0.0);
    float freq = 45.0;
    for (int layer = 0; layer < 3; layer++) {
      vec3 g = dir * freq;
      vec3 id = floor(g);
      vec3 f = fract(g);
      vec3 rnd = hash33(id);
      if (rnd.z < uStarDensity) {
        // one tiny star at a random spot inside its own cell
        vec3 starPos = 0.15 + rnd * 0.70;
        float d = length(f - starPos);
        float twinkle = 0.72 + 0.28 * sin(uTime * uTwinkleSpeed * (0.5 + rnd.x * 2.0) + rnd.y * 6.283);
        float star = exp(-d * d * 120.0) * twinkle;
        // subtle color temperature variation per star
        vec3 tint = mix(vec3(0.75, 0.83, 1.0), vec3(1.0, 0.88, 0.72), rnd.x);
        col += star * tint * (0.25 + rnd.y * rnd.y * 1.1);
      }
      freq *= 2.3;
    }
    // faint milky-way style background glow band
    float band = exp(-abs(dir.y + 0.35 * dir.x) * 4.0) * 0.018;
    col += band * vec3(0.55, 0.6, 0.8) * fbm(dir.xz * 6.0 + 3.0);
    return col * uStarBrightness;
  }

  // ── Accretion disk emission at a plane-crossing point ────────────────
  // r      : radius of the hit (rs units)
  // rayDir : photon travel direction at the hit (for doppler beaming)
  vec4 diskSample(vec3 pos, vec3 rayDir) {
    float r = length(pos.xz);
    float t = clamp((r - uDiskInner) / (uDiskOuter - uDiskInner), 0.0, 1.0);

    // Keplerian angular velocity: inner rings orbit much faster (ω ∝ r^-1.5)
    float omega = uDiskSpeed * pow(r, -1.5) * 6.0;
    float phi = atan(pos.z, pos.x);

    // Two counter-scrolled noise layers at different speeds so the ring
    // structure shears — reads as differential rotation, never repeats.
    // Sample on (cosφ, sinφ) so there is no seam at φ = ±π.
    float a1 = phi + uTime * omega;
    float a2 = phi - uTime * omega * 0.62;
    float n1 = fbm(vec2(cos(a1), sin(a1)) * 2.2 + vec2(r * 2.6, -r * 1.3));
    float n2 = fbm(vec2(cos(a2), sin(a2)) * 3.6 + vec2(-r * 2.1, r * 4.2 + 7.0));
    float filaments = n1 * 0.65 + n2 * 0.35;
    filaments = pow(filaments, 1.6) * 1.9;

    // Radial intensity: hot dense inner edge, soft fade at both rims
    float edgeIn  = smoothstep(0.0, 0.08, t);
    float edgeOut = 1.0 - smoothstep(0.55, 1.0, t);
    float radial = edgeIn * edgeOut * pow(1.0 - t, 1.35);

    // Temperature ramp: deep orange → golden → white, blue kiss at ISCO
    vec3 col = mix(uColorInner, uColorMid, smoothstep(0.0, 0.35, t));
    col = mix(col, uColorOuter, smoothstep(0.3, 0.95, t));
    col = mix(col, uColorBlue, smoothstep(0.10, 0.0, t) * 0.45);

    // Relativistic beaming: material moving toward the camera brightens
    // and blue-shifts. Orbital velocity is tangential: v̂ = (-sinφ, 0, cosφ).
    vec3 vel = vec3(-sin(phi), 0.0, cos(phi));
    float beam = dot(vel, -rayDir);                  // >0 when approaching
    float dopp = 1.0 + uDoppler * beam * (1.0 - t * 0.5);
    dopp = max(dopp, 0.25);
    col = mix(col, uColorBlue, clamp(beam * uDoppler * 0.35, 0.0, 0.4));

    float intensity = radial * (0.35 + filaments) * dopp * dopp;
    float alpha = clamp(radial * (0.5 + filaments * 0.8), 0.0, 1.0);
    return vec4(col * intensity * 1.1, alpha);
  }

  void main() {
    // Reconstruct the eye ray for this pixel
    vec3 dirCam = normalize(vec3(vNdc.x * uTanHalfFov * uAspect,
                                 vNdc.y * uTanHalfFov,
                                 -1.0));
    vec3 rayDir = normalize(uCamBasis * dirCam);
    vec3 pos = uCamPos;
    vec3 vel = rayDir;

    // Conserved photon angular momentum h² = |r × v|²  (see header notes)
    vec3 hvec = cross(pos, vel);
    float h2 = dot(hvec, hvec) * uLensing;

    vec3 color = vec3(0.0);
    float transmit = 1.0;   // how much light still reaches the camera
    bool captured = false;

    float prevY = pos.y;

    for (int i = 0; i < STEPS; i++) {
      float r2 = dot(pos, pos);
      float r = sqrt(r2);

      // Adaptive step: fine near the photon sphere, coarse far away.
      // Budget must cover camera→far-disk-edge (~25 rs) within STEPS.
      float dt = clamp(0.045 * r, 0.06, 0.6);

      // Schwarzschild null-geodesic acceleration (leapfrog integration)
      vec3 accel = -1.5 * h2 * pos / (r2 * r2 * r);
      vel += accel * dt;
      pos += vel * dt;

      // Fell through the horizon → pure shadow
      if (dot(pos, pos) < HORIZON * HORIZON) { captured = true; break; }

      // Equatorial plane crossing → possible disk hit.
      // Interpolate to the exact crossing point for a clean thin disk.
      if (pos.y * prevY < 0.0) {
        float f = prevY / (prevY - pos.y);
        vec3 hit = mix(pos - vel * dt, pos, f);
        float hr = length(hit.xz);
        if (hr > uDiskInner && hr < uDiskOuter) {
          vec4 d = diskSample(hit, normalize(vel));
          color += d.rgb * transmit;
          transmit *= (1.0 - d.a * 0.85);
          if (transmit < 0.02) break;
        }
      }
      prevY = pos.y;

      // Escaped to infinity — stop integrating
      if (dot(pos, pos) > 900.0) break;
    }

    if (!captured && transmit > 0.02) {
      color += stars(normalize(vel)) * transmit;
    }

    // Whisper of ambient glow hugging the shadow (light scattered by gas)
    float b = length(cross(uCamPos, rayDir)) / length(uCamPos); // impact param
    float halo = exp(-abs(b - 2.6) * 0.9) * 0.022;
    if (!captured) color += halo * vec3(1.0, 0.6, 0.3);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createBlackHole() {
  const d = CONFIG.disk, s = CONFIG.stars;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime:          { value: 0 },
      uResolution:    { value: new THREE.Vector2() },
      uCamPos:        { value: new THREE.Vector3() },
      uCamBasis:      { value: new THREE.Matrix3() },
      uTanHalfFov:    { value: Math.tan(THREE.MathUtils.degToRad(CONFIG.camera.fov / 2)) },
      uAspect:        { value: 1 },
      uLensing:       { value: CONFIG.lensing.strength },
      uDiskSpeed:     { value: d.speed },
      uDiskInner:     { value: d.innerRadius },
      uDiskOuter:     { value: d.outerRadius },
      uDoppler:       { value: d.dopplerStrength },
      uColorOuter:    { value: new THREE.Vector3(...d.colorOuter) },
      uColorMid:      { value: new THREE.Vector3(...d.colorMid) },
      uColorInner:    { value: new THREE.Vector3(...d.colorInner) },
      uColorBlue:     { value: new THREE.Vector3(...d.colorBlue) },
      uStarDensity:   { value: s.density },
      uStarBrightness:{ value: s.brightness },
      uTwinkleSpeed:  { value: s.twinkleSpeed },
    },
  });

  // Single fullscreen triangle (fewer helper invocations than a quad)
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([-1, -1, 0,  3, -1, 0,  -1, 3, 0]), 3));

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1; // draw first, particles composite on top

  function update(time, camera) {
    const u = material.uniforms;
    u.uTime.value = time;
    u.uCamPos.value.copy(camera.position);
    u.uCamBasis.value.setFromMatrix4(camera.matrixWorld);
    u.uAspect.value = camera.aspect;
    u.uTanHalfFov.value = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  }

  return { mesh, material, update };
}
