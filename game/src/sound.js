// All of Solmar City's sound is synthesized with WebAudio — oscillators, filtered noise
// and short envelopes. No audio files, no network. The context is created lazily on the
// first user gesture (browsers block audio before that) and everything after that is a
// one-line call: shot, punch, siren, engine hum, jingles.

export function createSound() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

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
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, vol, cutoff) {
    if (!ensure()) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  const api = {
    /** Call from any user gesture so the context is allowed to start. */
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (muted) api.engine(0);
      return muted;
    },
    isMuted() {
      return muted;
    },
    click() {
      tone(660, 0.06, 'square', 0.12);
    },
    shot() {
      noiseBurst(0.16, 0.5, 2600);
      tone(160, 0.1, 'square', 0.22, 60);
    },
    punch() {
      noiseBurst(0.09, 0.4, 700);
      tone(120, 0.09, 'sine', 0.3, 55);
    },
    thud() {
      noiseBurst(0.12, 0.35, 400);
      tone(90, 0.14, 'sine', 0.3, 45);
    },
    crash() {
      noiseBurst(0.35, 0.55, 900);
      tone(70, 0.3, 'sawtooth', 0.2, 35);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.25);
      setTimeout(() => tone(1318, 0.14, 'sine', 0.25), 90);
    },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.28), i * 110));
    },
    fail() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sawtooth', 0.16), i * 130));
    },
    busted() {
      [440, 415, 392, 370].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.2), i * 160));
    },
    horn() {
      tone(370, 0.28, 'square', 0.18);
      tone(466, 0.28, 'square', 0.12);
    },
    /** Continuous engine hum: 0 silences it, 0..1 sets revs. */
    engine(level) {
      if (!ensure()) return;
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 420;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      const t0 = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(52 + level * 130, t0, 0.08);
      engineFilter.frequency.setTargetAtTime(300 + level * 900, t0, 0.08);
      engineGain.gain.setTargetAtTime(muted ? 0 : level * 0.14, t0, 0.08);
    },
    /** Two-tone police siren loop while wanted. */
    siren(on) {
      if (!ensure()) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 700;
        sirenLfo = ctx.createOscillator();
        sirenLfo.type = 'square';
        sirenLfo.frequency.value = 0.55;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 260;
        sirenLfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.05;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        sirenLfo.start();
      } else if (!on && sirenOsc) {
        try { sirenOsc.stop(); sirenLfo.stop(); } catch { /* already stopped */ }
        sirenOsc = null;
        sirenLfo = null;
        sirenGain = null;
      }
    },
    /** A lazy sunset bassline that starts with the game and loops quietly. */
    startMusic() {
      if (!ensure() || musicTimer) return;
      const bass = [55, 0, 65.4, 0, 49, 0, 58.3, 73.4];
      musicTimer = setInterval(() => {
        if (muted) return;
        const f = bass[musicStep % bass.length];
        musicStep += 1;
        if (f) tone(f, 0.42, 'triangle', 0.1);
        if (musicStep % 4 === 1) tone(220, 0.1, 'sine', 0.035);
      }, 460);
    },
    stopMusic() {
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    },
  };
  return api;
}
