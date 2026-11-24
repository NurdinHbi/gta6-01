// All sound is synthesized with WebAudio — no audio files. Engine hum is a
// detuned sawtooth pair through a lowpass; gunshots are filtered noise
// bursts; pickups are short sine arpeggios. The car radio (Q) cycles three
// synthesized stations: Solmar FM (mellow), Neon Nights (synthwave arpeggio)
// and Beach Radio (off-beat bounce). Nothing plays until a user gesture
// unlocks audio.
export const RADIO_STATIONS = [
  { name: 'Solmar FM', desc: 'mellow drive-time' },
  { name: 'Neon Nights', desc: 'synthwave' },
  { name: 'Beach Radio', desc: 'island bounce' },
];

const PATTERNS = [
  // Solmar FM — slow major-key pad walk.
  { bpm: 72, bass: [48, 43, 45, 41], lead: [72, 76, 79, 76, 74, 71, 74, 76], wave: 'sine' },
  // Neon Nights — driving 16th-note arpeggio.
  { bpm: 118, bass: [38, 38, 41, 43], lead: [62, 65, 69, 72, 69, 65, 62, 58], wave: 'square' },
  // Beach Radio — off-beat bounce.
  { bpm: 96, bass: [41, 45, 48, 45], lead: [69, 72, 76, 72, 74, 71, 69, 67], wave: 'triangle' },
];

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let radioTimer = null;
  let radioStep = 0;
  let radioOn = false;
  let radioStation = 0;
  let rainGain = null;
  let rainSrc = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, cutoff) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = cutoff;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(filter); filter.connect(g); g.connect(master);
    src.start();
  }

  function radioTick() {
    if (!ctx || muted || !radioOn) return;
    const pat = PATTERNS[radioStation];
    const stepDur = 60 / pat.bpm / 2;
    const i = radioStep % 8;
    const bassNote = pat.bass[Math.floor(radioStep / 2) % pat.bass.length];
    blip(midiToFreq(bassNote), stepDur * 1.8, 'sine', 0.16);
    if (radioStation === 1 || i % 2 === 0) {
      blip(midiToFreq(pat.lead[i]), stepDur * 0.9, pat.wave, radioStation === 1 ? 0.07 : 0.12);
    }
    radioStep += 1;
    radioTimer = setTimeout(radioTick, stepDur * 1000);
  }

  return {
    get muted() { return muted; },
    get station() { return radioStation; },
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shot() { noiseBurst(0.14, 0.5, 2400); },
    punch() { noiseBurst(0.08, 0.3, 900); },
    pickup() { blip(660, 0.12, 'sine', 0.25); blip(990, 0.18, 'sine', 0.25, 0.09); },
    cash() { blip(880, 0.1, 'sine', 0.22); blip(1174, 0.1, 'sine', 0.22, 0.08); blip(1568, 0.22, 'sine', 0.22, 0.16); },
    fail() { blip(220, 0.25, 'sawtooth', 0.18); blip(165, 0.35, 'sawtooth', 0.18, 0.15); },
    siren(on) {
      if (!ensure()) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'sine';
        sirenGain = ctx.createGain(); sirenGain.gain.value = 0.05;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.7;
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 320;
        lfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
        sirenOsc.frequency.value = 880;
        sirenOsc.connect(sirenGain); sirenGain.connect(master);
        sirenOsc.start(); lfo.start();
        sirenOsc._lfo = lfo;
      } else if (!on && sirenOsc) {
        try { sirenOsc._lfo.stop(); sirenOsc.stop(); } catch { /* already stopped */ }
        sirenOsc = null; sirenGain = null;
      }
    },
    engine(speed, driving) {
      if (!ensure()) return;
      if (driving && !engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain(); engineGain.gain.value = 0.03;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 700;
        engineOsc.connect(filter); filter.connect(engineGain); engineGain.connect(master);
        engineOsc.start();
      }
      if (engineOsc) {
        engineOsc.frequency.value = 55 + Math.abs(speed) * 4.5;
        engineGain.gain.value = driving ? 0.03 + Math.abs(speed) * 0.0012 : 0;
      }
    },
    setRadio(station, on) {
      radioStation = ((station % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length;
      radioOn = !!on;
      if (radioTimer) { clearTimeout(radioTimer); radioTimer = null; }
      radioStep = 0;
      if (radioOn && ctx && !muted) radioTick();
      return RADIO_STATIONS[radioStation].name;
    },
    rain(on) {
      if (!ensure()) return;
      if (on && !rainSrc) {
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
        rainSrc = ctx.createBufferSource();
        rainSrc.buffer = buf; rainSrc.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass'; filter.frequency.value = 1800; filter.Q.value = 0.4;
        rainGain = ctx.createGain(); rainGain.gain.value = 0.06;
        rainSrc.connect(filter); filter.connect(rainGain); rainGain.connect(master);
        rainSrc.start();
      } else if (!on && rainSrc) {
        try { rainSrc.stop(); } catch { /* already stopped */ }
        rainSrc = null; rainGain = null;
      }
    },
  };
}
