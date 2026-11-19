// Solmar City — boot and main loop. Wires the city, the crowd, the traffic, the driver,
// Mara's story, the HUD and the sound together, then runs a fixed 1/60 s simulation
// under a requestAnimationFrame painter. Screens: title, play, pause, busted, wasted
// and help. ?seed=N fixes the city; ?shot=start|play|end stages a screenshot scene
// and sets window.__shotReady once it has painted.

import * as THREE from 'three';
import { makeRng, hashSeed } from './rng.js';
import { freshState, saveGame, loadGame, bailCut, START_HEALTH } from './state.js';
import { buildCity, resolveCollisions, clampToCity } from './city.js';
import { createControls, ACT_ENTER, ACT_PUNCH, ACT_PAUSE, ACT_HELP, ACT_MUTE, ACT_SHOOT } from './controls.js';
import { createSound } from './sound.js';
import { createCrowd } from './people.js';
import { createTraffic } from './traffic.js';
import { createDriver, makeTracer } from './driving.js';
import { createStory, MISSION_REWARDS, MISSIONS } from './story.js';
import { createOverlay } from './overlay.js';
import { stageShot } from './staging.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const WALK_SPEED = 5.2;
const RUN_SPEED = 9.0;

const params = new URLSearchParams(window.location.search);
const seedParam = params.get('seed');
const seed = seedParam === null ? (Math.random() * 4294967296) | 0 : hashSeed(seedParam);
const shotName = params.get('shot');

const canvas = document.getElementById('scene');
const rng = makeRng(seed);
const sound = createSound();

// --- Three.js setup ---------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec3e8);
scene.fog = new THREE.Fog(0xbfd9e8, 200, 760);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 40, 120);

const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
sun.position.set(180, 260, 120);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -320;
sun.shadow.camera.right = 320;
sun.shadow.camera.top = 320;
sun.shadow.camera.bottom = -320;
sun.shadow.camera.far = 800;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.0));

// Drifting clouds: flat white slabs high over the city.
const clouds = [];
{
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 9; i += 1) {
    const cloud = new THREE.Mesh(new THREE.BoxGeometry(rng.range(24, 46), 3, rng.range(10, 18)), cloudMat);
    cloud.position.set(rng.range(-320, 320), rng.range(95, 135), rng.range(-320, 380));
    scene.add(cloud);
    clouds.push({ mesh: cloud, speed: rng.range(0.6, 1.6) });
  }
}

// --- World ------------------------------------------------------------------
const city = buildCity(scene, rng);
const crowd = createCrowd(scene, rng, city.colliders);
const traffic = createTraffic(scene, rng, city.parkedSpots, city.colliders);
const driver = createDriver(scene, city.colliders);
const story = createStory(scene, city.landmarks);
const overlay = createOverlay(city.buildingRects);
const controls = createControls(canvas);
const tracer = makeTracer(scene);

// --- Player -----------------------------------------------------------------
function buildPlayerMesh() {
  const figure = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x1f8a70 });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2b3a55 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.88, 0.36), jacket);
  body.position.y = 1.06;
  body.castShadow = true;
  figure.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.74;
  head.castShadow = true;
  figure.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.14, 12), new THREE.MeshLambertMaterial({ color: 0xffd23f }));
  cap.position.y = 1.94;
  figure.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.3), new THREE.MeshLambertMaterial({ color: 0xffd23f }));
  brim.position.set(0, 1.9, 0.3);
  figure.add(brim);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.17), jacket);
  armL.position.set(-0.42, 1.06, 0);
  figure.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.17), jacket);
  armR.position.set(0.42, 1.06, 0);
  figure.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.64, 0.23), jeans);
  legL.position.set(-0.17, 0.32, 0);
  figure.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.64, 0.23), jeans);
  legR.position.set(0.17, 0.32, 0);
  figure.add(legR);
  figure.userData = { armL, armR, legL, legR };
  return figure;
}

