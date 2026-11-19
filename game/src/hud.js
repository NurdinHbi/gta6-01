// HUD: the DOM overlay (stars, health, cash, clock, speed, objective,
// messages, screens) and the 2D canvas minimap. The HUD reads the game
// state every frame and never owns any simulation.
import { CITY_HALF, OCEAN_X } from './config.js';
import { missionObjective } from './missions.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  return {
    root: $('hud'),
    minimap: $('minimap'),
    stars: $('stars'),
    healthFill: $('health-fill'),
    healthText: $('health-text'),
    cash: $('cash'),
    clock: $('clock'),
    speed: $('speed-num'),
    speedUnit: $('speed-unit'),
    objective: $('objective'),
    objectiveText: $('objective-text'),
    objectiveDist: $('objective-dist'),
    timer: $('mission-timer'),
    message: $('message'),
    hint: $('hint'),
    screenTitle: $('screen-title'),
    screenBlurb: $('screen-blurb'),
    screenStart: $('screen-start'),
    screenContinue: $('screen-continue'),
    screenPause: $('screen-pause'),
    screenEnd: $('screen-end'),
    endTitle: $('end-title'),
    endText: $('end-text'),
    endButton: $('end-button'),
    crosshair: $('crosshair'),
    vignette: $('vignette'),
    fps: $('fps'),
  };
}

function starString(stars) {
  let s = '';
  for (let i = 0; i < 5; i += 1) s += i < stars ? '★' : '☆';
  return s;
}

export function updateHud(hud, game) {
  const player = game.player;
  hud.stars.textContent = starString(game.wanted.stars);
  hud.stars.classList.toggle('hot', game.wanted.stars >= 3);
  const hp = Math.max(0, Math.round(player.health));
  hud.healthFill.style.width = `${hp}%`;
  hud.healthFill.classList.toggle('low', hp <= 30);
  hud.healthText.textContent = `${hp}`;
  hud.cash.textContent = `$${player.cash.toLocaleString('en-US')}`;
  const mins = Math.floor(game.clockMinutes);
  const hh = String(Math.floor(mins / 60) % 24).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  hud.clock.textContent = `${hh}:${mm}`;
  if (player.inCar) {
    hud.speed.textContent = `${Math.round(Math.abs(player.car.speed) * 3.6)}`;
    hud.speedUnit.textContent = 'km/h';
  } else {
    hud.speed.textContent = '';
    hud.speedUnit.textContent = '';
  }
  hud.objectiveText.textContent = missionObjective(game.missions);
  const target = game.missions.target;
  if (target) {
    const px = player.inCar ? player.car.x : player.x;
    const pz = player.inCar ? player.car.z : player.z;
    const d = Math.hypot(target.x - px, target.z - pz);
    hud.objectiveDist.textContent = `${Math.round(d)}m → ${target.label}`;
  } else {
    hud.objectiveDist.textContent = '';
  }
  if (game.missions.index === 1 && !game.missions.completed && game.missions.timer > 0) {
    hud.timer.textContent = `⏱ ${Math.ceil(game.missions.timer)}s`;
    hud.timer.style.display = '';
  } else {
    hud.timer.style.display = 'none';
  }
  if (game.missions.messageTimer > 0) {
    hud.message.textContent = game.missions.message;
    hud.message.style.display = '';
  } else {
    hud.message.style.display = 'none';
  }
  hud.hint.textContent = player.inCar
    ? 'W/S drive · A/D steer · Space handbrake · E exit car · Esc pause · M mute'
    : 'WASD move · Shift run · drag mouse to look · E enter car · F punch · click shoot · Esc pause · M mute';
  hud.crosshair.style.display = player.inCar ? 'none' : '';
  hud.vignette.style.opacity = player.hurtFlash > 0 ? String(player.hurtFlash * 0.55) : '0';
  if (game.fps) hud.fps.textContent = `${Math.round(game.fps)} fps`;
}

