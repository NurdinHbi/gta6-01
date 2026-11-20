// All sound is synthesized with WebAudio — no audio files. Engine hum is a
// detuned sawtooth pair through a lowpass; sirens are two alternating tones;
// gunshots are filtered noise bursts; pickups and Mara's jingle are short
// sine arpeggios. Nothing plays until the first user gesture unlocks audio.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc1 = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine hum: two saws a fifth apart, quiet until the car moves.
      engineOsc1 = ctx.createOscillator();
      engineOsc2 = ctx.createOscillator();
      engineOsc1.type = 'sawtooth';
      engineOsc2.type = 'sawtooth';
      engineOsc2.detune.value = 7;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc1.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc1.start();
      engineOsc2.start();
      // Police siren: a square wave whose pitch flips between two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 720;
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

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, freq) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    engine(speed01, driving) {
      if (!ctx) return;
      const target = driving ? 0.05 + speed01 * 0.1 : 0;
      engineGain.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.08);
      const freq = 55 + speed01 * 130;
      engineOsc1.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
      engineOsc2.frequency.setTargetAtTime(freq * 1.5, ctx.currentTime, 0.05);
    },
    siren(on, dt) {
      if (!ctx) return;
      if (!on) {
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      sirenTimer += dt;
      const high = Math.floor(sirenTimer / 0.45) % 2 === 0;
      sirenOsc.frequency.setTargetAtTime(high ? 960 : 720, ctx.currentTime, 0.02);
      sirenGain.gain.setTargetAtTime(muted ? 0 : 0.045, ctx.currentTime, 0.1);
    },
    gunshot(kind) {
      if (kind === 2) {
        noise(0.32, 0.5, 900);
        tone(140, 0.18, 'sine', 0.3, 0, 55);
      } else if (kind === 1) {
        noise(0.12, 0.32, 2400);
        tone(220, 0.08, 'square', 0.12, 0, 90);
      } else {
        noise(0.18, 0.4, 1600);
        tone(180, 0.12, 'square', 0.16, 0, 70);
      }
    },
    punch() {
      noise(0.09, 0.3, 500);
      tone(90, 0.1, 'sine', 0.25, 0, 45);
    },
    reload() {
      tone(520, 0.06, 'square', 0.1);
      tone(760, 0.06, 'square', 0.1, 0.12);
    },
    pickup() {
      tone(880, 0.12, 'sine', 0.22);
      tone(1318, 0.18, 'sine', 0.22, 0.1);
    },
    jingle() {
      // Mara's job jingle: a rising four-note figure.
      const notes = [523, 659, 784, 1046];
      notes.forEach((n, i) => tone(n, 0.22, 'triangle', 0.22, i * 0.11));
    },
    busted() {
      tone(392, 0.3, 'sawtooth', 0.16, 0, 196);
      tone(196, 0.6, 'sawtooth', 0.16, 0.3, 98);
    },
    crash() {
      noise(0.25, 0.4, 700);
    },
    splash() {
      noise(0.5, 0.25, 1200);
    },
  };
}