const playerMesh = buildPlayerMesh();
scene.add(playerMesh);
const playerPos = new THREE.Vector3(0, 0, 26);
let playerHeading = Math.PI;
let walkPhase = 0;
let stumble = 0;
let lastDamageAt = -100;
let crimeAt = -1000;
let decayAcc = 0;
let arrestTimer = 0;
let ramCooldown = 0;
let carHitCooldown = 0;
let maraPromptAt = -100;
let saveTimer = 0;
let simTime = 0;

// --- State ------------------------------------------------------------------
let state = freshState();
let screen = 'title';
let prevScreen = 'play';
const cameraRig = {
  yaw: 0.6,
  pitch: 0.34,
  dist: 10,
  titleOrbit: true,
  followCarUntil: 0,
  snapBehindCar() {
    this.yaw = driver.heading;
    this.titleOrbit = false;
  },
  orbitTitle() {
    this.titleOrbit = true;
  },
};

function addWanted(n, reason) {
  if (n <= 0) return;
  state.wanted = Math.min(5, state.wanted + n);
  state.bestWanted = Math.max(state.bestWanted, state.wanted);
  crimeAt = simTime;
  decayAcc = 0;
  if (reason) overlay.announce(`Wanted level ${state.wanted}. ${reason}`);
}

function playerTo(x, z, heading) {
  if (driver.inCar) driver.exit(playerPos);
  playerPos.set(x, 0, z);
  playerHeading = heading;
  playerMesh.position.copy(playerPos);
  playerMesh.rotation.y = heading;
}

function setWanted(n) {
  state.wanted = Math.max(0, Math.min(5, n));
  state.bestWanted = Math.max(state.bestWanted, state.wanted);
  crimeAt = simTime;
}

function spawnChasePair() {
  traffic.syncPatrols(Math.max(2, state.wanted), playerPos);
  const dirX = Math.sin(driver.heading);
  const dirZ = Math.cos(driver.heading);
  const perpX = Math.cos(driver.heading);
  const perpZ = -Math.sin(driver.heading);
  traffic.patrols.slice(0, 2).forEach((patrol, i) => {
    const side = i === 0 ? -5 : 5;
    patrol.pos.set(playerPos.x - dirX * 14 + perpX * side, 0, playerPos.z - dirZ * 14 + perpZ * side);
    patrol.heading = driver.heading;
    patrol.speed = 12;
  });
}

