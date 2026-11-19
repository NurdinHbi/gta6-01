// The HUD: health, cash, wanted stars, the clock, speed, the objective panel and
// a live 2D minimap drawn on a canvas. All DOM lives here so the game logic
// never touches document elements directly.

import { CITY } from './config.js';

function el(id) { return document.getElementById(id); }

export class Hud {
  constructor() {
    this.healthFill = el('health-fill');
    this.healthText = el('health-text');
    this.cashText = el('cash');
    this.starsBox = el('stars');
    this.clockText = el('clock');
    this.speedText = el('speed');
    this.objectiveText = el('objective-text');
    this.messageText = el('message');
    this.minimap = el('minimap');
    this.mapCtx = this.minimap.getContext('2d');
    this.hintText = el('hint');
    this.messageTimer = 0;
    this.wantedFlash = 0;
    this.lastMinute = -1;
  }

  setObjective(text) { this.objectiveText.textContent = text; }

  say(text, seconds = 4) {
    this.messageText.textContent = text;
    this.messageTimer = seconds;
  }

  flashWanted() { this.wantedFlash = 1.2; }

  update(dt, game) {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.messageText.textContent = '';
    }
    if (this.wantedFlash > 0) this.wantedFlash -= dt;
    const health = Math.max(0, Math.round(game.player.health));
    this.healthFill.style.width = `${health}%`;
    this.healthFill.style.background = health > 55 ? '#2fd47a' : health > 25 ? '#f5a623' : '#e74c3c';
    this.healthText.textContent = `${health}`;
    this.cashText.textContent = `$${game.cash.toLocaleString('en-US')}`;
    const stars = '★'.repeat(game.wanted.level) + '☆'.repeat(5 - game.wanted.level);
    this.starsBox.textContent = stars;
    this.starsBox.style.color = game.wanted.level > 0 ? '#ffd23c' : '#5a6470';
    this.starsBox.style.textShadow = this.wantedFlash > 0 ? '0 0 12px #ff4040' : 'none';
    const minutes = game.clockMinutes;
    const hh = Math.floor(minutes / 60) % 24;
    const mm = Math.floor(minutes % 60);
    this.clockText.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (game.playerCar) {
      const kmh = Math.abs(Math.round(game.playerCar.speed * 3.6));
      this.speedText.textContent = `${kmh} km/h`;
      this.hintText.textContent = 'W/S drive · A/D steer · Space handbrake · E exit car';
    } else {
      this.speedText.textContent = '';
      this.hintText.textContent = 'WASD move · Shift run · F punch · 2 pistol, click to shoot · E enter car';
    }
    this.drawMinimap(game);
  }

  // Top-down map: streets, the beach, the player arrow, cars, cops, peds and the
  // objective marker. North is up; the whole city fits in the square.
  drawMinimap(game) {
    const ctx = this.mapCtx;
    const S = 200;
    const span = CITY.halfExtent + 60;
    const toMap = (x, z) => [((x + span) / (span * 2)) * S, ((z + span) / (span * 2)) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#20262e';
    ctx.fillRect(0, 0, S, S);
    // Ocean and sand along the bottom edge.
    const [, waterY] = toMap(0, CITY.waterStart);
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, waterY, S, S - waterY);
    const [, sandY] = toMap(0, CITY.beachStart);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, sandY, S, waterY - sandY);
    // Streets.
    ctx.strokeStyle = '#4a5058';
    ctx.lineWidth = 3;
    for (let k = -5; k <= 5; k += 1) {
      const [x] = toMap(k * CITY.pitch, 0);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
      const [, z] = toMap(0, k * CITY.pitch);
      ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(S, z); ctx.stroke();
    }
    // Buildings as pale blocks.
    ctx.fillStyle = '#7d8590';
    for (const b of game.city.buildings) {
      const [x, z] = toMap(b.x - b.w / 2, b.z - b.d / 2);
      const w = (b.w / (span * 2)) * S;
      const d = (b.d / (span * 2)) * S;
      ctx.fillRect(x, z, Math.max(1.5, w), Math.max(1.5, d));
    }
    const dot = (x, z, color, r = 2.5) => {
      const [mx, mz] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(mx, mz, r, 0, Math.PI * 2); ctx.fill();
    };
    // Objective marker, pulsing.
    const obj = game.missions.objectivePoint(game);
    if (obj) {
      const pulse = 3 + Math.sin(performance.now() / 240) * 1.6;
      dot(obj.x, obj.z, '#35d0ff', pulse);
      ctx.strokeStyle = '#35d0ff';
      ctx.lineWidth = 1.5;
      const [mx, mz] = toMap(obj.x, obj.z);
      ctx.beginPath(); ctx.arc(mx, mz, pulse + 3, 0, Math.PI * 2); ctx.stroke();
    }
    for (const car of game.cars) {
      if (car.kind === 'police') dot(car.pos.x, car.pos.z, '#ff4040', 3);
      else if (car === game.playerCar) continue;
      else dot(car.pos.x, car.pos.z, '#c8ccd2', 2);
    }
    for (const ped of game.peds) if (!ped.dead) dot(ped.pos.x, ped.pos.z, '#8fa8bf', 1.6);
    for (const cop of game.wanted.cops) dot(cop.pos.x, cop.pos.z, '#ff4040', 2.5);
    // The player: a white arrow pointing where they face.
    const pp = game.playerPos();
    const [px, pz] = toMap(pp.x, pp.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(game.playerYaw());
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
