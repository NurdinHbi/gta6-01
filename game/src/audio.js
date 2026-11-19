// All sound is synthesized with WebAudio: no audio files, nothing fetched.
// A tiny engine drone, gunshots, punches, sirens, pickups, jingles and a slow
// ambient pad loop. Everything is guarded so a missing AudioContext never throws.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.padTimer = null;
    this.padStep = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngine();
      this.startPad();
      return true;
    } catch {
      return false;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  startEngine() {
    const c = this.ctx;
    this.engineOsc = c.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = c.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 28;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineOsc.connect(filter);
    this.engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  // speedRatio 0..1 while driving; 0 silences the engine (on foot).
  setEngine(speedRatio, driving) {
    if (!this.ctx || !this.engineGain) return;
    const target = driving ? 0.05 + speedRatio * 0.11 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    const f = 52 + speedRatio * 130;
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(f / 2, this.ctx.currentTime, 0.1);
  }

  noiseBurst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!this.ctx) return;
    const c = this.ctx;
    const len = Math.max(1, Math.floor(c.sampleRate * duration));
    const buffer = c.createBuffer(1, len, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = c.createGain();
    gain.gain.value = gainValue;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  tone(freq, duration, type = 'sine', gainValue = 0.2, when = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(gainValue, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  gunshot() {
    this.noiseBurst(0.14, 1800, 0.5, 'highpass');
    this.tone(90, 0.12, 'sine', 0.35);
  }

  punch() {
    this.noiseBurst(0.09, 300, 0.4);
  }

  hit() {
    this.tone(160, 0.1, 'square', 0.16);
  }

  pickup() {
    this.tone(660, 0.1, 'sine', 0.2);
    this.tone(990, 0.14, 'sine', 0.2, 0.07);
  }

  cash() {
    this.tone(880, 0.09, 'triangle', 0.22);
    this.tone(1174, 0.09, 'triangle', 0.22, 0.08);
    this.tone(1568, 0.18, 'triangle', 0.22, 0.16);
  }

  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.24, i * 0.11));
  }

  missionFail() {
    [392, 330, 262].forEach((f, i) => this.tone(f, 0.25, 'sawtooth', 0.12, i * 0.14));
  }

  busted() {
    [220, 185, 147].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.14, i * 0.2));
  }

  sirenStart() {
    if (!this.ctx || this.sirenOsc) return;
    const c = this.ctx;
    this.sirenOsc = c.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 750;
    this.sirenLfo = c.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.9;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 220;
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = c.createGain();
    this.sirenGain.gain.value = 0.045;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  sirenStop() {
    if (!this.sirenOsc) return;
    try {
      this.sirenOsc.stop();
      this.sirenLfo.stop();
    } catch { /* already stopped */ }
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.sirenGain = null;
  }

  // Slow warm pad: one soft chord every few seconds, cycling through four chords.
  startPad() {
    const chords = [
      [220, 277, 330],
      [196, 247, 294],
      [175, 220, 262],
      [196, 262, 330],
    ];
    const play = () => {
      if (!this.muted && this.ctx) {
        const chord = chords[this.padStep % chords.length];
        this.padStep += 1;
        chord.forEach((f) => this.tone(f, 3.4, 'sine', 0.028));
      }
      this.padTimer = window.setTimeout(play, 3400);
    };
    this.padTimer = window.setTimeout(play, 1200);
  }
}