function warpIntoCar(x, z, heading) {
  let best = null;
  let bestD = Infinity;
  for (const c of traffic.parked) {
    const d = Math.hypot(c.pos.x - x, c.pos.z - z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best) return false;
  best.pos.set(x, 0, z);
  best.heading = heading;
  best.mesh.rotation.y = heading;
  best.parked = false;
  best.stolen = true;
  driver.enter(best, playerPos);
  playerMesh.visible = false;
  cameraRig.yaw = heading;
  cameraRig.titleOrbit = false;
  return true;
}

function startFresh(overrides) {
  state = freshState();
  if (overrides) Object.assign(state, overrides);
  playerTo(0, 26, Math.PI);
  playerMesh.visible = true;
  story.abandon();
  story.showMaraBeacon();
  setWanted(0);
  simTime = 0;
  crimeAt = -1000;
  decayAcc = 0;
  arrestTimer = 0;
}

function startMission(index) {
  const brief = story.start(index, state);
  overlay.toast(`Job ${index + 1} — ${MISSIONS[index].name}: ${brief}`, 5);
  overlay.announce(`Mission started: ${MISSIONS[index].name}. ${brief}`);
  sound.pickup();
}

function missionComplete(index) {
  const reward = MISSION_REWARDS[index];
  state.cash += reward;
  state.missionsDone += 1;
  state.missionIndex = index + 1;
  sound.jingle();
  overlay.toast(`Job complete! Mara paid you $${reward}.`, 4);
  saveGame(state);
  if (state.missionIndex >= MISSIONS.length) {
    state.storyComplete = true;
    overlay.toast('STORY COMPLETE — Solmar City is yours!', 6);
    overlay.announce('Story complete. Solmar City is yours.');
  } else {
    story.showMaraBeacon();
    overlay.toast(`Next job waits at Mara's kiosk.`, 4);
  }
}

function missionFailed(note) {
  sound.fail();
  overlay.toast(`${note} Talk to Mara to try again.`, 4);
  story.showMaraBeacon();
}

function bustPlayer() {
  const cut = bailCut(state.cash);
  state.cash -= cut;
  state.wanted = 0;
  state.health = START_HEALTH;
  story.abandon();
  story.showMaraBeacon();
  playerTo(city.landmarks.policeStation.x, city.landmarks.policeStation.z, 0);
  playerMesh.visible = true;
  sound.busted();
  sound.siren(false);
  overlay.setBustedText(`The Solmar PD caught up with you. Bail cost you $${cut} — 10% of your cash.`);
  screen = 'busted';
  overlay.showScreen('busted');
  saveGame(state);
}

function wastePlayer() {
  const cut = bailCut(state.cash);
  state.cash -= cut;
  state.wanted = 0;
  state.health = START_HEALTH;
  story.abandon();
  story.showMaraBeacon();
  playerTo(city.landmarks.hospital.x, city.landmarks.hospital.z, 0);
  playerMesh.visible = true;
  sound.busted();
  sound.siren(false);
  overlay.setWastedText(`You flatlined on a Solmar street. The hospital patched you up — for $${cut}, 10% of your cash.`);
  screen = 'wasted';
  overlay.showScreen('wasted');
  saveGame(state);
}

function damagePlayer(amount) {
  if (screen !== 'play') return;
  state.health = Math.max(0, state.health - amount);
  lastDamageAt = simTime;
  if (state.health <= 0) wastePlayer();
}

// --- Combat -----------------------------------------------------------------
function rayHit(origin, dir, maxDist) {
  let bestT = maxDist;
  let bestKind = null;
  let bestObj = null;
  const testSphere = (cx, cy, cz, r, kind, obj) => {
    const ox = cx - origin.x;
    const oy = cy - origin.y;
    const oz = cz - origin.z;
    const t = ox * dir.x + oy * dir.y + oz * dir.z;
    if (t < 0 || t > bestT) return;
    const dx = ox - dir.x * t;
    const dy = oy - dir.y * t;
    const dz = oz - dir.z * t;
    if (dx * dx + dy * dy + dz * dz < r * r) {
      bestT = t;
      bestKind = kind;
      bestObj = obj;
    }
  };
  for (const w of crowd.walkers) {
    if (w.alive && w.down <= 0) testSphere(w.pos.x, 1.2, w.pos.z, 1.0, 'walker', w);
  }
  for (const c of crowd.cops) {
    if (c.alive) testSphere(c.pos.x, 1.2, c.pos.z, 1.0, 'cop', c);
  }
  for (const c of [...traffic.aiCars, ...traffic.patrols, ...traffic.parked]) {
    if (c === driver.car) continue;
    testSphere(c.pos.x, 0.9, c.pos.z, 2.3, 'car', c);
  }
  return { t: bestT, kind: bestKind, obj: bestObj };
}

function shoot() {
  if (screen !== 'play') return;
  sound.unlock();
  const origin = new THREE.Vector3();
  camera.getWorldPosition(origin);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const from = driver.inCar
    ? new THREE.Vector3(playerPos.x, 1.4, playerPos.z)
    : new THREE.Vector3(playerPos.x, 1.5, playerPos.z);
  const hit = rayHit(origin, dir, 90);
  const end = origin.clone().add(dir.clone().multiplyScalar(hit.kind ? hit.t : 70));
  tracer.fire(from, end);
  sound.shot();
  // A shot in earshot of anyone is a crime in itself.
  let witnessed = false;
  for (const w of crowd.walkers) {
    if (Math.hypot(w.pos.x - playerPos.x, w.pos.z - playerPos.z) < 60) { witnessed = true; break; }
  }
  if (!witnessed) {
    for (const c of crowd.cops) {
      if (Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z) < 60) { witnessed = true; break; }
    }
  }
  if (witnessed) addWanted(1, 'Shots fired in public.');
  if (hit.kind === 'walker') {
    crowd.knockDown(hit.obj, 5);
    addWanted(1, 'Pedestrian down.');
    overlay.toast('Pedestrian hit! The city saw that.', 2.5);
  } else if (hit.kind === 'cop') {
    hit.obj.hp -= 25;
    if (hit.obj.hp <= 0) {
      crowd.removeCop(hit.obj);
      state.kills += 1;
      addWanted(2, 'Officer down.');
      overlay.toast('Officer down! Every cop in Solmar is coming.', 3);
    } else {
      overlay.toast('You hit a cop!', 2);
    }
  } else if (hit.kind === 'car') {
    sound.thud();
  }
  // Panic the crowd near the gunshot: everyone close by runs away from the player.
  for (const w of crowd.walkers) {
    const dx = w.pos.x - playerPos.x;
    const dz = w.pos.z - playerPos.z;
    if (dx * dx + dz * dz < 30 * 30) {
      const d = Math.hypot(dx, dz) || 1;
      w.target = { x: w.pos.x + (dx / d) * 40, z: w.pos.z + (dz / d) * 40 };
      w.panic = 2;
    }
  }
}

