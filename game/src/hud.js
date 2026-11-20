// HUD: DOM panels (wanted stars, health, cash, clock, speed, objective,
// message feed) plus a live 2D minimap canvas and the title / help / pause /
// Busted / Wasted screens.
import { CITY, WEAPONS, FONT } from './config.js';

function fmtClock(timeSec) {
  const h = Math.floor(timeSec / 3600) % 24;
  const m = Math.floor((timeSec % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fmtTimer(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function createHud(game) {
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div id="hud-top-left">
      <div id="hud-stars"></div>
      <div id="hud-health"><div id="hud-health-fill"></div><span id="hud-health-text"></span></div>
      <div id="hud-cash"></div>
      <div id="hud-weapon"></div>
    </div>
    <div id="hud-top-right">
      <div id="hud-clock"></div>
      <div id="hud-speed"></div>
    </div>
    <div id="hud-objective"></div>
    <div id="hud-feed"></div>
    <div id="hud-crosshair">+</div>
    <canvas id="hud-minimap" width="220" height="220"></canvas>
    <div id="hud-screen"></div>
  `;
  const starsEl = document.getElementById('hud-stars');
  const healthFill = document.getElementById('hud-health-fill');
  const healthText = document.getElementById('hud-health-text');
  const cashEl = document.getElementById('hud-cash');
  const weaponEl = document.getElementById('hud-weapon');
  const clockEl = document.getElementById('hud-clock');
  const speedEl = document.getElementById('hud-speed');
  const objectiveEl = document.getElementById('hud-objective');
  const feedEl = document.getElementById('hud-feed');
  const crosshair = document.getElementById('hud-crosshair');
  const minimap = document.getElementById('hud-minimap');
  const screenEl = document.getElementById('hud-screen');
  const mm = minimap.getContext('2d');

  let lastFeed = '';

  function drawMinimap() {
    const { state, player, world } = game;
    const S = 220;
    const scale = S / 460; // world -230..230 maps to the canvas
    const toX = (x) => (x + 230) * scale;
    const toY = (z) => (z + 230) * scale;
    mm.clearRect(0, 0, S, S);
    mm.fillStyle = '#20242c';
    mm.fillRect(0, 0, S, S);
    // Sea (west) and beach.
    mm.fillStyle = '#1d4e6b';
    mm.fillRect(0, 0, toX(-190), S);
    mm.fillStyle = '#c2a878';
    mm.fillRect(toX(-190), 0, toX(-176) - toX(-190), S);
    // Streets.
    mm.strokeStyle = '#4a505c';
    mm.lineWidth = 5;
    for (let k = -5; k <= 5; k += 1) {
      const a = k * 38;
      mm.beginPath();
      mm.moveTo(toX(a), 0);
      mm.lineTo(toX(a), S);
      mm.stroke();
      mm.beginPath();
      mm.moveTo(0, toY(a));
      mm.lineTo(S, toY(a));
      mm.stroke();
    }
    // Landmarks.
    mm.fillStyle = '#8a7f72';
    mm.fillRect(toX(8), toY(8), 22 * scale, 22 * scale); // tower
    mm.fillStyle = '#7a2a4a';
    mm.fillRect(toX(-70), toY(123), 26 * scale, 20 * scale); // casino
    mm.fillStyle = '#b8a888';
    mm.fillRect(toX(47), toY(-27), 20 * scale, 16 * scale); // bank
    mm.fillStyle = '#5a6e8c';
    mm.fillRect(toX(-167), toY(-125), 30 * scale, 22 * scale); // stadium
    // Briefcases not yet found.
    mm.fillStyle = '#ffd23f';
    for (const b of world.briefcases) {
      if (!b.found) {
        mm.beginPath();
        mm.arc(toX(b.x), toY(b.z), 2.5, 0, Math.PI * 2);
        mm.fill();
      }
    }
    // Mission beacon.
    if (state.beacon) {
      const pulse = 4 + Math.sin(performance.now() / 200) * 1.5;
      mm.fillStyle = '#ff5d8f';
      mm.beginPath();
      mm.arc(toX(state.beacon.x), toY(state.beacon.z), pulse, 0, Math.PI * 2);
      mm.fill();
      mm.strokeStyle = '#ffffff';
      mm.lineWidth = 1;
      mm.stroke();
    }
    // Smuggler boat while chasing.
    if (game.missions && game.missions.currentObjective() && game.missions.currentObjective().type === 'chase') {
      mm.fillStyle = '#ff2222';
      mm.beginPath();
      mm.arc(toX(world.smugglerBoat.position.x), toY(world.smugglerBoat.position.z), 4, 0, Math.PI * 2);
      mm.fill();
    }
    // Police.
    mm.fillStyle = '#2244ff';
    for (const cop of world.cops) {
      mm.beginPath();
      mm.arc(toX(cop.x), toY(cop.z), 3, 0, Math.PI * 2);
      mm.fill();
    }
    for (const c of world.cruisers) {
      mm.beginPath();
      mm.arc(toX(c.x), toY(c.z), 3.5, 0, Math.PI * 2);
      mm.fill();
    }
    if (world.heliGroup.visible) {
      mm.fillStyle = '#ff8800';
      mm.beginPath();
      mm.arc(toX(world.heliGroup.position.x), toY(world.heliGroup.position.z), 4, 0, Math.PI * 2);
      mm.fill();
    }
    // Player car / player.
    if (state.driving && state.car) {
      mm.fillStyle = '#39ff88';
      mm.fillRect(toX(state.car.x) - 3, toY(state.car.z) - 3, 6, 6);
    }
    const px = toX(player.x);
    const py = toY(player.z);
    mm.save();
    mm.translate(px, py);
    mm.rotate(Math.atan2(Math.sin(player.angle), Math.cos(player.angle)) + Math.PI);
    mm.fillStyle = '#ffffff';
    mm.beginPath();
    mm.moveTo(0, -7);
    mm.lineTo(5, 6);
    mm.lineTo(-5, 6);
    mm.closePath();
    mm.fill();
    mm.restore();
    mm.strokeStyle = 'rgba(255,255,255,0.35)';
    mm.lineWidth = 1;
    mm.strokeRect(0.5, 0.5, S - 1, S - 1);
  }

  function update(missions) {
    const { state, player } = game;
    starsEl.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    starsEl.style.color = state.wanted >= 4 ? '#ff3355' : state.wanted >= 2 ? '#ffaa00' : '#ffffff';
    const hp = Math.max(0, Math.round(state.health));
    healthFill.style.width = `${hp}%`;
    healthFill.style.background = hp > 50 ? '#39d353' : hp > 25 ? '#ffaa00' : '#ff3355';
    healthText.textContent = `HP ${hp}`;
    cashEl.textContent = `$${Math.floor(state.cash).toLocaleString('en-US')}`;
    const wp = WEAPONS[state.weaponIndex];
    weaponEl.textContent = `${wp.name}  ${state.mag[state.weaponIndex]}/${state.reserve[state.weaponIndex]}${state.reloading > 0 ? '  …reloading' : ''}`;
    clockEl.textContent = fmtClock(state.timeSec);
    speedEl.textContent = state.driving
      ? `${Math.round(Math.abs(state.carSpeed) * 3.6)} km/h`
      : state.inBoat ? `${Math.round(Math.abs(state.boatSpeed) * 3.6)} km/h` : '';
    objectiveEl.textContent = missions ? missions.objectiveLabel() : '';
    if (missions) {
      const t = missions.timerLeft();
      objectiveEl.textContent += `   ⏱ ${fmtTimer(t)}`;
      objectiveEl.style.color = t < 30 ? '#ff8080' : '#ffffff';
    }
    crosshair.style.display = !state.driving && !state.inBoat ? 'block' : 'none';
    const feed = state.messages.slice(-3).join('\n');
    if (feed !== lastFeed) {
      feedEl.textContent = feed;
      lastFeed = feed;
    }
    drawMinimap();
  }

  function showScreen(name, data = {}) {
    if (name === 'title') {
      screenEl.innerHTML = `
        <div class="screen-panel">
          <h1>SOLMAR CITY</h1>
          <p class="tagline">An original open-world crime story. Eight jobs. One city. No mercy.</p>
          <p>Mara has work for you. Steal cars, dodge the law, and take the Big Score.</p>
          <p class="controls">WASD move · Shift run · Mouse drag camera · Space punch · F shoot · E enter car<br>
          1/2/3 weapons · R reload · P pause · M mute · Enter start</p>
          ${data.hasSave ? '<button data-act="continue">Continue</button>' : ''}
          <button data-act="start">${data.hasSave ? 'New Game' : 'Start Game'}</button>
          <button data-act="help">How to Play</button>
          <p class="save-line">${data.hasSave ? `Save found: $${Math.floor(data.save.cash).toLocaleString('en-US')} · ${data.save.jobsDone}/8 jobs · ${data.save.briefcasesFound}/10 briefcases` : 'No save yet — progress is stored in this browser.'}</p>
        </div>`;
    } else if (name === 'help') {
      screenEl.innerHTML = `
        <div class="screen-panel">
          <h1>HOW TO PLAY</h1>
          <p>On foot: WASD to move, Shift to run, drag the mouse to look around. Space punches, F (or click) shoots, E gets into a nearby car or boat.</p>
          <p>Driving: W/S accelerate and brake, A/D steer, Space is the handbrake, E gets out, C changes the camera.</p>
          <p>Wanted stars rise when you steal, hit pedestrians, shoot in public or drop a cop. Break line of sight and stay quiet to cool off. At 4 stars the helicopter and roadblocks arrive.</p>
          <p>Follow Mara's jobs in order — each has a beacon, a minimap marker and a timer. Gold briefcases pay $250 each and stunt ramps pay $600 for a clean landing.</p>
          <p>Busted or Wasted costs you 10% of your cash.</p>
          <button data-act="back">Back</button>
        </div>`;
    } else if (name === 'pause') {
      screenEl.innerHTML = `
        <div class="screen-panel">
          <h1>PAUSED</h1>
          <p>Solmar City waits for no one — except right now.</p>
          <button data-act="resume">Resume</button>
          <button data-act="quit">Quit to Title</button>
        </div>`;
    } else if (name === 'busted') {
      screenEl.innerHTML = `
        <div class="screen-panel">
          <h1>BUSTED</h1>
          <p>The Solmar PD has you. You wake at the precinct, $${Math.floor(data.loss || 0)} lighter.</p>
          <button data-act="respawn">Wake Up</button>
        </div>`;
    } else if (name === 'wasted') {
      screenEl.innerHTML = `
        <div class="screen-panel">
          <h1>WASTED</h1>
          <p>Solmar City chewed you up. You wake at the hospital, $${Math.floor(data.loss || 0)} lighter.</p>
          <button data-act="respawn">Wake Up</button>
        </div>`;
    } else {
      screenEl.innerHTML = '';
    }
    screenEl.style.display = name === 'none' ? 'none' : 'flex';
  }

  return { update, showScreen, root };
}
