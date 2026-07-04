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

  // ── pointer input (mouse + touch, via pointer events) ────────────────
  // One pointer  → orbit.  Two pointers → pinch zoom.
  // touch-action: none stops the browser from hijacking the gestures
  // for page scroll / pinch-page-zoom on mobile.
  const pointers = new Map(); // pointerId → {x, y}
  let pinchDist = 0;

  const zoomBy = (factor) => {
    tRadius = THREE.MathUtils.clamp(tRadius * factor, 3.2, 40);
  };

  domElement.style.cursor = 'grab';
  domElement.style.touchAction = 'none';

  domElement.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    domElement.setPointerCapture(e.pointerId);
    domElement.style.cursor = 'grabbing';
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });

  domElement.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;

    if (pointers.size === 1) {
      // orbit
      tYaw -= (e.clientX - p.x) * 0.004;
      tPitch += (e.clientY - p.y) * 0.003;
      // don't let the view flip over the poles; keep the disk in frame
      tPitch = THREE.MathUtils.clamp(tPitch, -1.25, 1.25);
    }

    p.x = e.clientX; p.y = e.clientY;

    if (pointers.size === 2) {
      // pinch: spreading fingers → dolly in, pinching → dolly out
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0 && d > 0) zoomBy(pinchDist / d);
      pinchDist = d;
    }
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    pinchDist = 0;
    if (pointers.size === 0) domElement.style.cursor = 'grab';
  };
  domElement.addEventListener('pointerup', endPointer);
  domElement.addEventListener('pointercancel', endPointer);

  domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    // exponential dolly feels uniform at every distance
    zoomBy(Math.exp(e.deltaY * 0.0012));
  }, { passive: false });

  function update(time, dt) {
    // auto-orbit keeps drifting; pauses while the user is interacting
    if (pointers.size === 0) tYaw += C.speed * dt;

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
