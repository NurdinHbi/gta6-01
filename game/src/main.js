// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. Screens: title,
// help, play, paused, busted, wasted, garage. Progress is saved to
// localStorage.
//
// ?seed=N fixes the city and traffic. ?shot=start|chase|night|end (with
// &seed=N) stages that scene instead of running the loop, paints it a few
// times and sets window.__shotReady for a screenshot.
import { STEP, SAVE_KEY, PLAYER } from './config.js';
import { createRandom } from './random.js';
import { createGame } from './world.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE } from './input.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const game = createGame(canvas, createRandom(seed), audio);
game.audio = audio;
const missions = createMissions(game);
game.missions = missions;
const hud = createHud(game);

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveProgress() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(game.getSave()));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit.
  }
}
game.saveProgress = saveProgress;

const save = readSave();
if (save) {
  game.applySave(save);
  missions.jobIndex = Math.min(save.jobsDone || 0, 8);
}

let screen = 'title';

function announce(message) {
  status.textContent = message;
}

function showTitle() {
  screen = 'title';
  hud.showScreen('title', { hasSave: !!save, save: save || null });
  announce('Solmar City. Press Enter to start.');
}

function startGame(fresh) {
  if (fresh) {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      // Ignore storage errors.
    }
    game.state.cash = PLAYER.startCash;
    game.state.jobsDone = 0;
    game.state.briefcasesFound = 0;
    game.state.bestStunt = 0;
    game.state.taxiJobsDone = 0;
    game.state.garageUpgrades = 0;
    game.state.health = PLAYER.maxHealth;
    game.setWanted(0);
    game.player.x = PLAYER.startX;
    game.player.z = PLAYER.startZ;
    game.player.angle = Math.PI;
    game.state.playerY = 0;
    game.state.onRoof = false;
    for (const b of game.world.briefcases) {
      b.found = false;
      b.mesh.visible = true;
    }
    for (const r of game.world.ramps) r.used = false;
    missions.jobIndex = 0;
    missions.finishedAll = false;
  }
  audio.unlock();
  screen = 'play';
  hud.showScreen('none');
  missions.beginJob();
  announce("Playing. Follow Mara's job — the yellow beacon marks the target.");
}

function endScreen(kind) {
  screen = kind;
  const loss = game.state.lastLoss || 0;
  hud.showScreen(kind, { loss });
  announce(kind === 'busted' ? 'Busted by the police.' : 'Wasted.');
}

function runShot(name) {
  const staged = stageShot(name, game);
  screen = staged.screen;
  if (staged.screen === 'title') {
    hud.showScreen('title', { hasSave: false, save: null });
  } else {
    hud.showScreen('none');
  }
  hud.update(missions);
  let painted = 0;
  function paint() {
    game.render();
    painted += 1;
    if (painted < 4) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();
  let lastOver = null;

  // Screen buttons (title / help / pause / busted / wasted).
  document.getElementById('hud-screen').addEventListener('click', (event) => {
    const act = event.target && event.target.dataset ? event.target.dataset.act : null;
    if (!act) return;
    audio.unlock();
    if (act === 'start') startGame(true);
    else if (act === 'continue') startGame(false);
    else if (act === 'help') {
      screen = 'help';
      hud.showScreen('help');
    } else if (act === 'back') showTitle();
    else if (act === 'resume') {
      screen = 'play';
      hud.showScreen('none');
    } else if (act === 'quit') showTitle();
    else if (act === 'respawn') {
      game.respawn();
      screen = 'play';
      hud.showScreen('none');
    }
  });

  window.addEventListener('resize', () => game.resize());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'pause';
      hud.showScreen('pause');
    }
  });

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      game.msg(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (screen === 'title' || screen === 'help') {
      if (actions & ACTION_CONFIRM) startGame(screen === 'title' && !!save ? false : true);
      return actions;
    }
    if (screen === 'busted' || screen === 'wasted') {
      if (actions & ACTION_CONFIRM) {
        game.respawn();
        screen = 'play';
        hud.showScreen('none');
      }
      return actions;
    }
    if (screen === 'garage') return actions;
    if (screen === 'pause') {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = 'play';
        hud.showScreen('none');
      }
      return actions;
    }
    if (screen === 'play' && (actions & ACTION_PAUSE)) {
      screen = 'pause';
      hud.showScreen('pause');
      return actions;
    }
    return actions;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    // Driving into the garage pad and pressing G opens the garage screen.
    if (screen === 'play' && game.state.garageOpen) {
      screen = 'garage';
      hud.showScreen('garage');
    }
    // The garage screen's Leave button clears garageOpen; resume play.
    if (screen === 'garage' && !game.state.garageOpen) {
      screen = 'play';
      hud.showScreen('none');
    }
    const paused = screen !== 'play';
    while (accumulator >= STEP) {
      const events = game.step(STEP, input, screen === 'play' ? actions : 0, paused);
      if (screen === 'play') missions.update(STEP, events, actions);
      accumulator -= STEP;
      if (game.state.over && game.state.over !== lastOver) {
        lastOver = game.state.over;
        saveProgress();
        endScreen(game.state.over);
      }
    }
    if (screen === 'play' || screen === 'pause' || screen === 'title' || screen === 'garage') {
      game.render();
      hud.update(missions);
    }
  }

  showTitle();
  requestAnimationFrame(frame);
}

// Debug handles for automated playtests (not part of the game UI).
window.__game = game;
window.__missions = missions;
window.__hud = hud;

if (shot) runShot(shot);
else runGame();
