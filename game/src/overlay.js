// The HUD: health bar, cash, clock, wanted stars, objective panel, speedometer, toast
// line, and a live 2D minimap drawn on a small canvas. The static city layer of the
// minimap (water, sand, roads, buildings) is painted once to an offscreen canvas and
// blitted every frame; only the moving dots are redrawn. Screens (title, pause, busted,
// wasted, help) are plain DOM overlays wired to buttons.

import { HALF, WATER_Z, BEACH_Z } from './city.js';

const MAP_SIZE = 190;
const MAP_SCALE = 0.26;
const MAP_CZ = 60;

function toMapX(x) {
  return MAP_SIZE / 2 + x * MAP_SCALE;
}
function toMapZ(z) {
  return MAP_SIZE / 2 + (z - MAP_CZ) * MAP_SCALE;
}

export function createOverlay(buildingRects) {
  const $ = (id) => document.getElementById(id);
  const hud = $('hud');
  const healthFill = $('healthfill');
  const cashLine = $('cashline');
  const clockLine = $('clockline');
  const starsEl = $('stars');
  const objTitle = $('objtitle');
  const objText = $('objtext');
  const objTimer = $('objtimer');
  const speedNum = $('speednum');
  const speedLabel = $('speedlabel');
  const toastEl = $('toast');
  const crosshair = $('crosshair');
  const hint = $('hint');
  const mapCanvas = $('minimap');
  const mapCtx = mapCanvas.getContext('2d');

  // Static minimap layer: sea, sand, ground, roads, buildings.
  const staticLayer = document.createElement('canvas');
  staticLayer.width = MAP_SIZE;
  staticLayer.height = MAP_SIZE;
  const sg = staticLayer.getContext('2d');
  sg.fillStyle = '#0e2438';
  sg.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
  sg.fillStyle = '#1e6f8e';
  sg.fillRect(0, toMapZ(WATER_Z), MAP_SIZE, MAP_SIZE - toMapZ(WATER_Z));
  sg.fillStyle = '#e8d29a';
  sg.fillRect(0, toMapZ(BEACH_Z), MAP_SIZE, toMapZ(WATER_Z) - toMapZ(BEACH_Z));
  sg.fillStyle = '#5d6673';
  sg.fillRect(0, 0, MAP_SIZE, toMapZ(BEACH_Z));
  sg.strokeStyle = '#2b2f38';
  sg.lineWidth = 3;
  for (let k = -5; k <= 5; k += 1) {
    const at = k * 56;
    sg.beginPath();
    sg.moveTo(toMapX(at), 0);
    sg.lineTo(toMapX(at), MAP_SIZE);
    sg.stroke();
    sg.beginPath();
    sg.moveTo(0, toMapZ(at));
    sg.lineTo(MAP_SIZE, toMapZ(at));
    sg.stroke();
  }
  sg.fillStyle = '#3a3f4a';
  for (const b of buildingRects) {
    sg.fillRect(toMapX(b.x), toMapZ(b.z), Math.max(1.5, b.w * MAP_SCALE), Math.max(1.5, b.d * MAP_SCALE));
  }
  sg.fillStyle = '#ffd23f';
  sg.beginPath();
  sg.arc(toMapX(10), toMapZ(34), 3, 0, Math.PI * 2);
  sg.fill();

  let toastUntil = 0;
  let toastTimer = null;

  const api = {
    showHud() {
      hud.classList.remove('hidden');
    },
    hideHud() {
      hud.classList.add('hidden');
    },
    /** Flash a message across the lower middle of the screen. */
    toast(message, seconds = 3) {
      toastEl.textContent = message;
      toastUntil = performance.now() + seconds * 1000;
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.textContent = ''; }, seconds * 1000);
    },
    /** Update every HUD readout from one snapshot object. */
    update(view) {
      healthFill.style.width = `${Math.max(0, Math.min(100, view.health))}%`;
      healthFill.style.background = view.health > 50
        ? 'linear-gradient(90deg,#37d67a,#7be495)'
        : view.health > 25 ? 'linear-gradient(90deg,#e0a53c,#ffd23f)' : 'linear-gradient(90deg,#d94545,#ff7a5c)';
      cashLine.textContent = `$${view.cash.toLocaleString('en-US')}`;
      const hh = String(Math.floor(view.clockMinutes / 60) % 24).padStart(2, '0');
      const mm = String(Math.floor(view.clockMinutes % 60)).padStart(2, '0');
      clockLine.textContent = `${hh}:${mm} · Solmar City`;
      let stars = '';
      for (let i = 0; i < 5; i += 1) {
        stars += `<span class="${i < view.wanted ? '' : 'off'}">★</span>`;
      }
      starsEl.innerHTML = stars;
      objTitle.textContent = view.objectiveTitle;
      objText.textContent = view.objectiveText;
      objTimer.textContent = view.timer != null ? `⏱ ${Math.ceil(view.timer)}s` : '';
      speedNum.textContent = String(Math.round(view.speedKmh));
      speedLabel.textContent = view.inCar ? 'km/h · driving' : 'km/h · on foot';
      crosshair.style.display = view.inCar ? 'none' : 'block';
      hint.textContent = view.inCar
        ? 'W/S drive · A/D steer · Space handbrake · E get out · Click shoot · P pause'
        : 'WASD move · Shift run · drag mouse to look · E enter / steal car · F punch · Click shoot · P pause · H help';
    },
    /** Draw the minimap: static layer plus player arrow, cars, cops, peds and marker. */
    drawMinimap(dyn) {
      const g = mapCtx;
      g.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
      g.save();
      g.beginPath();
      g.arc(MAP_SIZE / 2, MAP_SIZE / 2, MAP_SIZE / 2, 0, Math.PI * 2);
      g.clip();
      g.drawImage(staticLayer, 0, 0);
      // Mission marker: pulsing gold diamond.
      if (dyn.target) {
        const pulse = 4 + Math.sin(performance.now() / 240) * 1.6;
        g.fillStyle = '#ffd23f';
        g.strokeStyle = '#7a5c00';
        g.lineWidth = 1.5;
        const mx = toMapX(dyn.target.x);
        const mz = toMapZ(dyn.target.z);
        g.beginPath();
        g.moveTo(mx, mz - pulse);
        g.lineTo(mx + pulse, mz);
        g.lineTo(mx, mz + pulse);
        g.lineTo(mx - pulse, mz);
        g.closePath();
        g.fill();
        g.stroke();
      }
      // Pedestrians: tiny grey dots.
      g.fillStyle = 'rgba(220,225,235,0.85)';
      for (const p of dyn.peds) {
        g.fillRect(toMapX(p.x) - 1, toMapZ(p.z) - 1, 2, 2);
      }
      // Traffic: white dots; patrol cars: flashing blue.
      for (const c of dyn.cars) {
        g.fillStyle = c.police ? (Math.sin(performance.now() / 130) > 0 ? '#3f8cff' : '#ff4444') : '#ffffff';
        g.beginPath();
        g.arc(toMapX(c.x), toMapZ(c.z), c.police ? 3.4 : 2.4, 0, Math.PI * 2);
        g.fill();
      }
      // Foot cops: blue squares.
      g.fillStyle = '#3f8cff';
      for (const c of dyn.cops) {
        g.fillRect(toMapX(c.x) - 2, toMapZ(c.z) - 2, 4, 4);
      }
      // Player: white arrow pointing along the heading.
      const px = toMapX(dyn.player.x);
      const pz = toMapZ(dyn.player.z);
      g.save();
      g.translate(px, pz);
      g.rotate(dyn.player.heading);
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#101828';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(5, 6);
      g.lineTo(0, 3);
      g.lineTo(-5, 6);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
      g.restore();
      // Ring border.
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(MAP_SIZE / 2, MAP_SIZE / 2, MAP_SIZE / 2 - 1, 0, Math.PI * 2);
      g.stroke();
    },
    /** Show one full-screen overlay (title, pause, busted, wasted, help) or none. */
    showScreen(name) {
      for (const id of ['title-screen', 'pause-screen', 'busted-screen', 'wasted-screen', 'help-screen']) {
        $(id).classList.toggle('hidden', id !== `${name}-screen`);
      }
      if (!name) {
        for (const id of ['title-screen', 'pause-screen', 'busted-screen', 'wasted-screen', 'help-screen']) {
          $(id).classList.add('hidden');
        }
      }
    },
    setContinueLabel(cash) {
      const btn = $('btn-continue');
      btn.classList.remove('hidden');
      btn.textContent = `Continue — $${cash.toLocaleString('en-US')}`;
    },
    hideContinue() {
      $('btn-continue').classList.add('hidden');
    },
    setPauseStats(text) {
      $('pause-stats').textContent = text;
    },
    setBustedText(text) {
      $('busted-text').textContent = text;
    },
    setWastedText(text) {
      $('wasted-text').textContent = text;
    },
    announce(message) {
      const status = document.getElementById('status');
      if (status) status.textContent = message;
    },
    on(id, event, fn) {
      $(id).addEventListener(event, fn);
    },
  };
  return api;
}
