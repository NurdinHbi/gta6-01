// Solmar City — boot and fixed-step game loop. Builds the game object,
// wires input, audio, HUD and renderer together, runs the simulation at
// a fixed 1/60 s step, and owns save/load and the ?shot= staging used
// for screenshots.
import { STEP, SAVE_KEY, START_CASH, STATION, HOSPITAL, CAR, POLICE } from './config.js';
import { makeRng, clamp, dist } from './random.js';
import { buildCity } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createPlayer, updatePlayerOnFoot, tryPunch, tryShoot, tryEnterCar, exitCar, regenHealth } from './player.js';
import { spawnTraffic, drivePlayerCar, updateTraffic, separateCars, speedKmh, nearestCar } from './vehicles.js';
import { spawnPeds, updatePeds, carHitsPed, scarePeds } from './pedestrians.js';
import { createWanted, addWanted, updateWanted, updateCops, updatePoliceCars } from './police.js';
import { createMissions, updateMissions, beginStory, startMissionAt } from './missions.js';
import { createHud, updateHud, drawMinimap, showScreen, hideScreens } from './hud.js';
import { createRenderer, buildCityMeshes, createEntityMeshes, syncEntities, updateCamera, updateTitleCamera, fireTracer } from './render.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || '1') || 1;

const canvas = document.getElementById('game');
const input = createInput(canvas);
const audio = createAudio();
const hud = createHud();
const render = createRenderer(canvas);

const game = {
  seed,
  rng: makeRng(seed),
  time: 0,
  clockMinutes: 10 * 60, // the story opens at 10:00
  screen: 'title',
  hasSave: false,
  fps: 0,
  shotWp: 0,
  city: null,
  player: null,
  cars: [],
  peds: [],
  wanted: null,
  missions: null,
  camera: { yaw: Math.PI * 0.75, pitch: 0.32, dist: 11 },
  stats: { missionsDone: 0, cashEarned: 0, carsStolen: 0, pedsHit: 0 },
  input,
  audio,
  saveTimer: 0,
};

game.addWanted = (amount) => addWanted(game.wanted, amount, game.time);

// Rebuild the whole world from the seed. Used at boot, on New Game, and
// by ?shot= staging so every scene starts from the same city.
game.reset = (resetSeed) => {
  game.seed = resetSeed;
  game.rng = makeRng(resetSeed);
  game.time = 0;
  game.clockMinutes = 10 * 60;
  game.city = buildCity(resetSeed);
  game.player = createPlayer(-208, 180);
  game.player.cash = START_CASH;
  game.cars = spawnTraffic(game.city, game.rng, game.player.x, game.player.z);
  game.peds = spawnPeds(game.city, game.rng);
  game.wanted = createWanted();
  game.missions = createMissions();
  game.stats = { missionsDone: 0, cashEarned: 0, carsStolen: 0, pedsHit: 0 };
  game.camera = { yaw: Math.PI * 0.75, pitch: 0.32, dist: 11 };
  game.saveTimer = 0;
  beginStory(game.missions, game.rng);
};

game.reset(seed);
buildCityMeshes(render, game.city);
const meshes = createEntityMeshes(render);

