// All sound is synthesized WebAudio — no audio files. A noise buffer feeds
// gunshots and skids, oscillators feed the engine, the siren and the jingles.
// Everything is created lazily on the first user gesture (browsers block audio
// before that) and every method is a no-op until then.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 1;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  return {
    ensure,
    get ready() { return !!ctx; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    update(dt, speed, wanted) {
      if (!ctx) return;
      if (engineGain) {
        const target = speed > 0.5 ? 0.05 + Math.min(0.12, speed * 0.0025) : 0;
        engineGain.gain.value += (target - engineGain.gain.value) * Math.min(1, dt * 6);
        engineOsc.frequency.value = 50 + speed * 3.2;
      }
      if (sirenGain) {
        const want = wanted > 0 ? 0.045 : 0;
        sirenGain.gain.value += (want - sirenGain.gain.value) * Math.min(1, dt * 4);
        sirenTimer -= dt;
        if (sirenTimer <= 0) {
          sirenTimer = 0.42;
          sirenHigh = !sirenHigh;
          sirenOsc.frequency.value = sirenHigh ? 880 : 660;
        }
      }
    },
    shot(weaponIndex) {
      if (!ensure()) return;
      if (weaponIndex === 2) { noise(0.28, 0.5, 900); blip(140, 0.18, 'square', 0.25, 50); }
      else if (weaponIndex === 1) { noise(0.09, 0.3, 2400); blip(320, 0.06, 'square', 0.12, 180); }
      else { noise(0.14, 0.4, 1800); blip(220, 0.1, 'square', 0.2, 90); }
    },
    punch() { noise(0.08, 0.25, 500); blip(120, 0.08, 'sine', 0.2, 60); },
    reload() { blip(500, 0.05, 'square', 0.1); setTimeout(() => blip(700, 0.05, 'square', 0.1), 120); },
    pickup() { blip(660, 0.09, 'sine', 0.22); setTimeout(() => blip(990, 0.14, 'sine', 0.22), 90); },
    coin() { blip(880, 0.07, 'sine', 0.18); setTimeout(() => blip(1320, 0.1, 'sine', 0.18), 70); },
    jingle() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.22), i * 110));
    },
    fail() { [330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.2, 'sawtooth', 0.14), i * 130)); },
    crash() { noise(0.35, 0.45, 600); blip(90, 0.3, 'sine', 0.3, 40); },
    skid() { noise(0.18, 0.12, 3000); },
    splash() { noise(0.4, 0.3, 800); blip(300, 0.3, 'sine', 0.15, 90); },
    click() { blip(800, 0.04, 'square', 0.08); },
  };
}