function punch() {
  if (screen !== 'play' || driver.inCar) return;
  sound.punch();
  let target = null;
  let targetKind = null;
  let bestD = 2.4;
  const consider = (obj, kind) => {
    const d = Math.hypot(obj.pos.x - playerPos.x, obj.pos.z - playerPos.z);
    if (d > bestD) return;
    const ang = Math.atan2(obj.pos.x - playerPos.x, obj.pos.z - playerPos.z);
    let diff = Math.abs(ang - playerHeading);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff < 1.3) {
      bestD = d;
      target = obj;
      targetKind = kind;
    }
  };
  for (const w of crowd.walkers) if (w.alive && w.down <= 0) consider(w, 'walker');
  for (const c of crowd.cops) if (c.alive) consider(c, 'cop');
  if (!target) return;
  if (targetKind === 'walker') {
    crowd.knockDown(target, 4);
    addWanted(1, 'Assault on a pedestrian.');
    overlay.toast('You decked a pedestrian!', 2);
  } else {
    target.hp -= 20;
    if (target.hp <= 0) {
      crowd.removeCop(target);
      state.kills += 1;
      addWanted(2, 'Officer down.');
    } else {
      overlay.toast('You hit a cop!', 2);
    }
  }
}

// --- Per-step simulation ------------------------------------------------------
function stepPlay(dt) {
  simTime += dt;
  state.playSeconds += dt;
  state.clockMinutes += dt * 0.5;
  if (state.clockMinutes >= 24 * 60) state.clockMinutes -= 24 * 60;

  const move = controls.move();
  const look = controls.takeLook();
  const actions = controls.takeActions();

  // Camera orbit / zoom.
  cameraRig.yaw -= look.dx * 0.005;
  cameraRig.pitch = Math.max(0.08, Math.min(1.1, cameraRig.pitch + look.dy * 0.003));
  cameraRig.dist = Math.max(6, Math.min(20, cameraRig.dist + look.zoom * 0.01));
  if (Math.abs(look.dx) > 0 || Math.abs(look.dy) > 0) cameraRig.followCarUntil = simTime + 2.5;

  if (actions & ACT_MUTE) {
    const muted = sound.setMuted(!sound.isMuted());
    overlay.toast(muted ? 'Sound muted (M to unmute)' : 'Sound on', 2);
  }
  if (actions & ACT_HELP) {
    prevScreen = screen;
    screen = 'help';
    overlay.showScreen('help');
    return;
  }
  if (actions & ACT_PAUSE) {
    screen = 'pause';
    overlay.setPauseStats(`Cash $${state.cash.toLocaleString('en-US')} · Jobs done ${state.missionsDone}/4 · Cars stolen ${state.carsStolen} · Best heat ${'★'.repeat(state.bestWanted) || '—'}`);
    overlay.showScreen('pause');
    sound.engine(0);
    return;
  }

  if (stumble > 0) stumble -= dt;
  const canAct = stumble <= 0;

  if (actions & ACT_ENTER && canAct) {
    if (driver.inCar) {
      driver.exit(playerPos);
      playerMesh.visible = true;
      playerTo(playerPos.x, playerPos.z, playerHeading);
      sound.click();
    } else {
      const nearMara = Math.hypot(playerPos.x - city.landmarks.mara.x, playerPos.z - city.landmarks.mara.z) < 5;
      if (nearMara && !story.active && state.missionIndex < MISSIONS.length) {
        startMission(state.missionIndex);
      } else {
        const candidates = [...traffic.parked, ...traffic.aiCars];
        const car = driver.nearestCar(playerPos, candidates);
        if (car) {
          const wasParked = car.parked;
          car.parked = false;
          driver.enter(car, playerPos);
          playerMesh.visible = false;
          if (!car.stolen) {
            car.stolen = true;
            state.carsStolen += 1;
            addWanted(1, wasParked ? 'Car stolen.' : 'Carjacked in traffic.');
            overlay.toast(wasParked ? 'Car stolen! The owner called it in.' : 'Carjacked! The driver called it in.', 3);
            sound.horn();
          }
          cameraRig.yaw = driver.heading;
        }
      }
    }
  }
  if (actions & ACT_PUNCH && canAct) punch();
  if (actions & ACT_SHOOT && canAct) shoot();

  // Mara prompt when idle near her kiosk.
  if (!story.active && state.missionIndex < MISSIONS.length) {
    const d = Math.hypot(playerPos.x - city.landmarks.mara.x, playerPos.z - city.landmarks.mara.z);
    if (d < 5 && simTime - maraPromptAt > 6) {
      maraPromptAt = simTime;
      overlay.toast(`Mara: "Job ${state.missionIndex + 1} is ready — press E."`, 3.5);
    }
  }

  // --- Movement ---------------------------------------------------------------
  if (driver.inCar) {
    const car = driver.car;
    const events = driver.update(dt, move, crowd.walkers, [...traffic.aiCars, ...traffic.parked, ...traffic.patrols]);
    playerPos.set(car.pos.x, 0, car.pos.z);
    playerHeading = driver.heading;
    if (events.crashed) {
      sound.crash();
      damagePlayer(4);
    }
    for (const w of events.hitPed) {
      crowd.knockDown(w, 6);
      addWanted(1, 'Pedestrian run down.');
      overlay.toast('You ran someone over!', 2.5);
    }
    // Ease the camera behind the car unless the player just dragged it.
    if (simTime > cameraRig.followCarUntil) {
      let diff = driver.heading - cameraRig.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cameraRig.yaw += diff * Math.min(1, dt * 2.2);
    }
    sound.engine(Math.abs(driver.speed) / 26);
  } else {
    const speed = move.run ? RUN_SPEED : WALK_SPEED;
    const fwdX = Math.sin(cameraRig.yaw);
    const fwdZ = Math.cos(cameraRig.yaw);
    const rightX = Math.cos(cameraRig.yaw);
    const rightZ = -Math.sin(cameraRig.yaw);
    let mx = fwdX * move.forward + rightX * move.strafe;
    let mz = fwdZ * move.forward + rightZ * move.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0.01 && canAct) {
      mx /= len;
      mz /= len;
      playerPos.x += mx * speed * dt;
      playerPos.z += mz * speed * dt;
      playerHeading = Math.atan2(mx, mz);
      walkPhase += dt * speed * 1.7;
      const swing = Math.sin(walkPhase) * 0.5;
      const u = playerMesh.userData;
      u.armL.rotation.x = swing;
      u.armR.rotation.x = -swing;
      u.legL.rotation.x = -swing;
      u.legR.rotation.x = swing;
    } else {
      const u = playerMesh.userData;
      u.armL.rotation.x *= 0.8;
      u.armR.rotation.x *= 0.8;
      u.legL.rotation.x *= 0.8;
      u.legR.rotation.x *= 0.8;
    }
    resolveCollisions(playerPos, 0.6, city.colliders);
    // Soft push out of cars.
    for (const c of [...traffic.parked, ...traffic.aiCars, ...traffic.patrols]) {
      const dx = playerPos.x - c.pos.x;
      const dz = playerPos.z - c.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.3 && d > 0.001) {
        playerPos.x = c.pos.x + (dx / d) * 2.3;
        playerPos.z = c.pos.z + (dz / d) * 2.3;
      }
    }
    clampToCity(playerPos);
    playerMesh.position.copy(playerPos);
    playerMesh.rotation.y = playerHeading;
    sound.engine(0);
  }

  // --- AI ---------------------------------------------------------------------
  const threats = [];
  if (driver.inCar && Math.abs(driver.speed) > 8) threats.push({ x: playerPos.x, z: playerPos.z });
  crowd.update(dt, playerPos, driver.inCar ? Math.abs(driver.speed) : 0, threats);
  traffic.update(dt, playerPos, driver.inCar, [...traffic.aiCars, ...traffic.patrols, ...(driver.car ? [driver.car] : [])]);

  // --- Wanted -----------------------------------------------------------------
  crowd.syncCops(state.wanted, playerPos);
  traffic.syncPatrols(state.wanted, playerPos);
  sound.siren(state.wanted > 0);
  if (state.wanted > 0 && simTime - crimeAt > 15) {
    let nearestCop = Infinity;
    for (const c of crowd.cops) nearestCop = Math.min(nearestCop, Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z));
    for (const p of traffic.patrols) nearestCop = Math.min(nearestCop, Math.hypot(p.pos.x - playerPos.x, p.pos.z - playerPos.z));
    if (nearestCop > 45) {
      decayAcc += dt;
      if (decayAcc >= 10) {
        decayAcc = 0;
        state.wanted -= 1;
        if (state.wanted === 0) overlay.toast('You lost the cops!', 3);
      }
    } else {
      decayAcc = 0;
    }
  }

  // --- Police contact ---------------------------------------------------------
  let touchingCop = false;
  for (const cop of crowd.cops) {
    if (!cop.alive) continue;
    const d = Math.hypot(cop.pos.x - playerPos.x, cop.pos.z - playerPos.z);
    if (d < 1.7 && !driver.inCar) touchingCop = true;
    if (d < 2.1 && !driver.inCar) {
      cop.swing = (cop.swing || 0) - dt;
      if (cop.swing <= 0) {
        cop.swing = 1.1;
        damagePlayer(8);
        sound.thud();
        overlay.toast('A cop is beating you down!', 2);
      }
    }
  }
  if (touchingCop) {
    arrestTimer += dt;
    if (arrestTimer > 1.2) {
      arrestTimer = 0;
      bustPlayer();
      return;
    }
  } else {
    arrestTimer = Math.max(0, arrestTimer - dt * 2);
  }
  ramCooldown -= dt;
  carHitCooldown -= dt;
  if (driver.inCar) {
    for (const p of traffic.patrols) {
      const d = Math.hypot(p.pos.x - playerPos.x, p.pos.z - playerPos.z);
      if (d < 3.6 && ramCooldown <= 0) {
        ramCooldown = 1.2;
        damagePlayer(5);
        sound.crash();
      }
    }
  } else {
    for (const c of [...traffic.aiCars, ...traffic.patrols]) {
      const d = Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z);
      if (d < 2.1 && Math.abs(c.speed) > 4 && carHitCooldown <= 0) {
        carHitCooldown = 1.0;
        stumble = 0.9;
        damagePlayer(15);
        sound.crash();
        overlay.toast('Hit by a car!', 2.5);
        break;
      }
    }
  }

  // Slow health regen while clean.
  if (state.wanted === 0 && simTime - lastDamageAt > 6 && state.health > 0 && state.health < START_HEALTH) {
    state.health = Math.min(START_HEALTH, state.health + 2 * dt);
  }

  // --- Missions ---------------------------------------------------------------
  if (story.active) {
    const result = story.update(dt, {
      pos: playerPos,
      inCar: driver.inCar,
      wanted: state.wanted,
    });
    if (result.note) overlay.toast(result.note, 3);
    if (result.completed) missionComplete(story.active ? story.active.index : state.missionIndex);
    else if (result.failed) missionFailed(result.note);
  }

  // --- Camera, HUD, save -------------------------------------------------------
  updateCamera(dt);
  drawHud();
  saveTimer += dt;
  if (saveTimer > 15) {
    saveTimer = 0;
    saveGame(state);
  }
}

