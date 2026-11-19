// Synthesized WebAudio sound for Solmar City. No audio files: every sound is
// built from oscillators and filtered noise, started only after a user gesture.
const AudioSys = {
  ctx: null,
  master: null,
  engineOsc: null,
  engineGain: null,
  sirenOsc: null,
  sirenGain: null,
  sirenLfo: null,
  enabled: true,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.enabled = false; }
  },

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  },

  _blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  _noise(dur, vol, filterFreq, type) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur + 0.05);
    const f = this.ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  },

  click() { this._blip(660, 0.07, 'square', 0.12); },
  punch() { this._noise(0.12, 0.5, 300); this._blip(90, 0.1, 'sine', 0.4, 50); },
  shot() { this._noise(0.16, 0.7, 2600, 'highpass'); this._blip(160, 0.09, 'square', 0.3, 60); },
  pickup() { this._blip(880, 0.1, 'sine', 0.25); setTimeout(() => this._blip(1320, 0.16, 'sine', 0.25), 90); },
  success() { const n = [523, 659, 784, 1047]; n.forEach((f, i) => setTimeout(() => this._blip(f, 0.22, 'triangle', 0.3), i * 110)); },
  fail() { this._blip(220, 0.3, 'sawtooth', 0.25, 110); setTimeout(() => this._blip(165, 0.4, 'sawtooth', 0.25, 90), 180); },
  busted() { [440, 415, 392, 370].forEach((f, i) => setTimeout(() => this._blip(f, 0.3, 'triangle', 0.3), i * 160)); },
  horn() { this._blip(370, 0.25, 'square', 0.15); },
  crash() { this._noise(0.3, 0.6, 500); },
  step() { this._noise(0.05, 0.08, 400); },

  engineStart() {
    if (!this.ctx || !this.enabled || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
  },
  engineSet(speedKmh, on) {
    if (!this.engineOsc || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + Math.min(0.06, speedKmh / 2400) : 0.0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(48 + speedKmh * 1.15, t, 0.08);
  },
  engineStop() {
    if (!this.engineOsc) return;
    try { this.engineOsc.stop(); } catch (e) {}
    this.engineOsc = null; this.engineGain = null;
  },

  sirenStart() {
    if (!this.ctx || !this.enabled || this.sirenOsc) return;
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 750;
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 1.1;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 180;
    this.sirenLfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0.045;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start(); this.sirenLfo.start();
  },
  sirenStop() {
    if (!this.sirenOsc) return;
    try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch (e) {}
    this.sirenOsc = null; this.sirenLfo = null; this.sirenGain = null;
  },
};
