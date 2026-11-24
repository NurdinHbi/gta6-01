// HUD: DOM panels (wanted stars, health, cash, clock, weather, radio,
// objective, message feed, taxi meter) plus a live 2D minimap canvas and
// the title / help / pause / Busted / Wasted / garage screens.
import { CITY, WEAPONS, FONT, GARAGE } from './config.js';
import { RADIO_STATIONS } from './audio.js';

function fmtClock(timeSec) {
  const h = Math.floor(timeSec / 3600) % 24;
  const m = Math.floor((timeSec % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function fmtMoney(n) { return `$${Math.floor(n).toLocaleString('en-US')}`; }

export function createHud(game) {
  const { state, player, world } = game;
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div id="hud-top">
      <div class="hud-box" id="hud-cash">$250</div>
      <div class="hud-box" id="hud-health"><span class="bar"><span id="health-fill"></span></span><span id="health-num">100</span></div>
      <div class="hud-box" id="hud-wanted" aria-label="wanted level"></div>
      <div class="hud-box" id="hud-clock">17:36</div>
      <div class="hud-box" id="hud-weather">Dry</div>
      <div class="hud-box" id="hud-radio">Radio off</div>
    </div>
    <div id="hud-objective"></div>
    <div id="hud-taxi" class="hidden"></div>
    <div id="hud-messages"></div>
    <div id="hud-speed" class="hidden"></div>
    <canvas id="minimap" width="190" height="190"></canvas>
    <div id="hud-screen"></div>
  `;
  const el = {
    cash: document.getElementById('hud-cash'),
    healthFill: document.getElementById('health-fill'),
    healthNum: document.getElementById('health-num'),
    wanted: document.getElementById('hud-wanted'),
    clock: document.getElementById('hud-clock'),
    weather: document.getElementById('hud-weather'),
    radio: document.getElementById('hud-radio'),
    objective: document.getElementById('hud-objective'),
    taxi: document.getElementById('hud-taxi'),
    messages: document.getElementById('hud-messages'),
    speed: document.getElementById('hud-speed'),
    minimap: document.getElementById('minimap'),
    screen: document.getElementById('hud-screen'),
  };
  const mapCtx = el.minimap.getContext('2d');
  let lastScreen = null;
  let lastMsgCount = 0;

  function drawMinimap(missions) {
    const S = 190;
    const scale = S / (CITY.half * 2 + 40);
    const toX = (x) => (x + CITY.half + 20) * scale;
    const toY = (z) => (z + CITY.half + 20) * scale;
    mapCtx.fillStyle = '#10141c';
    mapCtx.fillRect(0, 0, S, S);
    // Sea.
    mapCtx.fillStyle = '#1d4e6b';
    mapCtx.fillRect(0, 0, toX(CITY.seaX) - toX(-CITY.half - 20), S);
    // Roads.
    mapCtx.strokeStyle = '#3a3f47';
    mapCtx.lineWidth = 2;
    for (let i = 0; i <= CITY.blocks; i += 1) {
      const c = -CITY.half + i * 38 - 6 + 6;
      mapCtx.beginPath(); mapCtx.moveTo(toX(c), 0); mapCtx.lineTo(toX(c), S); mapCtx.stroke();
      mapCtx.beginPath(); mapCtx.moveTo(0, toY(c)); mapCtx.lineTo(S, toY(c)); mapCtx.stroke();
    }
    // Landmarks.
    mapCtx.fillStyle = '#e0a92e';
    for (const [x, z] of [[12, 12], [-60, 132], [60, -24], [-150, -120], [150, -150], [-206, 150]]) {
      mapCtx.fillRect(toX(x) - 3, toY(z) - 3, 6, 6);
    }
    // Garage.
    mapCtx.fillStyle = '#3fa0ff';
    mapCtx.fillRect(toX(150) - 4, toY(-150) - 4, 8, 8);
    // Taxi passengers waiting.
    mapCtx.fillStyle = '#f7c948';
    for (const tp of world.taxiPassengers) {
      if (tp.active && !tp.taken) {
        mapCtx.beginPath(); mapCtx.arc(toX(tp.x), toY(tp.z), 4, 0, Math.PI * 2); mapCtx.fill();
      }
    }
    // Objective beacon.
    const obj = missions && missions.active ? missions.objective : null;
    if (obj && obj.x !== undefined && obj.type !== 'enterCar' && obj.type !== 'loseHeat') {
      const bx = obj.type === 'chase' ? world.smuggler.x : obj.x;
      const bz = obj.type === 'chase' ? world.smuggler.z : obj.z;
      mapCtx.fillStyle = '#ffd23f';
      mapCtx.beginPath(); mapCtx.arc(toX(bx), toY(bz), 6, 0, Math.PI * 2); mapCtx.fill();
      mapCtx.strokeStyle = '#ffd23f';
      mapCtx.beginPath(); mapCtx.arc(toX(bx), toY(bz), 10, 0, Math.PI * 2); mapCtx.stroke();
    }
    if (state.taxiActive && state.taxiDest) {
      mapCtx.fillStyle = '#f7c948';
      mapCtx.beginPath(); mapCtx.arc(toX(state.taxiDest.x), toY(state.taxiDest.z), 6, 0, Math.PI * 2); mapCtx.fill();
    }
    // Police.
    mapCtx.fillStyle = '#ff4444';
    for (const cop of world.cops) {
      if (!cop.dead) mapCtx.fillRect(toX(cop.x) - 2, toY(cop.z) - 2, 4, 4);
    }
    // Player.
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath(); mapCtx.arc(toX(player.x), toY(player.z), 5, 0, Math.PI * 2); mapCtx.fill();
    mapCtx.strokeStyle = '#2e6fc2';
    mapCtx.lineWidth = 2;
    mapCtx.stroke();
  }

  function showScreen(kind, data = {}) {
    lastScreen = kind;
    const s = el.screen;
    if (kind === 'none') { s.innerHTML = ''; s.className = ''; return; }
    s.className = 'screen-on';
    if (kind === 'title') {
      const save = data.save;
      s.innerHTML = `
        <div class="screen-panel">
          <h1>SOLMAR CITY</h1>
          <p class="tagline">A 3D open-world crime game — taxi fares, a safehouse garage, rain-slick streets and nine Mara jobs.</p>
          <p class="controls">WASD move &middot; E enter car &middot; F shoot &middot; T taxi fare &middot; G garage &middot; Q radio &middot; 1/2/3 weapons &middot; P pause &middot; M mute</p>
          ${save ? `<p class="save-line">Save: ${fmtMoney(save.cash)} &middot; ${save.jobsDone || 0}/9 jobs &middot; ${save.briefcasesFound || 0}/10 briefcases &middot; ${save.taxiJobsDone || 0} taxi fares</p>` : ''}
          <div class="btn-row">
            <button data-act="start">New game</button>
            ${data.hasSave ? '<button data-act="continue">Continue</button>' : ''}
            <button data-act="help">How to play</button>
          </div>
        </div>`;
    } else if (kind === 'help') {
      s.innerHTML = `
        <div class="screen-panel">
          <h1>HOW TO PLAY</h1>
          <p>Work Mara's nine jobs — the yellow beacon marks the target. On foot: WASD, Shift to run, Space to punch, F or click to shoot, 1/2/3 weapons, R reload. Drive with W/S and A/D, Space is the handbrake, E exits.</p>
          <p><b>Taxi (T):</b> drive a car up to a waiting passenger at a yellow TAXI sign, press T, and deliver them before the meter runs out. Fares pay by distance, fast trips earn a tip.</p>
          <p><b>Garage (G):</b> drive into the blue pad at the safehouse (south-east corner) and press G to repair, repaint, fit neon underglow or a spoiler. A customized car is yours — stealing it raises no heat.</p>
          <p><b>Radio (Q):</b> cycles Solmar FM, Neon Nights and Beach Radio while you drive. Rain rolls in on its own — wet roads, darker skies. Watch the wanted stars: foot cops at 1, cruisers at 2, roadblocks and a helicopter at 4.</p>
          <div class="btn-row"><button data-act="back">Back</button></div>
        </div>`;
    } else if (kind === 'pause') {
      s.innerHTML = `
        <div class="screen-panel">
          <h1>PAUSED</h1>
          <p>${fmtMoney(state.cash)} &middot; ${state.jobsDone}/9 jobs &middot; ${state.briefcasesFound}/10 briefcases</p>
          <div class="btn-row"><button data-act="resume">Resume</button><button data-act="quit">Quit to title</button></div>
        </div>`;
    } else if (kind === 'busted' || kind === 'wasted') {
      s.innerHTML = `
        <div class="screen-panel">
          <h1>${kind === 'busted' ? 'BUSTED' : 'WASTED'}</h1>
          <p>You lost ${fmtMoney(data.loss || 0)}. The city keeps moving.</p>
          <div class="btn-row"><button data-act="respawn">Get back out there</button></div>
        </div>`;
    } else if (kind === 'garage') {
      const car = state.car;
      const health = car ? Math.round(car.health) : 0;
      s.innerHTML = `
        <div class="screen-panel">
          <h1>SAFEHOUSE GARAGE</h1>
          <p>${car ? `${car.type} &middot; health ${health}%` : 'No car'} &middot; cash ${fmtMoney(state.cash)}</p>
          <p id="garage-result" class="garage-result"></p>
          <div class="btn-row">
            <button data-act="repair">Repair — $${GARAGE.repairCost}</button>
            <button data-act="repaint">Repaint — $${GARAGE.repaintCost}</button>
            <button data-act="underglow">Neon underglow — $${GARAGE.underglowCost}</button>
            <button data-act="spoiler">Spoiler — $${GARAGE.spoilerCost}</button>
          </div>
          <div class="btn-row"><button data-act="leave">Leave garage</button></div>
        </div>`;
      s.querySelectorAll('button[data-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.dataset.act;
          const result = s.querySelector('#garage-result');
          if (act === 'leave') {
            state.garageOpen = false;
            showScreen('none');
            return;
          }
          let text = '';
          if (act === 'repair') text = game.garageRepair();
          if (act === 'repaint') text = game.garageRepaint();
          if (act === 'underglow') text = game.garageUnderglow();
          if (act === 'spoiler') text = game.garageSpoiler();
          if (result) result.textContent = text;
          if (game.saveProgress) game.saveProgress();
        });
      });
    }
  }

  function update(missions) {
    el.cash.textContent = fmtMoney(state.cash);
    el.healthFill.style.width = `${Math.max(0, state.health)}%`;
    el.healthFill.style.background = state.health > 50 ? '#3aa655' : state.health > 25 ? '#e0a92e' : '#c23b2e';
    el.healthNum.textContent = String(Math.round(state.health));
    const stars = Math.floor(state.wanted);
    let starHtml = '';
    for (let i = 0; i < 5; i += 1) starHtml += `<span class="star ${i < stars ? 'lit' : ''}">★</span>`;
    el.wanted.innerHTML = starHtml;
    el.wanted.classList.toggle('hot', stars >= 4);
    el.clock.textContent = fmtClock(state.timeSec);
    el.weather.textContent = state.rain > 0.4 ? '🌧 Rain' : state.rain > 0.05 ? '🌦 Showers' : '☀ Dry';
    el.radio.textContent = state.radioOn && state.driving
      ? `♪ ${RADIO_STATIONS[state.radioStation].name}`
      : 'Radio off (Q)';
    if (missions && missions.active && missions.job) {
      const job = missions.job;
      const obj = missions.objective;
      const mins = Math.max(0, Math.floor(missions.timer / 60));
      const secs = Math.max(0, Math.floor(missions.timer % 60));
      el.objective.innerHTML = `<b>Job ${job.id}/9 — ${job.name}</b> · ${fmtMoney(job.payout)} · ${mins}:${String(secs).padStart(2, '0')}<br>${obj ? obj.label : ''}${obj && obj.type === 'hold' ? ` — hold ${Math.max(0, Math.ceil((obj.hold || 10) - missions.holdTime))}s` : ''}`;
      el.objective.classList.remove('hidden');
    } else if (missions && missions.finishedAll) {
      el.objective.innerHTML = '<b>Free roam</b> — all nine jobs done. Taxi fares and briefcases still pay.';
      el.objective.classList.remove('hidden');
    } else {
      el.objective.classList.add('hidden');
    }
    if (state.taxiActive && state.taxiDest) {
      el.taxi.classList.remove('hidden');
      el.taxi.innerHTML = `🚕 TAXI — to ${state.taxiDest.name} · fare ${fmtMoney(state.taxiFare)} · ${Math.ceil(state.taxiTimeLeft)}s left`;
    } else {
      el.taxi.classList.add('hidden');
    }
    if (state.driving && state.car) {
      el.speed.classList.remove('hidden');
      const dmg = state.car.health < 55 ? (state.car.health < 25 ? ' 🔥 FIRE!' : ' 💨 smoking') : '';
      el.speed.textContent = `${Math.round(Math.abs(state.carSpeed) * 3.6)} km/h · ${state.car.type}${dmg}`;
    } else {
      el.speed.classList.add('hidden');
    }
    if (state.messages.length !== lastMsgCount) {
      lastMsgCount = state.messages.length;
      el.messages.innerHTML = state.messages.map((m) => `<div>${m}</div>`).join('');
    }
    drawMinimap(missions);
  }

  return { showScreen, update, get screen() { return lastScreen; } };
}