function updateCamera(dt) {
  const focus = driver.inCar
    ? new THREE.Vector3(playerPos.x, 2.0, playerPos.z)
    : new THREE.Vector3(playerPos.x, 2.1, playerPos.z);
  const dist = driver.inCar ? cameraRig.dist + 2 : cameraRig.dist;
  const height = Math.sin(cameraRig.pitch) * dist;
  const flat = Math.cos(cameraRig.pitch) * dist;
  const target = new THREE.Vector3(
    focus.x - Math.sin(cameraRig.yaw) * flat,
    focus.y + height,
    focus.z - Math.cos(cameraRig.yaw) * flat,
  );
  const k = 1 - Math.exp(-12 * dt);
  camera.position.lerp(target, k);
  camera.lookAt(focus);
}

function drawHud() {
  const obj = story.objectiveText();
  overlay.update({
    health: state.health,
    cash: state.cash,
    clockMinutes: state.clockMinutes,
    wanted: state.wanted,
    objectiveTitle: obj.title,
    objectiveText: obj.text,
    timer: story.active ? story.timeLeft : null,
    speedKmh: driver.inCar ? Math.abs(driver.speed) * 3.6 : 0,
    inCar: driver.inCar,
  });
  overlay.drawMinimap({
    player: { x: playerPos.x, z: playerPos.z, heading: playerHeading },
    cars: [
      ...traffic.aiCars.map((c) => ({ x: c.pos.x, z: c.pos.z, police: false })),
      ...traffic.parked.map((c) => ({ x: c.pos.x, z: c.pos.z, police: false })),
      ...traffic.patrols.map((c) => ({ x: c.pos.x, z: c.pos.z, police: true })),
    ],
    cops: crowd.cops.filter((c) => c.alive).map((c) => ({ x: c.pos.x, z: c.pos.z })),
    peds: crowd.walkers.filter((w) => w.alive && w.down <= 0).map((w) => ({ x: w.pos.x, z: w.pos.z })),
    target: story.target(),
  });
}

