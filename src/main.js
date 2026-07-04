/**
 * Entry point — wires renderer, scene modules, camera, and post pipeline.
 *
 * Architecture:
 *   config.js            all tunable parameters
 *   scene/blackhole.js   fullscreen geodesic ray-marching shader
 *                        (lensing, shadow, accretion disk, star field)
 *   scene/particles.js   GPU-animated infalling dust (single draw call)
 *   scene/camera.js      smoothed cinematic orbit
 *   post/composer.js     bloom → grade → ACES tone map
 */
import * as THREE from 'three';
import { createBlackHole } from './scene/blackhole.js';
import { createParticles } from './scene/particles.js';
import { createCinematicCamera } from './scene/camera.js';
import { createComposer } from './post/composer.js';

const renderer = new THREE.WebGLRenderer({
  antialias: false, // the geodesic shader supersamples poorly; bloom + dither hide aliasing
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
// Cap pixel ratio: the lensing shader is fragment-bound, and >1.5x DPR
// buys little visible quality for a large fill-rate cost.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const { camera, update: updateCamera } = createCinematicCamera(
  window.innerWidth / window.innerHeight, renderer.domElement);

const blackHole = createBlackHole();
scene.add(blackHole.mesh);

const particles = createParticles();
scene.add(particles.points);

const post = createComposer(renderer, scene, camera);

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  post.composer.setSize(w, h);
});

const clock = new THREE.Clock();
let elapsed = 0;

renderer.setAnimationLoop(() => {
  // clamp dt so a background-tab pause doesn't lurch the camera
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  updateCamera(elapsed, dt);
  blackHole.update(elapsed, camera);
  particles.update(elapsed);
  post.update(elapsed);

  post.composer.render();
});
