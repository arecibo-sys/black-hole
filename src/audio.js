/**
 * Ambient audio — a procedural deep-space soundscape, generated entirely
 * with the Web Audio API (no samples, nothing to download).
 *
 * Design goal: non-intrusive. The mix sits far in the background:
 *
 *   • brown noise → 90 Hz lowpass  : distant rumble of infalling matter
 *   • two detuned sub oscillators  : slow beating drone (~0.6 Hz beat)
 *   • brown noise → gentle bandpass: faint airy shimmer, barely there
 *
 * Every element is amplitude-modulated by slow LFOs at incommensurate
 * rates, so the bed evolves and never loops audibly. Master gain fades
 * in over ~8 s and never exceeds a whisper.
 *
 * Browsers block audio until a user gesture, so start() is wired to the
 * first pointerdown; a small speaker toggle lets the user mute anytime.
 */
export function createAmbientAudio() {
  let ctx = null;
  let master = null;
  let started = false;
  let muted = false;
  const VOLUME = 0.22; // whisper-level master ceiling

  // 8 seconds of looped brown noise (integrated white noise)
  function brownNoiseBuffer(context) {
    const len = context.sampleRate * 8;
    const buf = context.createBuffer(1, len, context.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    // crossfade the loop seam
    const fade = context.sampleRate * 0.05;
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      data[i] = data[i] * k + data[len - fade + i] * (1 - k);
    }
    return buf;
  }

  // slow sine LFO wired to a gain param: value = base ± depth
  function lfo(context, param, base, depth, hz) {
    param.value = base;
    const osc = context.createOscillator();
    osc.frequency.value = hz;
    const g = context.createGain();
    g.gain.value = depth;
    osc.connect(g).connect(param);
    osc.start();
  }

  function start() {
    if (started) return;
    started = true;

    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const noise = brownNoiseBuffer(ctx);

    // ── deep rumble ────────────────────────────────────────────────
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = noise;
    rumbleSrc.loop = true;
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.Q.value = 0.5;
    lfo(ctx, rumbleLp.frequency, 90, 35, 0.017); // filter slowly breathes
    const rumbleGain = ctx.createGain();
    lfo(ctx, rumbleGain.gain, 0.5, 0.15, 0.031);
    rumbleSrc.connect(rumbleLp).connect(rumbleGain).connect(master);
    rumbleSrc.start();

    // ── beating sub drone ──────────────────────────────────────────
    for (const [freq, level, rate] of [[41.2, 0.16, 0.011], [41.8, 0.14, 0.019]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      lfo(ctx, g.gain, level, level * 0.5, rate);
      osc.connect(g).connect(master);
      osc.start();
    }

    // ── faint shimmer ──────────────────────────────────────────────
    const shimmerSrc = ctx.createBufferSource();
    shimmerSrc.buffer = noise;
    shimmerSrc.loop = true;
    shimmerSrc.playbackRate.value = 1.7; // shift the noise spectrum up
    const shimmerBp = ctx.createBiquadFilter();
    shimmerBp.type = 'bandpass';
    shimmerBp.Q.value = 0.8;
    lfo(ctx, shimmerBp.frequency, 1600, 500, 0.023);
    const shimmerGain = ctx.createGain();
    lfo(ctx, shimmerGain.gain, 0.028, 0.018, 0.041);
    shimmerSrc.connect(shimmerBp).connect(shimmerGain).connect(master);
    shimmerSrc.start();

    // long fade-in so the sound arrives unnoticed
    master.gain.linearRampToValueAtTime(muted ? 0 : VOLUME, ctx.currentTime + 8);
  }

  function setMuted(m) {
    muted = m;
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(m ? 0 : VOLUME, t + 0.8);
  }

  return {
    start,
    get muted() { return muted; },
    toggle() { setMuted(!muted); return muted; },
  };
}
