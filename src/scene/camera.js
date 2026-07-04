/**
 * Cinematic camera — a perpetual slow orbit around the black hole.
 *
 * The target position is a composition of very-low-frequency sinusoids
 * (orbit angle, breathing radius, drifting elevation) at incommensurate
 * frequencies, so the path never exactly repeats. The camera then chases
 * that target through critically-damped exponential smoothing, which
 * guarantees C¹-continuous motion — no pops, no easing seams.
 */
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function createCinematicCamera(aspect) {
  const C = CONFIG.camera;
  const camera = new THREE.PerspectiveCamera(C.fov, aspect, 0.1, 1000);

  const target = new THREE.Vector3();
  let initialized = false;

  function idealPosition(t, out) {
    const angle = t * C.speed;
    // breathing distance & elevation drift at unrelated frequencies
    const radius = C.radius + Math.sin(t * 0.021) * C.radiusDrift;
    const elev = C.elevation + Math.sin(t * 0.013 + 1.7) * C.elevationDrift;
    out.set(
      Math.cos(angle) * radius * Math.cos(elev),
      Math.sin(elev) * radius,
      Math.sin(angle) * radius * Math.cos(elev),
    );
    return out;
  }

  function update(time, dt) {
    idealPosition(time, target);
    if (!initialized) {
      camera.position.copy(target);
      initialized = true;
    } else {
      // exponential smoothing: frame-rate independent, perfectly smooth
      const k = 1 - Math.exp(-dt / C.smoothing);
      camera.position.lerp(target, k);
    }
    camera.lookAt(0, 0, 0); // event horizon always dead center
    camera.updateMatrixWorld();
  }

  return { camera, update };
}
