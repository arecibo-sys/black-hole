/**
 * Infalling dust & gas — a single THREE.Points draw call whose motion is
 * computed entirely in the vertex shader. The CPU touches nothing per frame
 * except a time uniform, so 20k+ particles cost almost nothing.
 *
 * Each particle carries static attributes (spawn radius, phase, speed,
 * inclination, seed). The vertex shader turns those into a slowly decaying
 * spiral: radius shrinks over a per-particle looping lifetime, angle advances
 * at the local Keplerian rate, and layered sinusoids at incommensurate
 * frequencies add turbulence so the swarm never visibly repeats.
 * Particles fade in at their spawn radius and fade out near the horizon,
 * hiding the loop seam.
 */
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const vertexShader = /* glsl */ `
  attribute float aRadius;     // spawn radius
  attribute float aPhase;      // initial orbital angle
  attribute float aSpeed;      // per-particle speed multiplier
  attribute float aIncline;    // orbital plane tilt
  attribute float aSeed;       // random 0..1, decorrelates everything
  attribute float aSize;

  uniform float uTime;
  uniform float uInspiral;
  uniform float uTurbulence;
  uniform float uBaseSize;
  uniform float uMinRadius;

  varying float vHeat;    // 0 far → 1 at horizon, drives color
  varying float vAlpha;

  void main() {
    // Looping lifetime: each particle repeatedly rides its spiral inward.
    float life = fract(uTime * uInspiral * aSpeed * 0.05 + aSeed);
    float r = mix(aRadius, uMinRadius, life * life); // accelerate as it falls

    // Keplerian angle advance, ω ∝ r^-1.5
    float angle = aPhase + uTime * aSpeed * 2.2 * pow(r, -1.5)
                + aSeed * 6.2831;

    // Turbulence: three incommensurate sinusoids — never periodic in view
    float t1 = sin(uTime * 0.37 * aSpeed + aSeed * 21.7);
    float t2 = sin(uTime * 0.61 * aSpeed + aSeed * 13.1);
    float t3 = cos(uTime * 0.23 * aSpeed + aSeed * 34.9);
    vec3 wobble = vec3(t1, t2 * 0.6, t3) * uTurbulence * (0.15 + life * 0.4);

    vec3 pos = vec3(cos(angle) * r, 0.0, sin(angle) * r);
    // tilt each orbit slightly out of the disk plane → volumetric shell
    pos.y = sin(angle * 2.0 + aSeed * 40.0) * aIncline * r * 0.10
          + (aSeed - 0.5) * 0.22;
    pos += wobble;

    vHeat = clamp(1.0 - (r - uMinRadius) / 8.0, 0.0, 1.0);

    // fade in after spawn, fade out before the horizon swallow
    vAlpha = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.75, 1.0, life));
    vAlpha *= 0.05 + aSeed * 0.08;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = uBaseSize * aSize * (30.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  precision mediump float;
  varying float vHeat;
  varying float vAlpha;
  uniform vec3 uColdColor;
  uniform vec3 uHotColor;

  void main() {
    // soft round sprite
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float mask = exp(-d * d * 12.0) * step(d, 0.5);
    vec3 col = mix(uColdColor, uHotColor, vHeat * vHeat);
    gl_FragColor = vec4(col * (0.4 + vHeat * 1.6), mask * vAlpha);
  }
`;

export function createParticles() {
  const P = CONFIG.particles;
  const n = P.count;

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(n * 3); // dummy; real pos from attrs
  const radius = new Float32Array(n);
  const phase = new Float32Array(n);
  const speed = new Float32Array(n);
  const incline = new Float32Array(n);
  const seed = new Float32Array(n);
  const size = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    // bias spawn radii outward so density thins near the hole
    const u = Math.random();
    radius[i] = P.minRadius + (P.maxRadius - P.minRadius) * Math.sqrt(u);
    phase[i] = Math.random() * Math.PI * 2;
    speed[i] = 0.6 + Math.random() * 0.9;
    incline[i] = Math.random() * Math.random(); // most stay near the plane
    seed[i] = Math.random();
    size[i] = 0.5 + Math.random() * 1.3;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
  geometry.setAttribute('aIncline', new THREE.BufferAttribute(incline, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime:       { value: 0 },
      uInspiral:   { value: P.inspiralRate },
      uTurbulence: { value: P.turbulence },
      uBaseSize:   { value: P.baseSize },
      uMinRadius:  { value: P.minRadius },
      uColdColor:  { value: new THREE.Vector3(0.55, 0.30, 0.16) },
      uHotColor:   { value: new THREE.Vector3(1.0, 0.85, 0.65) },
    },
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  function update(time) {
    material.uniforms.uTime.value = time;
  }

  return { points, update };
}
