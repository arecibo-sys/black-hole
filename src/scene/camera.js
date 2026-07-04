/**
 * Cinematic camera — slow perpetual orbit, now with user control.
 *
 *   • drag  : orbit around the black hole (yaw / pitch)
 *   • scroll: zoom in and out (dolly)
 *   • idle  : the auto-orbit keeps drifting underneath, so the shot
 *             never sits still, and gentle breathing of radius and
 *             elevation continues at incommensurate frequencies.
 *
 * All motion goes through exponential smoothing toward target spherical
 * coordinates, which keeps the camera C¹-continuous — no pops when the
 * user grabs or releases it.
 */
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export function createCinematicCamera(aspect, domElement) {
  const C = CONFIG.camera;
  const camera = new THREE.PerspectiveCamera(C.fov, aspect, 0.1, 1000);

  // target spherical coordinates (what we chase)
  let tYaw = 0;
  let tPitch = C.elevation;
  let tRadius = C.radius;
  // current (smoothed) values
  let yaw = tYaw, pitch = tPitch, radius = tRadius;

  // ── pointer input ─────────────────────────────────────────────────────
  let dragging = false;
  let lastX = 0, lastY = 0;

  domElement.style.cursor = 'grab';
  domElement.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    domElement.style.cursor = 'grabbing';
    domElement.setPointerCapture(e.pointerId);
  });
  domElement.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    tYaw -= (e.clientX - lastX) * 0.004;
    tPitch += (e.clientY - lastY) * 0.003;
    // don't let the view flip over the poles; keep the disk in frame
    tPitch = THREE.MathUtils.clamp(tPitch, -1.25, 1.25);
    lastX = e.clientX; lastY = e.clientY;
  });
  const endDrag = () => { dragging = false; domElement.style.cursor = 'grab'; };
  domElement.addEventListener('pointerup', endDrag);
  domElement.addEventListener('pointercancel', endDrag);

  domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    // exponential dolly feels uniform at every distance
    tRadius *= Math.exp(e.deltaY * 0.0012);
    tRadius = THREE.MathUtils.clamp(tRadius, 3.2, 40);
  }, { passive: false });

  function update(time, dt) {
    // auto-orbit keeps drifting; pauses while the user is dragging
    if (!dragging) tYaw += C.speed * dt;

    // cinematic breathing layered on top of the user's framing
    const breatheR = Math.sin(time * 0.021) * C.radiusDrift;
    const breatheP = Math.sin(time * 0.013 + 1.7) * C.elevationDrift;

    // exponential smoothing: frame-rate independent, perfectly smooth
    const k = 1 - Math.exp(-dt / C.smoothing);
    yaw += (tYaw - yaw) * k;
    pitch += (tPitch + breatheP - pitch) * k;
    radius += (tRadius + breatheR - radius) * k;

    camera.position.set(
      Math.cos(yaw) * radius * Math.cos(pitch),
      Math.sin(pitch) * radius,
      Math.sin(yaw) * radius * Math.cos(pitch),
    );
    camera.lookAt(0, 0, 0); // event horizon always dead center
    camera.updateMatrixWorld();
  }

  return { camera, update };
}