// --- Title idle ----------------------------------------------------------------
function stepTitle(dt) {
  simTime += dt;
  cameraRig.yaw += dt * 0.045;
  const yaw = cameraRig.yaw;
  camera.position.set(Math.sin(yaw) * 150, 78, 20 + Math.cos(yaw) * 150);
  camera.lookAt(0, 4, 20);
  crowd.update(dt, playerPos, 0, []);
  traffic.update(dt, playerPos, false, [...traffic.aiCars, ...traffic.patrols]);
  city.update(simTime);
  for (const c of clouds) {
    c.mesh.position.x += c.speed * dt;
    if (c.mesh.position.x > 340) c.mesh.position.x = -340;
  }
}

// --- Buttons -------------------------------------------------------------------
overlay.on('btn-start', 'click', () => {
  sound.unlock();
  sound.click();
  sound.startMusic();
  startFresh();
  screen = 'play';
  overlay.showScreen(null);
  overlay.showHud();
  startMission(0);
  overlay.announce('Playing Solmar City. First job: steal a car for Mara.');
});
overlay.on('btn-continue', 'click', () => {
  sound.unlock();
  sound.click();
  sound.startMusic();
  const saved = loadGame();
  if (saved) {
    state = saved;
    playerTo(0, 26, Math.PI);
    playerMesh.visible = true;
    story.abandon();
    story.showMaraBeacon();
  } else {
    startFresh();
  }
  screen = 'play';
  overlay.showScreen(null);
  overlay.showHud();
  overlay.toast(state.missionIndex < MISSIONS.length ? `Welcome back. Job ${state.missionIndex + 1} waits at Mara's kiosk.` : 'Welcome back — the city is yours.', 4);
});
overlay.on('btn-resume', 'click', () => {
  sound.click();
  screen = 'play';
  overlay.showScreen(null);
});
overlay.on('btn-restart', 'click', () => {
  sound.click();
  startFresh();
  screen = 'play';
  overlay.showScreen(null);
  overlay.showHud();
  startMission(0);
});
overlay.on('btn-quit', 'click', () => {
  sound.click();
  saveGame(state);
  sound.engine(0);
  sound.siren(false);
  screen = 'title';
  overlay.hideHud();
  overlay.showScreen('title');
  const saved = loadGame();
  if (saved) overlay.setContinueLabel(saved.cash);
});
overlay.on('btn-busted', 'click', () => {
  sound.click();
  screen = 'play';
  overlay.showScreen(null);
  overlay.toast('Back on the streets. Stay clean — or don\'t.', 3);
});
overlay.on('btn-wasted', 'click', () => {
  sound.click();
  screen = 'play';
  overlay.showScreen(null);
  overlay.toast('Patched up and back on the streets.', 3);
});
overlay.on('btn-help-close', 'click', () => {
  sound.click();
  screen = prevScreen === 'pause' ? 'pause' : 'play';
  overlay.showScreen(screen === 'pause' ? 'pause' : null);
});

