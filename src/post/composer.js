/**
 * Post-processing pipeline:
 *
 *   RenderPass → UnrealBloomPass → Grade pass (vignette / saturation /
 *   contrast / dither) → OutputPass (ACES filmic tone map + sRGB encode)
 *
 * Bloom is kept restrained (threshold above disk mid-tones) so only the
 * hot inner disk and photon ring bleed light — physically plausible glare
 * rather than a glow filter. The dither in the grade pass breaks up
 * banding in the smooth dark gradients around the shadow.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from '../config.js';

const GradeShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uVignette:  { value: CONFIG.post.vignetteStrength },
    uSoftness:  { value: CONFIG.post.vignetteSoftness },
    uSaturation:{ value: CONFIG.post.saturation },
    uContrast:  { value: CONFIG.post.contrast },
    uTime:      { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uSoftness;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uTime;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;

      // saturation & contrast around mid-grey
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      col = max(col, 0.0);

      // gentle cool shadows / warm highlights split-tone
      col *= mix(vec3(0.96, 0.98, 1.05), vec3(1.04, 1.0, 0.95),
                 smoothstep(0.1, 0.7, luma));

      // vignette
      float r = distance(vUv, vec2(0.5)) * 1.4142;
      col *= 1.0 - uVignette * smoothstep(1.0 - uSoftness, 1.25, r);

      // triangular dither kills banding in the dark halo gradients
      float n = hash(vUv * 1237.0 + fract(uTime)) - 0.5;
      col += n / 255.0;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createComposer(renderer, scene, camera) {
  const P = CONFIG.post;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = P.exposure;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    P.bloomStrength, P.bloomRadius, P.bloomThreshold,
  );
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  composer.addPass(new OutputPass());

  function update(time) {
    grade.uniforms.uTime.value = time;
  }

  return { composer, bloom, update };
}
