// Solmar City — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, missions and the HUD read the world, and the
// renderer paints what is there. Screens: title, play, paused, help, busted,
// wasted. Progress (cash, jobs, briefcases) is saved to localStorage.
//
// ?seed=N fixes the city and traffic. ?shot=start|chase|night|end (with
// &seed=N) stages that scene instead of running the loop, paints it a few
// times and sets window.__shotReady for a screenshot.

import * as THREE from 'three';
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import {
  ACTION_CAM, ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE,
  ACTION_RELOAD, ACTION_SHOOT, createInput,
} from './input.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const audio = createAudio();
const hud = createHud(document);
const world = createWorld(THREE, canvas, createRandom(seed), audio, {
  onMessage: (text) => hud.logMessage(text),
});
const missions = createMissions(world, audio, (text) => hud.logMessage(text));
const input = createInput(canvas);

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.getSave()));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}
function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

let screen = 'title';
let saveTimer = 0;
let endKind = 'busted';

function refreshTitle() {
  const save = readSave();
  hud.setContinueVisible(!!save, save
    ? `Save found — $${save.cash.toLocaleString('en-US')}, ${save.missionsDone} job${save.missionsDone === 1 ? '' : 's'} done, ${save.collectiblesFound}/10 briefcases.`
    : '');
}

function newGame() {
  clearSave();
  world.reset();
  missions.start();
  screen = 'play';
  audio.ensure(); audio.click();
  hud.showBanner('SOLMAR CITY', 'Mara is waiting. Follow the yellow beacon.');
  hud.logMessage('Welcome to Solmar. WASD to move, E to steal a car, F to shoot, P to pause.');
}
function continueGame() {
  const save = readSave();
  world.reset();
  if (save) world.applySave(save);
  missions.start();
  screen = 'play';
  audio.ensure(); audio.click();
  hud.showBanner('WELCOME BACK', 'Mara kept your jobs warm.');
}

hud.bind({
  newGame,
  continueGame,
  help: () => { screen = 'help'; },
  backToTitle: () => { screen = 'title'; refreshTitle(); },
  resume: () => { screen = 'play'; },
  restartMission: () => { missions.start(); screen = 'play'; },
  quitToTitle: () => { writeSave(); screen = 'title'; refreshTitle(); },
  respawn: () => {
    world.respawn(endKind === 'busted');
    missions.start();
    writeSave();
    screen = 'play';
  },
});

function handleWorldEvents() {
  for (const e of world.takeEvents()) {
    if (e.type === 'busted' && screen === 'play') {
      screen = 'busted'; endKind = 'busted';
      hud.showEnd('busted', 'The cops caught you on foot. 10% of your cash goes to fines and impound fees.');
      audio.fail();
    } else if (e.type === 'wasted' && screen === 'play') {
      screen = 'wasted'; endKind = 'wasted';
      hud.showEnd('wasted', 'You flatlined. The hospital patched you up — 10% of your cash goes to the bill.');
      audio.fail();
    } else if (e.type === 'land') {
      missions.onWorldEvent(e);
    } else if (e.type === 'collect') {
      writeSave();
    }
  }
  for (const text of world.takeMessages()) hud.logMessage(text);
}

function handleActions() {
  const actions = input.takeActions();
  const slot = input.takeWeaponSlot();
  if (slot >= 0 && slot <= 2 && screen === 'play') {
    world.player.weapon = slot;
    audio.click();
  }
  if (actions & ACTION_MUTE) hud.setMuted(audio.toggleMute());
  if (actions & ACTION_CAM && screen === 'play') world.toggleChaseCam();
  if (actions & ACTION_CONFIRM) {
    audio.ensure();
    if (screen === 'title') { if (readSave()) continueGame(); else newGame(); }
    else if (screen === 'busted' || screen === 'wasted') { world.respawn(endKind === 'busted'); missions.start(); writeSave(); screen = 'play'; }
    else if (screen === 'paused') screen = 'play';
  }
  if (actions & ACTION_PAUSE) {
    if (screen === 'play') screen = 'paused';
    else if (screen === 'paused') screen = 'play';
  }
  if (screen !== 'play') return;
  if (actions & ACTION_ENTER) {
    audio.ensure();
    if (world.player.boat) world.exitVehicle();
    else if (world.player.vehicle) world.exitVehicle();
    else if (!world.enterBoat()) world.enterNearestVehicle();
  }
  if (actions & ACTION_SHOOT) world.shoot();
  if (actions & ACTION_RELOAD) world.reloadWeapon();
}

function stepGame(dt) {
  missions.update(dt);
  world.step(dt, input, input.takeOrbit());
  // Punch on Space: the input layer reports Space as handbrake/confirm, so
  // punch uses the held handbrake key while on foot.
  if (input.held.handbrake && world.player.onFoot) world.punch();
  handleWorldEvents();
  saveTimer += dt;
  if (saveTimer > 5) { saveTimer = 0; writeSave(); }
}

function runShot(name) {
  const shotScreen = stageShot(name, world, missions);
  screen = shotScreen;
  refreshTitle();
  world.refreshCamera();
  world.resize(window.innerWidth, window.innerHeight);
  let painted = 0;
  function paint() {
    world.render();
    hud.update(world, missions, screen);
    painted += 1;
    if (painted < 4) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  world.resize(window.innerWidth, window.innerHeight);
  refreshTitle();
  hud.setMuted(false);
  let accumulator = 0;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === 'play') {
      while (accumulator >= STEP && screen === 'play') {
        stepGame(STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      // The title screen stays alive behind the menu: peds wander, traffic rolls.
      if (screen === 'title') {
        world.step(STEP, { moveAxes: () => ({ f: 0, s: 0 }), held: { run: false, handbrake: false }, takeActions: () => 0, takeWeaponSlot: () => -1, takeOrbit: () => ({ dx: 0, dy: 0 }) }, { dx: 0.002, dy: 0 });
      }
    }
    world.render();
    hud.update(world, missions, screen);
  }
  window.addEventListener('resize', () => world.resize(window.innerWidth, window.innerHeight));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') screen = 'paused';
  });
  requestAnimationFrame(frame);
}

// Probing hooks for playtests (and for the ?shot= staging): not part of the game.
window.__game = { world, missions, audio, input };
window.__solmar = { version: 'r5', buildings: world.buildingCount };

if (shot) runShot(shot);
else runGame();
