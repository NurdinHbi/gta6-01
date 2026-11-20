// Solmar City — all sound is synthesized with WebAudio. No audio files.
// Authored fresh for round 4 from the design spec.
let ctx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let sirenTimer = null;
let sirenHigh = false;
let muted = false;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  return ctx;
}

// Call from the first user gesture so the browser unlocks audio.
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.35;
}

function blip(freq, dur, type, vol, slideTo) {
  const c = ensure();
  if (!c || muted) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, lowpass) {
  const c = ensure();
  if (!c || muted) return;
  const t = c.currentTime;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t);
}

export function playShot(kind) {
  if (kind === 'shotgun') { noiseBurst(0.28, 0.9, 900); blip(120, 0.15, 'square', 0.25, 40); }
  else if (kind === 'smg') { noiseBurst(0.09, 0.5, 2400); }
  else { noiseBurst(0.14, 0.65, 1600); }
}

export function playPunch() { noiseBurst(0.1, 0.5, 500); blip(90, 0.12, 'sine', 0.4, 45); }
export function playPickup() { blip(660, 0.09, 'sine', 0.3); setTimeout(() => blip(990, 0.14, 'sine', 0.3), 80); }
export function playCash() { blip(880, 0.08, 'triangle', 0.3); setTimeout(() => blip(1174, 0.08, 'triangle', 0.3), 70); setTimeout(() => blip(1568, 0.16, 'triangle', 0.3), 140); }
export function playFail() { blip(220, 0.25, 'sawtooth', 0.25, 110); }
export function playMissionComplete() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.35), i * 110));
}
export function playMissionStart() { blip(392, 0.12, 'triangle', 0.3); setTimeout(() => blip(523, 0.2, 'triangle', 0.3), 110); }
export function playHorn() { blip(370, 0.18, 'square', 0.18); }
export function playCrash() { noiseBurst(0.3, 0.7, 700); }
export function playSplash() { noiseBurst(0.5, 0.4, 1200); }

export function setEngine(on, speed01) {
  const c = ensure();
  if (!c) return;
  if (on && !engineOsc) {
    engineOsc = c.createOscillator();
    engineGain = c.createGain();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain.gain.value = 0.0;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 420;
    engineOsc.connect(filt); filt.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  }
  if (!on && engineOsc) {
    try { engineOsc.stop(); } catch (e) { /* already stopped */ }
    engineOsc = null; engineGain = null;
    return;
  }
  if (engineOsc) {
    engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, c.currentTime, 0.08);
    engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.06, c.currentTime, 0.1);
  }
}

export function setSiren(on) {
  const c = ensure();
  if (!c) return;
  if (on && !sirenOsc) {
    sirenOsc = c.createOscillator();
    sirenGain = c.createGain();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 700;
    sirenGain.gain.value = 0.045;
    sirenOsc.connect(sirenGain); sirenGain.connect(master);
    sirenOsc.start();
    sirenTimer = setInterval(() => {
      sirenHigh = !sirenHigh;
      if (sirenOsc) sirenOsc.frequency.setTargetAtTime(sirenHigh ? 950 : 700, c.currentTime, 0.05);
    }, 420);
  }
  if (!on && sirenOsc) {
    clearInterval(sirenTimer);
    sirenTimer = null;
    try { sirenOsc.stop(); } catch (e) { /* already stopped */ }
    sirenOsc = null; sirenGain = null;
  }
}
