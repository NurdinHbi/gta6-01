// Solmar City — the HUD: stars, health, cash, clock, speed, objective panel,
// weapon readout, toasts, and the live 2D minimap. Authored fresh for round 4.
import { formatClock, formatCash, clamp } from './util.js';

const WORLD_MIN = -290;
const WORLD_SPAN = 580;

let els = null;
let notifyTimer = null;

export function initHud() {
  els = {
    stars: document.getElementById('stars'),
    healthFill: document.getElementById('health-fill'),
    healthText: document.getElementById('health-text'),
    cash: document.getElementById('cash'),
    clock: document.getElementById('clock'),
    speed: document.getElementById('speed'),
    objective: document.getElementById('objective'),
    missionName: document.getElementById('mission-name'),
    weapon: document.getElementById('weapon'),
    notify: document.getElementById('notify'),
    minimap: document.getElementById('minimap'),
    collectibles: document.getElementById('collectibles'),
    titleScreen: document.getElementById('title-screen'),
    bustedScreen: document.getElementById('busted-screen'),
    wastedScreen: document.getElementById('wasted-screen'),
    pauseScreen: document.getElementById('pause-screen'),
    missionList: document.getElementById('mission-list'),
    titleContinue: document.getElementById('btn-continue'),
  };
  return els;
}

export function showScreen(name) {
  if (!els) return;
  els.titleScreen.classList.toggle('hidden', name !== 'title');
  els.bustedScreen.classList.toggle('hidden', name !== 'busted');
  els.wastedScreen.classList.toggle('hidden', name !== 'wasted');
  els.pauseScreen.classList.toggle('hidden', name !== 'pause');
  if (name === 'play') {
    els.titleScreen.classList.add('hidden');
    els.bustedScreen.classList.add('hidden');
    els.wastedScreen.classList.add('hidden');
    els.pauseScreen.classList.add('hidden');
  }
}

export function toast(text, ms) {
  if (!els) return;
  els.notify.textContent = text;
  els.notify.classList.remove('hidden');
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => els.notify.classList.add('hidden'), ms || 4200);
}

export function renderMissionList(G) {
  if (!els) return;
  const names = G.missions.defs.map((d, i) => {
    const done = i < G.missionsDone;
    const current = G.missions.active && G.missions.active.def.id === d.id;
    const mark = done ? '✓ ' : current ? '▶ ' : (i + 1) + '. ';
    return '<div class="' + (done ? 'done' : current ? 'current' : '') + '">' + mark + d.title + '</div>';
  }).join('');
  els.missionList.innerHTML = names;
}

export function updateHud(G) {
  if (!els) return;
  const wanted = G.wanted;
  let stars = '';
  for (let i = 0; i < 5; i += 1) stars += i < wanted ? '★' : '☆';
  els.stars.textContent = stars;
  els.stars.classList.toggle('hot', wanted >= 3);
  els.healthFill.style.width = clamp(G.health, 0, 100) + '%';
  els.healthFill.classList.toggle('low', G.health < 30);
  els.healthText.textContent = Math.ceil(G.health) + ' HP';
  els.cash.textContent = formatCash(G.cash);
  els.clock.textContent = formatClock(G.hours) + (G.city.isNight ? ' ☾' : G.city.isGolden ? ' ◐' : ' ☀');
  const speedKmh = G.currentCar
    ? Math.round(Math.abs(G.currentCar.speed) * 3.6)
    : G.playerBoat ? Math.round(Math.abs(G.playerBoat.speed) * 3.6)
    : Math.round(G.playerSpeed * 3.6);
  els.speed.textContent = speedKmh + ' km/h';
  els.objective.textContent = G.missions.currentLabel();
  els.missionName.textContent = G.missions.missionTitle() +
    (G.missions.active ? '  ·  ' + Math.ceil(G.missions.active.timeLeft) + 's' : '');
  const w = G.weapons[G.weaponIndex];
  els.weapon.textContent = w.name + '  ·  ' + (w.ammo === Infinity ? '∞' : w.ammo);
  els.collectibles.textContent = 'Packages ' + G.collectiblesGot + '/12';
  drawMinimap(G);
}

function toMap(v, size) {
  return ((v - WORLD_MIN) / WORLD_SPAN) * size;
}

function drawMinimap(G) {
  const cv = els.minimap;
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const S = cv.width;
  ctx.clearRect(0, 0, S, S);
  // sea + sand on the west edge
  ctx.fillStyle = '#1e6f9e';
  ctx.fillRect(0, 0, toMap(-352, S), S);
  ctx.fillStyle = '#dcc28a';
  ctx.fillRect(toMap(-352, S), 0, toMap(-280, S) - toMap(-352, S), S);
  // city slab
  ctx.fillStyle = '#7d7d74';
  ctx.fillRect(toMap(-280, S), toMap(-280, S), toMap(280, S) - toMap(-280, S), toMap(280, S) - toMap(-280, S));
  // streets
  ctx.strokeStyle = '#3a3d42';
  ctx.lineWidth = 2;
  for (const s of G.city.streetX) {
    ctx.beginPath(); ctx.moveTo(toMap(s, S), 0); ctx.lineTo(toMap(s, S), S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, toMap(s, S)); ctx.lineTo(S, toMap(s, S)); ctx.stroke();
  }
  // landmarks
  const L = G.city.landmarks;
  ctx.fillStyle = '#e8c13a';
  for (const k of ['tower', 'stadium', 'bank', 'plaza', 'safehouse']) {
    ctx.fillRect(toMap(L[k].x, S) - 2, toMap(L[k].z, S) - 2, 4, 4);
  }
  // collectibles
  ctx.fillStyle = '#4ae84a';
  for (const c of G.collectibles) {
    if (c.got) continue;
    ctx.beginPath();
    ctx.arc(toMap(c.x, S), toMap(c.z, S), 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // mission beacon (pulsing)
  const beacon = G.missions.beaconTarget();
  if (beacon) {
    const pulse = 4 + Math.sin(performance.now() / 180) * 2;
    ctx.fillStyle = '#ffd21a';
    ctx.beginPath();
    ctx.arc(toMap(beacon.x, S), toMap(beacon.z, S), pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a5a00';
    ctx.stroke();
  }
  // tail target
  if (G.tailTarget) {
    ctx.fillStyle = '#ff7b2e';
    ctx.beginPath();
    ctx.arc(toMap(G.tailTarget.x, S), toMap(G.tailTarget.z, S), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // cops on foot
  ctx.fillStyle = '#2e6fd8';
  for (const cop of G.cops) {
    if (!cop.alive) continue;
    ctx.beginPath();
    ctx.arc(toMap(cop.x, S), toMap(cop.z, S), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // police cars
  ctx.fillStyle = '#ff2222';
  for (const pc of G.policeCars) {
    ctx.beginPath();
    ctx.arc(toMap(pc.x, S), toMap(pc.z, S), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // player arrow
  const p = G.playerPosition();
  const px = toMap(p.x, S);
  const pz = toMap(p.z, S);
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(G.playerAngle);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}
