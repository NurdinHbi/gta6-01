// Synthesized sound only — WebAudio oscillators and filtered noise, no
// audio files. Everything is created lazily on the first user gesture so
// the page never needs an autoplay permission before the player starts.
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    muted: false,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenTimer: 0,
    started: false,
  };

  audio.ensure = () => {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new Ctx();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.5;
      audio.master.connect(audio.ctx.destination);
      // Engine hum: two detuned sawtooths through a low-pass, pitch by speed.
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      const engineOsc2 = audio.ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 58;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      audio.engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      engineOsc2.start();
      audio.engineOsc2 = engineOsc2;
      // Police siren: a sine that wails between two notes.
      audio.sirenOsc = audio.ctx.createOscillator();
      audio.sirenOsc.type = 'sine';
      audio.sirenOsc.frequency.value = 700;
      audio.sirenGain = audio.ctx.createGain();
      audio.sirenGain.gain.value = 0;
      audio.sirenOsc.connect(audio.sirenGain);
      audio.sirenGain.connect(audio.master);
      audio.sirenOsc.start();
      audio.started = true;
    } catch {
      audio.ctx = null;
    }
  };

  audio.setMuted = (muted) => {
    audio.muted = muted;
    if (audio.master && audio.ctx) audio.master.gain.value = muted ? 0 : 0.5;
  };

  // Continuous layers, called every frame with the live game state.
  audio.update = (speedKmh, wanted, dt) => {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    if (audio.engineGain) {
      const target = speedKmh > 1 ? 0.05 + Math.min(0.12, speedKmh / 1400) : 0;
      audio.engineGain.gain.setTargetAtTime(target, t, 0.1);
      const freq = 55 + speedKmh * 1.1;
      audio.engineOsc.frequency.setTargetAtTime(freq, t, 0.1);
      audio.engineOsc2.frequency.setTargetAtTime(freq * 1.02 + 3, t, 0.1);
    }
    if (audio.sirenGain && audio.sirenOsc) {
      if (wanted >= 2) {
        audio.sirenTimer += dt;
        const wail = Math.sin(audio.sirenTimer * 2.4) > 0 ? 880 : 660;
        audio.sirenOsc.frequency.setTargetAtTime(wail, t, 0.05);
        audio.sirenGain.gain.setTargetAtTime(0.045, t, 0.2);
      } else {
        audio.sirenGain.gain.setTargetAtTime(0, t, 0.2);
      }
    }
  };

  function blip(freq, dur, type, vol, slideTo) {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    const len = Math.max(1, Math.floor(audio.ctx.sampleRate * dur));
    const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 3000;
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    src.start(t);
  }

  audio.gunshot = () => noiseBurst(0.16, 0.5, 2600);
  audio.punch = () => noiseBurst(0.09, 0.3, 900);
  audio.crash = () => noiseBurst(0.25, 0.35, 500);
  audio.pickup = () => { blip(660, 0.09, 'sine', 0.18); setTimeout(() => blip(990, 0.12, 'sine', 0.18), 90); };
  audio.click = () => blip(520, 0.05, 'square', 0.08);
  audio.missionJingle = () => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.2), i * 130));
  };
  audio.failSting = () => { blip(330, 0.3, 'sawtooth', 0.14, 165); };
  audio.sirenBlip = () => { blip(880, 0.12, 'sine', 0.12, 660); };

  return audio;
}