// --- Save / load ----------------------------------------------------------
function saveGame() {
  try {
    const p = game.player;
    const data = {
      cash: p.cash,
      health: p.health,
      missionIndex: game.missions.index,
      missionStage: game.missions.stage,
      x: p.inCar ? p.car.x : p.x,
      z: p.inCar ? p.car.z : p.z,
      wanted: game.wanted.stars,
      stats: game.stats,
      clockMinutes: game.clockMinutes,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    game.hasSave = true;
  } catch {
    // Storage full or unavailable: the game keeps playing unsaved.
  }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function applySave(data) {
  if (!data) return;
  game.player.cash = data.cash ?? START_CASH;
  game.player.health = data.health ?? 100;
  game.player.x = data.x ?? -208;
  game.player.z = data.z ?? 180;
  game.clockMinutes = data.clockMinutes ?? 10 * 60;
  game.stats = data.stats ?? game.stats;
  // Mission progress resumes at the start of the saved mission.
  const idx = Math.min(data.missionIndex ?? 0, 3);
  game.missions.completed = false;
  startMissionAt(game.missions, idx, game.rng);
}

game.hasSave = !!loadSave();

// --- Crime helpers --------------------------------------------------------
function commitCrime(stars) {
  game.addWanted(stars);
}

function respawn(kind) {
  const p = game.player;
  const lost = Math.floor(p.cash * 0.1);
  p.cash -= lost;
  p.health = 100;
  p.hurtFlash = 0;
  game.wanted.stars = 0;
  game.wanted.cops = [];
  for (const car of game.wanted.policeCars) car.dead = true;
  game.wanted.policeCars = [];
  if (p.inCar) {
    p.car.kind = 'parked';
    p.car.speed = 0;
    p.inCar = null;
    p.car = null;
  }
  const spot = kind === 'busted' ? STATION : HOSPITAL;
  p.x = spot.x;
  p.z = spot.z;
  p.angle = 0;
  p.speed = 0;
  game.camera.yaw = Math.PI * 0.75;
  saveGame();
}

// --- One fixed simulation step -------------------------------------------
game.step = (dt, silent) => {
  const p = game.player;
  p.time = game.time;
  game.time += dt;
  game.clockMinutes += dt * 0.5; // one game hour per two real minutes
  game.camera.yaw -= input.dragDX * 0.005;
  game.camera.pitch += input.dragDY * 0.004;
  game.camera.pitch = clamp(game.camera.pitch, 0.08, 1.1);
  game.camera.dist = clamp(game.camera.dist + input.wheel * 0.01, 6, 16);

  if (input.mute) {
    audio.setMuted(!audio.muted);
    if (!silent) audio.click();
  }

  if (input.pause && !silent) {
    if (game.screen === 'play') {
      game.screen = 'pause';
      showScreen(hud, 'pause', game);
      saveGame();
    } else if (game.screen === 'pause') {
      game.screen = 'play';
      hideScreens(hud);
    }
  }

  if (game.screen !== 'play' && !silent) {
    input.consumeEdges();
    return;
  }

  // Enter / exit a car.
  if (input.enterCar) {
    if (p.inCar) {
      exitCar(p);
      if (!silent) audio.click();
    } else {
      const got = tryEnterCar(p, game.cars);
      if (got) {
        if (!silent) audio.pickup();
        if (got.stolen) {
          commitCrime(1);
          game.stats.carsStolen += 1;
          if (!silent) audio.sirenBlip();
          game.missions.message = 'You jacked the car! The owner is calling the cops.';
          game.missions.messageTimer = 3;
        }
      }
    }
  }

  // Combat on foot.
  if (!p.inCar && input.punch) {
    const result = tryPunch(p, game.peds, game.wanted.cops);
    if (result && result.hit) {
      if (!silent) audio.punch();
      if (result.kind === 'cop') commitCrime(2);
      scarePeds(game.peds, p.x, p.z, 10);
    }
  }
  if (!p.inCar && input.shoot) {
    const result = tryShoot(p, game.peds, game.wanted.cops, game.cars);
    if (result) {
      if (!silent) audio.gunshot();
      fireTracer(meshes, p.x, p.z, result.endX, result.endZ);
      scarePeds(game.peds, p.x, p.z, 22);
      commitCrime(1);
      if (result.hit && result.kind === 'cop' && result.target.down) commitCrime(2);
    }
  }

  // Movement.
  if (p.inCar) {
    const crashed = drivePlayerCar(p.car, input, dt, game.city, game.cars);
    if (crashed && !silent && Math.abs(p.car.speed) > 8) audio.crash();
    p.x = p.car.x;
    p.z = p.car.z;
    p.angle = p.car.angle;
    p.speed = Math.abs(p.car.speed);
  } else {
    updatePlayerOnFoot(p, input, game.camera.yaw, dt, game.city, game.cars, game.peds);
  }
  regenHealth(p, dt);

  // Traffic, peds, police, missions.
  for (const car of game.cars) {
    if (car.kind === 'traffic') updateTraffic(car, dt, game.city, game.rng, game.cars);
  }
  separateCars(game.cars);
  game.cars = game.cars.filter((c) => !c.dead);
  updatePeds(game.peds, dt, game.city, game.rng, game.cars);
  const hit = carHitsPed(game.cars, game.peds);
  if (hit) {
    commitCrime(1);
    game.stats.pedsHit += 1;
    if (!silent) audio.crash();
    scarePeds(game.peds, hit.ped.x, hit.ped.z, 18);
  }
  updateWanted(game.wanted, dt, game.time, p.inCar ? p.car.x : p.x, p.inCar ? p.car.z : p.z, game.rng, game.cars, game.city);
  const busted = updateCops(game.wanted, dt, p, game.cars);
  if (busted === 'busted' && !silent) {
    game.screen = 'busted';
    showScreen(hud, 'busted', game);
    respawn('busted');
    input.consumeEdges();
    return;
  }
  const ramDamage = updatePoliceCars(game.wanted, dt, p, game.cars, game.city);
  if (ramDamage > 0 && !silent) audio.crash();
  updateMissions(game, dt);

  // Wasted.
  if (p.health <= 0 && !silent) {
    p.health = 0;
    game.screen = 'wasted';
    showScreen(hud, 'wasted', game);
    respawn('wasted');
    input.consumeEdges();
    return;
  }

  // Autosave every 10 seconds of play.
  game.saveTimer += dt;
  if (game.saveTimer > 10) {
    game.saveTimer = 0;
    if (!silent) saveGame();
  }

  input.consumeEdges();
};

// --- Screens and buttons ---------------------------------------------------
function startGame(fresh) {
  audio.ensure();
  if (fresh) {
    game.reset(seed);
    try { localStorage.removeItem(SAVE_KEY); } catch { /* no storage */ }
    game.hasSave = false;
  } else {
    const data = loadSave();
    if (data) applySave(data);
  }
  game.screen = 'play';
  hideScreens(hud);
  audio.click();
}

hud.screenStart.addEventListener('click', () => startGame(true));
hud.screenContinue.addEventListener('click', () => startGame(false));
document.getElementById('resume-button').addEventListener('click', () => {
  game.screen = 'play';
  hideScreens(hud);
  audio.click();
});
document.getElementById('quit-button').addEventListener('click', () => {
  saveGame();
  game.screen = 'title';
  showScreen(hud, 'title', game);
});
hud.endButton.addEventListener('click', () => {
  game.screen = 'play';
  hideScreens(hud);
  audio.click();
});
canvas.addEventListener('mousedown', () => audio.ensure());

// --- ?shot= staging ---------------------------------------------------------
let shotReadyFrames = 0;
if (shotName) {
  const shown = stageShot(shotName, game);
  game.screen = shown === 'title' ? 'title' : 'play';
  if (shown === 'title') showScreen(hud, 'title', game);
  else hideScreens(hud);
  updateHud(hud, game);
  drawMinimap(hud, game);
}

// --- Main loop ---------------------------------------------------------------
let last = performance.now();
let acc = 0;
let fpsFrames = 0;
let fpsTime = 0;
let minimapTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsFrames += 1;
  fpsTime += dtReal;
  if (fpsTime >= 0.5) {
    game.fps = fpsFrames / fpsTime;
    fpsFrames = 0;
    fpsTime = 0;
  }

  if (game.screen === 'play') {
    acc += dtReal;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      game.step(STEP, false);
      acc -= STEP;
      steps += 1;
    }
    if (steps === 5) acc = 0;
  } else if (game.screen === 'title') {
    // The city stays alive behind the title screen.
    acc += dtReal;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      const keep = game.screen;
      game.screen = 'play';
      game.step(STEP, true);
      game.screen = keep;
      acc -= STEP;
      steps += 1;
    }
    if (steps === 5) acc = 0;
  }

  if (game.screen === 'title') updateTitleCamera(render, game, dtReal);
  else updateCamera(render, game, dtReal);
  syncEntities(render, meshes, game);
  render.renderer.render(render.scene, render.camera);

  minimapTimer += dtReal;
  if (minimapTimer > 0.1) {
    minimapTimer = 0;
    if (game.screen === 'play') {
      updateHud(hud, game);
      drawMinimap(hud, game);
    }
  }
  const speed = game.player.inCar ? speedKmh(game.player.car) : 0;
  audio.update(speed, game.wanted.stars, dtReal);

  if (shotName) {
    shotReadyFrames += 1;
    if (shotReadyFrames >= 3) window.__shotReady = true;
  }
}

if (!shotName) showScreen(hud, 'title', game);
updateHud(hud, game);
drawMinimap(hud, game);
// Exposed for live playtests and debugging; the game never reads it.
window.__game = game;
requestAnimationFrame(frame);