// Minimap: top-down 2D canvas — roads, beach, ocean, player arrow, cars,
// police blips, peds and the mission marker.
export function drawMinimap(hud, game) {
  const canvas = hud.minimap;
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const span = OCEAN_X + 30;
  const toMap = (x, z) => [((x + span) / (span * 2)) * size, ((z + span) / (span * 2)) * size];
  ctx.fillStyle = '#10141c';
  ctx.fillRect(0, 0, size, size);
  // Ocean + beach.
  const [bx] = toMap(CITY_HALF, 0);
  const [ox] = toMap(OCEAN_X, 0);
  ctx.fillStyle = '#1e6f8e';
  ctx.fillRect(ox, 0, size - ox, size);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(bx, 0, ox - bx, size);
  // Blocks.
  ctx.fillStyle = '#3a3f4a';
  const [b0x, b0z] = toMap(-CITY_HALF, -CITY_HALF);
  const [b1x, b1z] = toMap(CITY_HALF, CITY_HALF);
  ctx.fillRect(b0x, b0z, b1x - b0x, b1z - b0z);
  // Roads.
  ctx.strokeStyle = '#565b66';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 10; i += 1) {
    const c = -CITY_HALF + 6 + i * 52;
    const [x0] = toMap(c, 0);
    const [, z0] = toMap(0, c);
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, z0);
    ctx.lineTo(size, z0);
    ctx.stroke();
  }
  const dot = (x, z, color, r) => {
    const [mx, mz] = toMap(x, z);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx, mz, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Mission marker (pulsing yellow diamond).
  const target = game.missions.target;
  if (target) {
    const [mx, mz] = toMap(target.x, target.z);
    const pulse = 5 + Math.sin(game.time * 5) * 2;
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.moveTo(mx, mz - pulse);
    ctx.lineTo(mx + pulse, mz);
    ctx.lineTo(mx, mz + pulse);
    ctx.lineTo(mx - pulse, mz);
    ctx.closePath();
    ctx.fill();
  }
  // Cars: white traffic, blue police.
  for (const car of game.cars) {
    if (car.dead) continue;
    dot(car.x, car.z, car.kind === 'police' ? '#3a86ff' : '#dfe3ea', car.kind === 'player' ? 3.5 : 2.5);
  }
  // Peds.
  for (const ped of game.peds) dot(ped.x, ped.z, '#8a93a3', 1.4);
  // Foot cops.
  for (const cop of game.wanted.cops) dot(cop.x, cop.z, '#3a86ff', 2.5);
  // Player arrow.
  const px = game.player.inCar ? game.player.car.x : game.player.x;
  const pz = game.player.inCar ? game.player.car.z : game.player.z;
  const heading = game.player.inCar ? game.player.car.angle : game.player.angle;
  const [mx, mz] = toMap(px, pz);
  ctx.save();
  ctx.translate(mx, mz);
  ctx.rotate(heading + Math.PI / 2);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(0, 2.5);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Screen overlays: title / pause / busted / wasted.
export function showScreen(hud, kind, game) {
  const title = hud.screenTitle;
  const pause = hud.screenPause;
  const end = hud.screenEnd;
  title.style.display = 'none';
  pause.style.display = 'none';
  end.style.display = 'none';
  if (kind === 'title') {
    title.style.display = '';
    hud.screenBlurb.innerHTML = 'Sun, salt air and bad decisions. You are <b>Ray Vega</b>, a nobody with a fast mouth and faster hands, fresh off the bus in <b>Solmar City</b> — a sun-soaked coast where the fixer <b>Mara</b> has four jobs with your name on them. Steal cars, outrun the Solmar PD, and pull the job that makes you a legend.';
    hud.screenContinue.style.display = game.hasSave ? '' : 'none';
    hud.screenStart.textContent = game.hasSave ? 'New Game' : 'Start Game';
  } else if (kind === 'pause') {
    pause.style.display = '';
  } else if (kind === 'busted' || kind === 'wasted') {
    end.style.display = '';
    hud.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    hud.endTitle.className = kind === 'busted' ? 'end-title busted' : 'end-title wasted';
    hud.endText.textContent = kind === 'busted'
      ? 'The Solmar PD hauled you in. You lost some cash — Mara is not happy.'
      : 'You got wasted. The paramedics patched you up — the hospital bill stings.';
  }
}

export function hideScreens(hud) {
  hud.screenTitle.style.display = 'none';
  hud.screenPause.style.display = 'none';
  hud.screenEnd.style.display = 'none';
}
