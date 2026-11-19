// HUD for Solmar City: stars, health, cash, clock, speed, objective panel,
// live 2D minimap, and center toasts. Pure DOM + canvas 2D, no dependencies
// beyond the game state object G.
const Hud = {
  els: {},
  toastTimer: null,
  minimapT: 0,

  init() {
    const ids = ['hud', 'stars', 'health-fill', 'health-num', 'cash', 'clock',
      'speed-row', 'speed-num', 'weapon-name', 'objective-title', 'objective-text',
      'objective-timer', 'minimap-canvas', 'message', 'crosshair'];
    for (const id of ids) this.els[id] = document.getElementById(id);
  },

  show() { this.els.hud.classList.remove('hidden'); },
  hide() { this.els.hud.classList.add('hidden'); },

  toast(msg, ms) {
    const el = this.els.message;
    el.textContent = msg;
    el.classList.remove('hidden');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.add('hidden'), ms || 4200);
  },

  update(G, dt) {
    const e = this.els;
    const stars = Math.max(0, Math.min(5, Math.round(G.wanted)));
    e.stars.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    e.stars.classList.toggle('hot', stars >= 3);
    const hp = Math.max(0, Math.round(G.player.health));
    e['health-fill'].style.width = hp + '%';
    e['health-fill'].classList.toggle('low', hp <= 30);
    e['health-num'].textContent = hp;
    e.cash.textContent = fmtMoney(G.cash);
    e.clock.textContent = fmtClock(G.gameMinutes);
    const inCar = G.player.inCar;
    e['speed-row'].classList.toggle('hidden', !inCar);
    if (inCar) e['speed-num'].textContent = Math.round(Math.abs(G.player.car ? G.player.car.speed * 3.6 : 0));
    e['weapon-name'].textContent = G.player.weapon === 'pistol' ? 'Pistol' : 'Fists';
    e.crosshair.classList.toggle('hidden', !(inCar === false && G.player.weapon === 'pistol'));
    const obj = getMissionObjective(G);
    e['objective-title'].textContent = obj.title;
    e['objective-text'].textContent = obj.text;
    if (obj.timer !== null && obj.timer !== undefined) {
      e['objective-timer'].textContent = '⏱ ' + Math.floor(obj.timer / 60) + ':' + String(obj.timer % 60).padStart(2, '0');
      e['objective-timer'].classList.toggle('urgent', obj.timer <= 30);
    } else {
      e['objective-timer'].textContent = '';
    }
    this.minimapT -= dt;
    if (this.minimapT <= 0) { this.minimapT = 0.12; this.drawMinimap(G); }
  },

  drawMinimap(G) {
    const cv = this.els['minimap-canvas'];
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const S = W / 400; // world [-200,200] -> canvas
    const X = (x) => (x + 200) * S;
    const Z = (z) => (z + 200) * S;
    g.fillStyle = '#10151a'; g.fillRect(0, 0, W, H);
    // Water + beach (south).
    g.fillStyle = '#166b8a'; g.fillRect(0, Z(192), W, H - Z(192));
    g.fillStyle = '#d3b67e'; g.fillRect(0, Z(150), W, Z(192) - Z(150));
    // City blocks.
    g.fillStyle = '#3a3f3a';
    for (let i = 0; i < CITY.GRID; i++) {
      for (let j = 0; j < CITY.GRID; j++) {
        g.fillRect(X(CITY.MIN + i * CITY.PITCH), Z(CITY.MIN + j * CITY.PITCH), CITY.BLOCK * S, CITY.BLOCK * S);
      }
    }
    // Roads.
    g.strokeStyle = '#565b60'; g.lineWidth = Math.max(2, 10 * S);
    for (const c of CITY.ROAD_CENTERS) {
      g.beginPath(); g.moveTo(X(c), Z(-160)); g.lineTo(X(c), Z(150)); g.stroke();
      g.beginPath(); g.moveTo(X(-160), Z(c)); g.lineTo(X(160), Z(c)); g.stroke();
    }
    // Mission beacon.
    const t = missionTarget(G);
    if (t) {
      g.fillStyle = '#ffd23e';
      g.save();
      g.translate(X(t.x), Z(t.z)); g.rotate(Math.PI / 4);
      const r = 5 + Math.sin(performance.now() / 200) * 1.5;
      g.fillRect(-r, -r, r * 2, r * 2);
      g.restore();
    }
    // Parked / traffic cars (yellow), police (red/blue).
    for (const c of G.parkedCars) { g.fillStyle = '#e8c33a'; g.fillRect(X(c.x) - 2, Z(c.z) - 2, 4, 4); }
    for (const c of G.trafficCars) { g.fillStyle = '#9aa7b1'; g.fillRect(X(c.x) - 2, Z(c.z) - 2, 4, 4); }
    for (const c of G.policeCars) { g.fillStyle = '#ff4040'; g.beginPath(); g.arc(X(c.x), Z(c.z), 3.5, 0, 7); g.fill(); }
    for (const c of G.footCops) { g.fillStyle = '#5aa9ff'; g.beginPath(); g.arc(X(c.x), Z(c.z), 3, 0, 7); g.fill(); }
    // Player arrow.
    const px = X(G.player.x), pz = Z(G.player.z);
    g.save();
    g.translate(px, pz);
    // Canvas y runs down like world +z; an up-pointing triangle rotated by
    // (PI - heading) points along the player's forward vector.
    g.rotate(Math.PI - G.player.heading);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.restore();
  },
};