// --- Main loop -------------------------------------------------------------------
let accumulator = 0;
let last = performance.now();
let paintedFrames = 0;
let shotReady = false;
let shadowsOn = true;
let lastFrameAt = performance.now();
const frameTimes = [];

function step(dt) {
  city.update(simTime);
  for (const c of clouds) {
    c.mesh.position.x += c.speed * dt;
    if (c.mesh.position.x > 340) c.mesh.position.x = -340;
  }
  tracer.update(dt);
  story.animate(simTime);
  if (screen === 'title') stepTitle(dt);
  else if (screen === 'play') stepPlay(dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  while (accumulator >= STEP) {
    step(STEP);
    accumulator -= STEP;
  }
  renderer.render(scene, camera);
  paintedFrames += 1;
  frameTimes.push(now - lastFrameAt);
  lastFrameAt = now;
  // Adaptive quality: on a machine that cannot hold ~10 fps with shadows (software
  // rendering, weak GPUs), drop the shadow pass entirely rather than stutter.
  if (paintedFrames === 90 && shadowsOn) {
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    if (avg > 100) {
      shadowsOn = false;
      sun.castShadow = false;
      renderer.shadowMap.enabled = false;
      scene.traverse((obj) => { if (obj.material) obj.material.needsUpdate = true; });
    }
  }
  if (shotName && !shotReady && paintedFrames > 15) {
    shotReady = true;
    window.__shotReady = true;
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play') {
    screen = 'pause';
    overlay.setPauseStats('Paused — the city waits.');
    overlay.showScreen('pause');
    sound.engine(0);
  }
});

// --- Startup -------------------------------------------------------------------
const gameHandle = {
  get state() {
    return state;
  },
  playerPos,
  driver,
  story,
  traffic,
  crowd,
  overlay,
  camera: cameraRig,
  hideScreens() {
    overlay.showScreen(null);
    overlay.showHud();
  },
  startFresh,
  playerTo,
  warpIntoCar,
  setWanted,
  spawnChasePair,
  startMission,
};
window.__solmar = gameHandle;

const existing = loadGame();
if (existing) overlay.setContinueLabel(existing.cash);

if (shotName) {
  screen = 'play';
  stageShot(shotName, gameHandle);
  if (shotName === 'start') screen = 'title';
} else {
  overlay.showScreen('title');
}
overlay.announce('Solmar City. Press Start to play.');
requestAnimationFrame(frame);
