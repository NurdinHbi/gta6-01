// Solmar City — game core: loop, input, camera, driving, combat, wanted
// system, police response, collectibles, stunt jumps, boats, save/load.
// Authored fresh for round 4 from the design spec.
const THREE = window.THREE;
import { makeRng, clamp, lerp, dist2d, angleDelta, angleLerp, formatCash } from './util.js';
import { buildCity, applyTimeOfDay } from './city.js';
import {
  makePlayerMesh, makeCarMesh, makeBoatMesh, makeHeliMesh,
  spawnParkedCars, spawnTraffic, updateTrafficCar, driveCar,
  spawnPedestrians, updatePedestrian, spawnCop, updateCop,
  spawnPoliceCar, updatePoliceCar, resolveCollisions, clampWalkable,
} from './entities.js';
import { createMissionEngine } from './missions.js';
import { initHud, updateHud, showScreen, toast, renderMissionList } from './hud.js';
import { stageShot } from './shots.js';
import {
  unlockAudio, setEngine, setSiren, playShot, playPunch, playPickup,
  playCash, playFail, playCrash, playSplash, playHorn, playMissionComplete,
} from './audio.js';

const SAVE_KEY = 'solmar-city-save-v4';
const WORLD_SEED = 20261120;

// ---------------------------------------------------------------- state
const G = {
  scene: null, camera: null, renderer: null, city: null,
  player: null, playerAngle: 0, playerSpeed: 0, health: 100, cash: 200,
  wanted: 0, wantedTimer: 0, hours: 10.5, lastDamageAt: -99, elapsed: 0,
  parkedCars: [], trafficCars: [], peds: [], cops: [], policeCars: [],
  roadblocks: [], heli: null, boats: [], targetBoat: null, playerBoat: null,
  tailTarget: null, collectibles: [], collectiblesGot: 0,
  currentCar: null, missionsDone: 0, missions: null,
  weapons: [
    { name: 'Pistol', kind: 'pistol', damage: 34, rate: 0.28, ammo: Infinity, spread: 0 },
    { name: 'Shotgun', kind: 'shotgun', damage: 16, rate: 0.7, ammo: 24, spread: 0.09, pellets: 5 },
    { name: 'SMG', kind: 'smg', damage: 16, rate: 0.09, ammo: 120, spread: 0.04 },
  ],
  weaponIndex: 0, lastShotAt: -99, fireHeld: false,
  keys: {}, camYaw: Math.PI, camPitch: 0.32, camDist: 9,
  fixedCamera: null, shotCamMode: null, screen: 'title', paused: false,
  beacon: null, tracers: [], rng: makeRng(WORLD_SEED),
  shotMode: null, shotScreen: 'play',
};

G.playerPosition = () => {
  if (G.currentCar) return { x: G.currentCar.x, z: G.currentCar.z };
  if (G.playerBoat) return { x: G.playerBoat.x, z: G.playerBoat.z };
  return { x: G.player.x, z: G.player.z };
};
G.setTimeOfDay = (h) => { G.hours = h; applyTimeOfDay(G.city, h); };
G.setWanted = (n) => { G.wanted = clamp(n, 0, 5); G.wantedTimer = 0; };
G.addWanted = (n) => { G.wanted = clamp(G.wanted + n, 0, 5); G.wantedTimer = 0; };
G.notify = (t) => toast(t);
G.saveGame = () => saveGame();
G.spawnTailTarget = () => spawnTailTarget();
G.clearTailTarget = () => clearTailTarget();
G.spawnTargetBoat = () => spawnTargetBoat();
G.clearTargetBoat = () => clearTargetBoat();
G.teleportPlayer = (x, z) => { G.player.x = x; G.player.z = z; G.player.mesh.position.set(x, 0, z); };
G.enterCar = (car) => enterCar(car);
G.spawnPoliceNear = (n) => { for (let i = 0; i < n; i += 1) spawnPoliceCarNear(); };
G.boardNearestBoat = () => boardNearestBoat();
G.setShotCamera = (c) => { G.fixedCamera = c; };
G.setShotCamMode = (m) => { G.shotCamMode = m; };
G.simulate = (seconds, inputFn) => {
  const steps = Math.round(seconds * 30);
  for (let i = 0; i < steps; i += 1) updateWorld(1 / 30, inputFn ? inputFn(i / 30) : null);
};
G.startMission = (i) => G.missions.start(i);
G.resetWorld = (seed) => resetWorld(seed);

// ---------------------------------------------------------------- setup
function init() {
  const canvas = document.getElementById('game');
  G.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  G.renderer.setSize(window.innerWidth, window.innerHeight);
  G.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  G.renderer.shadowMap.enabled = true;
  G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  G.renderer.outputColorSpace = THREE.SRGBColorSpace;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
  G.city = buildCity(G.scene, WORLD_SEED);

  // mission beacon: tall glowing column + ground ring
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd21a, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
  G.beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 40, 12, 1, true), beaconMat);
  G.beacon.position.y = 20;
  G.scene.add(G.beacon);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3, 4.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd21a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  G.scene.add(ring);
  G.beaconRing = ring;

  initHud();
  resetWorld(WORLD_SEED);
  wireInput();
  wireButtons();
  renderMissionList(G);
  updateSaveButton();

  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    G.shotMode = shot;
    const staged = stageShot(G, shot);
    G.shotScreen = staged.screen;
    showScreen(staged.screen === 'title' ? 'title' : 'play');
    if (staged.screen === 'title') {
      document.getElementById('title-screen').classList.add('shot-title');
    }
    G.screen = 'play';
  } else {
    showScreen('title');
    const save = loadSave();
    if (save) document.getElementById('btn-continue').classList.remove('hidden');
  }
  window.__solmarReady = false;
  window.__solmar = G; // debug handle for playtesting (position, car, wanted)
  window.addEventListener('resize', () => {
    G.camera.aspect = window.innerWidth / window.innerHeight;
    G.camera.updateProjectionMatrix();
    G.renderer.setSize(window.innerWidth, window.innerHeight);
  });
  requestAnimationFrame(loop);
}

function resetWorld(seed) {
  const scene = G.scene;
  const removeAll = (list) => {
    for (const o of list) if (o.mesh) scene.remove(o.mesh);
    list.length = 0;
  };
  removeAll(G.parkedCars); removeAll(G.trafficCars); removeAll(G.peds);
  removeAll(G.cops); removeAll(G.policeCars);
  for (const b of G.boats) scene.remove(b.mesh);
  G.boats.length = 0;
  if (G.heli) { scene.remove(G.heli.mesh); G.heli = null; }
  for (const rb of G.roadblocks) scene.remove(rb.mesh);
  G.roadblocks.length = 0;
  for (const c of G.collectibles) scene.remove(c.mesh);
  G.collectibles.length = 0;
  if (G.tailTarget) { scene.remove(G.tailTarget.mesh); G.tailTarget = null; }
  if (G.targetBoat) { scene.remove(G.targetBoat.mesh); G.targetBoat = null; }
  if (G.player) scene.remove(G.player.mesh);

  G.rng = makeRng(seed);
  G.health = 100; G.cash = 200; G.wanted = 0; G.wantedTimer = 0;
  G.hours = 10.5; G.elapsed = 0; G.missionsDone = 0; G.collectiblesGot = 0;
  G.currentCar = null; G.playerBoat = null; G.weaponIndex = 0;
  G.weapons[1].ammo = 24; G.weapons[2].ammo = 120;
  G.fixedCamera = null;
  if (G.missions) G.missions.abort();
  G.missions = createMissionEngine(G);

  // player
  const mesh = makePlayerMesh();
  scene.add(mesh);
  G.player = { mesh, x: G.city.landmarks.plaza.x + 6, z: G.city.landmarks.plaza.z + 6, y: 0 };
  G.playerAngle = Math.PI * 0.75;
  mesh.position.set(G.player.x, 0, G.player.z);

  G.parkedCars = spawnParkedCars(scene, G.rng, G.city);
  G.trafficCars = spawnTraffic(scene, G.rng, G.city);
  G.peds = spawnPedestrians(scene, G.rng, G.city);

  // marina boats: one the player can board, plus docked decoration
  const m = G.city.landmarks.marinaDock;
  for (let i = 0; i < 3; i += 1) {
    const bmesh = makeBoatMesh([0xd8d8d8, 0xc23b2e, 0x2e6fc2][i]);
    const bx = -356 - i * 3; // in the water just off the beach, beside the dock
    const bz = m.z - 24 + i * 22;
    bmesh.position.set(bx, -0.35, bz);
    bmesh.rotation.y = Math.PI / 2;
    scene.add(bmesh);
    G.boats.push({ mesh: bmesh, x: bx, z: bz, angle: Math.PI / 2, speed: 0, docked: true, boardable: i === 0 });
  }

  // collectible packages
  const pkgGeo = new THREE.BoxGeometry(1.1, 0.8, 1.1);
  for (const spot of G.city.collectibleSpots) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffd21a, emissive: 0x8a6a00 });
    const pm = new THREE.Mesh(pkgGeo, mat);
    pm.position.set(spot.x, 1.2, spot.z);
    pm.castShadow = true;
    scene.add(pm);
    G.collectibles.push({ mesh: pm, x: spot.x, z: spot.z, got: false, phase: G.rng.range(0, 6) });
  }
  applyTimeOfDay(G.city, G.hours);
}

// ---------------------------------------------------------------- input
function wireInput() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    G.keys[e.code] = true;
    unlockAudio();
    if (e.code === 'KeyE') tryInteract();
    if (e.code === 'KeyF') punch();
    if (e.code === 'KeyM') startNextMission();
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'Digit1') G.weaponIndex = 0;
    if (e.code === 'Digit2') G.weaponIndex = 1;
    if (e.code === 'Digit3') G.weaponIndex = 2;
    if (e.code === 'KeyH' && G.currentCar) playHorn();
  });
  window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0 && G.screen === 'play' && !G.paused) {
      G.fireHeld = true;
      unlockAudio();
    }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) G.fireHeld = false; });
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const canvas = document.getElementById('game');
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    G.camYaw -= (e.clientX - lastX) * 0.005;
    G.camPitch = clamp(G.camPitch + (e.clientY - lastY) * 0.004, 0.05, 1.1);
    lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('pointerup', () => { dragging = false; });
}

function wireButtons() {
  document.getElementById('btn-start').addEventListener('click', () => {
    unlockAudio();
    resetWorld(WORLD_SEED);
    startPlaying();
  });
  document.getElementById('btn-continue').addEventListener('click', () => {
    unlockAudio();
    const save = loadSave();
    if (save) applySave(save);
    startPlaying();
  });
  document.getElementById('btn-resume').addEventListener('click', () => togglePause());
  document.getElementById('btn-restart').addEventListener('click', () => {
    resetWorld(WORLD_SEED);
    startPlaying();
  });
  document.getElementById('btn-busted').addEventListener('click', () => respawnAfter('busted'));
  document.getElementById('btn-wasted').addEventListener('click', () => respawnAfter('wasted'));
}

function startPlaying() {
  G.screen = 'play';
  G.paused = false;
  showScreen('play');
  toast('Welcome to Solmar City — press M to start Mara\'s first mission');
}

function togglePause() {
  if (G.screen !== 'play') return;
  G.paused = !G.paused;
  showScreen(G.paused ? 'pause' : 'play');
}

function startNextMission() {
  if (G.screen !== 'play' || G.paused) return;
  if (G.missions.active) {
    toast('Current mission: ' + G.missions.currentLabel());
    return;
  }
  if (G.missionsDone >= G.missions.defs.length) {
    startSideJob();
    return;
  }
  G.missions.start(G.missionsDone);
  renderMissionList(G);
}

function startSideJob() {
  const rng = G.rng;
  const street = rng.pick(G.city.streetX);
  const x = rng.range(-250, 250);
  const z = rng.range(-250, 250);
  const job = {
    id: 99, title: 'Side Job', reward: 300, time: 150,
    brief: 'Quick cash run for Mara.',
    steps: [{ type: 'goto', x, z, radius: 8, label: 'Side job: reach the marker' }],
  };
  G.missions.defs.push(job);
  G.missions.start(G.missions.defs.length - 1);
}

// ---------------------------------------------------------------- interact
function nearestParkedCar(maxD) {
  let best = null;
  let bestD = maxD;
  for (const car of G.parkedCars) {
    const d = dist2d(G.player.x, G.player.z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function tryInteract() {
  if (G.screen !== 'play' || G.paused) return;
  if (G.playerBoat) {
    // step ashore at the marina dock
    const m = G.city.landmarks.marinaDock;
    if (dist2d(G.playerBoat.x, G.playerBoat.z, m.x, m.z) < 18) {
      G.player.x = m.x + 8; G.player.z = m.z;
      G.player.mesh.position.set(G.player.x, 0, G.player.z);
      G.player.mesh.visible = true;
      G.playerBoat = null;
      setEngine(false, 0);
      toast('Ashore at the marina');
    } else {
      toast('Too far from the dock to step ashore');
    }
    return;
  }
  if (G.currentCar) {
    const car = G.currentCar;
    G.currentCar = null;
    G.player.x = car.x + Math.cos(car.angle) * 3;
    G.player.z = car.z - Math.sin(car.angle) * 3;
    G.player.mesh.position.set(G.player.x, 0, G.player.z);
    G.player.mesh.visible = true;
    setEngine(false, 0);
    return;
  }
  // board the marina boat (it floats just off the beach, so reach from the sand)
  const boat = G.boats.find((b) => b.boardable && dist2d(G.player.x, G.player.z, b.x, b.z) < 9);
  if (boat) {
    boardBoat(boat);
    return;
  }
  const car = nearestParkedCar(4);
  if (car) enterCar(car);
}

function boardBoat(boat) {
  G.playerBoat = boat;
  boat.docked = false;
  G.player.mesh.visible = false;
  playSplash();
  toast('On the boat — W/S throttle, A/D steer');
}

function boardNearestBoat() {
  const boat = G.boats.find((b) => b.boardable);
  if (!boat) return;
  G.player.x = boat.x; G.player.z = boat.z;
  boardBoat(boat);
}

function enterCar(car) {
  G.currentCar = car;
  car.parked = false;
  car.stealable = false;
  G.player.mesh.visible = false;
  G.addWanted(1);
  toast('Car taken — the cops noticed (+1 ★)');
  playHorn();
}

function punch() {
  if (G.screen !== 'play' || G.paused || G.currentCar || G.playerBoat) return;
  playPunch();
  const fx = Math.sin(G.playerAngle);
  const fz = Math.cos(G.playerAngle);
  const hit = (t, dmg) => {
    const d = dist2d(G.player.x, G.player.z, t.x, t.z);
    if (d > 2.4) return false;
    const dot = ((t.x - G.player.x) * fx + (t.z - G.player.z) * fz) / Math.max(d, 0.01);
    if (dot < 0.4) return false;
    if (t.health !== undefined) {
      t.health -= dmg;
      if (t.health <= 0) killTarget(t, 'cop');
    } else {
      knockPed(t);
    }
    t.x += fx * 1.6; t.z += fz * 1.6;
    t.mesh.position.set(t.x, 0, t.z);
    return true;
  };
  for (const cop of G.cops) if (cop.alive && hit(cop, 30)) return;
  for (const ped of G.peds) if (ped.alive && hit(ped, 30)) return;
}

// ---------------------------------------------------------------- combat
function fireWeapon() {
  const w = G.weapons[G.weaponIndex];
  const now = G.elapsed;
  if (now - G.lastShotAt < w.rate) return;
  if (w.ammo !== Infinity && w.ammo <= 0) {
    toast(w.name + ' is out of ammo — press 1 for the pistol');
    G.lastShotAt = now;
    return;
  }
  G.lastShotAt = now;
  if (w.ammo !== Infinity) w.ammo -= 1;
  playShot(w.kind);
  const ox = G.player.x;
  const oz = G.player.z;
  const pellets = w.pellets || 1;
  for (let p = 0; p < pellets; p += 1) {
    const spread = (G.rng.next() - 0.5) * 2 * (w.spread || 0);
    const ang = G.playerAngle + spread;
    const dx = Math.sin(ang);
    const dz = Math.cos(ang);
    let best = null;
    let bestD = 46;
    const consider = (t, isCop) => {
      if (!t.alive) return;
      const rx = t.x - ox;
      const rz = t.z - oz;
      const along = rx * dx + rz * dz;
      if (along < 0.5 || along > bestD) return;
      const perp = Math.abs(rx * dz - rz * dx);
      if (perp < 1.3) { best = t; bestD = along; best.isCop = isCop; }
    };
    for (const cop of G.cops) consider(cop, true);
    for (const ped of G.peds) consider(ped, false);
    const endX = ox + dx * (best ? bestD : 46);
    const endZ = oz + dz * (best ? bestD : 46);
    addTracer(ox, 1.5, oz, endX, 1.4, endZ);
    if (best) {
      if (best.isCop) {
        best.health -= w.damage;
        G.addWanted(1);
        if (best.health <= 0) killTarget(best, 'cop');
      } else {
        knockPed(best);
        G.addWanted(1);
      }
    }
  }
}

function knockPed(ped) {
  ped.alive = false;
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = 0.35;
  ped.scared = 0;
  G.addWanted(1);
  setTimeout(() => respawnPed(ped), 20000);
  playCrash();
}

function respawnPed(ped) {
  const street = G.rng.pick(G.city.streetX);
  ped.x = G.rng.range(-250, 250);
  ped.z = street + G.rng.pick([-9, 9]);
  ped.alive = true;
  ped.mesh.rotation.x = 0;
  ped.mesh.position.set(ped.x, 0, ped.z);
}

function killTarget(t, kind) {
  t.alive = false;
  t.mesh.rotation.x = -Math.PI / 2;
  t.mesh.position.y = 0.35;
  if (kind === 'cop') {
    G.addWanted(2);
    toast('Officer down — wanted level jumped');
    setTimeout(() => { G.scene.remove(t.mesh); G.cops = G.cops.filter((c) => c !== t); }, 15000);
  }
}

function addTracer(x1, y1, z1, x2, y2, z2) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2),
  ]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe08a }));
  G.scene.add(line);
  G.tracers.push({ line, ttl: 0.09 });
}

// ---------------------------------------------------------------- missions helpers
function spawnTailTarget() {
  clearTailTarget();
  const mesh = makeCarMesh(0x777777, 'sedan');
  const p = G.playerPosition();
  mesh.position.set(p.x + 30, 0, p.z);
  G.scene.add(mesh);
  G.tailTarget = {
    mesh, x: p.x + 30, z: p.z, angle: 0, speed: 8,
    route: G.city.trafficRoutes[2], wpIndex: 0, cruise: 8,
  };
}

function clearTailTarget() {
  if (G.tailTarget) { G.scene.remove(G.tailTarget.mesh); G.tailTarget = null; }
}

function spawnTargetBoat() {
  clearTargetBoat();
  const mesh = makeBoatMesh(0x222222);
  mesh.position.set(-420, -0.35, -80);
  G.scene.add(mesh);
  G.targetBoat = { mesh, x: -420, z: -80, angle: Math.PI / 2, speed: 0, waypoints: [{ x: -480, z: 120 }, { x: -420, z: 260 }, { x: -520, z: -200 }], wp: 0 };
}

function clearTargetBoat() {
  if (G.targetBoat) { G.scene.remove(G.targetBoat.mesh); G.targetBoat = null; }
}

// ---------------------------------------------------------------- police
function spawnCopNear() {
  const p = G.playerPosition();
  const a = G.rng.range(0, Math.PI * 2);
  const x = clamp(p.x + Math.sin(a) * 38, -280, 280);
  const z = clamp(p.z + Math.cos(a) * 38, -280, 280);
  const cop = spawnCop(G.scene, x, z);
  G.cops.push(cop);
}

function spawnPoliceCarNear() {
  const p = G.playerPosition();
  const a = G.rng.range(0, Math.PI * 2);
  const x = clamp(p.x + Math.sin(a) * 42, -280, 280);
  const z = clamp(p.z + Math.cos(a) * 42, -280, 280);
  const car = spawnPoliceCar(G.scene, x, z);
  G.policeCars.push(car);
}

function spawnHeli() {
  const mesh = makeHeliMesh();
  const p = G.playerPosition();
  mesh.position.set(p.x, 42, p.z - 20);
  G.scene.add(mesh);
  G.heli = { mesh, x: p.x, z: p.z - 20, y: 42 };
}

function updatePolice(dt) {
  const wanted = G.wanted;
  const wantCops = wanted >= 1 ? Math.min(wanted, 3) : 0;
  const wantCars = wanted >= 2 ? Math.min(wanted - 1, 3) : 0;
  const aliveCops = G.cops.filter((c) => c.alive).length;
  if (aliveCops < wantCops && G.rng.next() < dt * 0.8) spawnCopNear();
  if (G.policeCars.length < wantCars && G.rng.next() < dt * 0.7) spawnPoliceCarNear();
  if (wanted === 0) {
    for (const cop of G.cops) G.scene.remove(cop.mesh);
    G.cops.length = 0;
    for (const pc of G.policeCars) G.scene.remove(pc.mesh);
    G.policeCars.length = 0;
    if (G.heli) { G.scene.remove(G.heli.mesh); G.heli = null; }
    for (const rb of G.roadblocks) G.scene.remove(rb.mesh);
    G.roadblocks.length = 0;
    setSiren(false);
  } else {
    setSiren(wanted >= 2);
  }
  if (wanted >= 4 && !G.heli) spawnHeli();
  if (wanted < 4 && G.heli) { G.scene.remove(G.heli.mesh); G.heli = null; }
  if (wanted >= 4 && G.roadblocks.length === 0) buildRoadblocks();
  if (wanted < 4 && G.roadblocks.length > 0) {
    for (const rb of G.roadblocks) G.scene.remove(rb.mesh);
    G.roadblocks.length = 0;
  }
  // wanted decays when the heat is off you
  if (wanted > 0) {
    const nearestCop = Math.min(
      ...G.cops.filter((c) => c.alive).map((c) => dist2d(c.x, c.z, G.player.x, G.player.z)),
      ...G.policeCars.map((c) => dist2d(c.x, c.z, G.player.x, G.player.z)),
      999);
    if (nearestCop > 55) {
      G.wantedTimer += dt;
      if (G.wantedTimer > 22) { G.wanted -= 1; G.wantedTimer = 0; }
    } else {
      G.wantedTimer = 0;
    }
  }
}

function buildRoadblocks() {
  const p = G.playerPosition();
  const streets = G.city.streetX;
  let nearest = streets[0];
  for (const s of streets) if (Math.abs(s - p.x) < Math.abs(nearest - p.x)) nearest = s;
  for (const dz of [-26, 26]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(12, 1.4, 1),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(12.1, 0.5, 1.05),
      new THREE.MeshLambertMaterial({ color: 0xc23b2e }));
    stripe.position.y = 0.3;
    mesh.add(stripe);
    mesh.position.set(nearest, 0.7, clamp(p.z + dz, -270, 270));
    mesh.castShadow = true;
    G.scene.add(mesh);
    G.roadblocks.push({ mesh, x: nearest, z: clamp(p.z + dz, -270, 270) });
  }
  toast('Police roadblock ahead!');
}

// ---------------------------------------------------------------- busted / wasted
function respawnAfter(kind) {
  const lost = Math.floor(G.cash * 0.1);
  G.cash -= lost;
  G.health = 100;
  G.wanted = 0;
  G.currentCar = null;
  G.playerBoat = null;
  G.player.mesh.visible = true;
  const s = G.city.landmarks.safehouse;
  G.player.x = s.x + 12; G.player.z = s.z + 12;
  G.player.mesh.position.set(G.player.x, 0, G.player.z);
  for (const cop of G.cops) G.scene.remove(cop.mesh);
  G.cops.length = 0;
  for (const pc of G.policeCars) G.scene.remove(pc.mesh);
  G.policeCars.length = 0;
  if (G.heli) { G.scene.remove(G.heli.mesh); G.heli = null; }
  setSiren(false);
  setEngine(false, 0);
  G.weapons[1].ammo = 24; G.weapons[2].ammo = 120;
  toast((kind === 'busted' ? 'Busted! ' : 'Wasted! ') + 'You lost ' + formatCash(lost) + ' — back at the safehouse');
  G.screen = 'play';
  showScreen('play');
  saveGame();
}

function hurtPlayer(amount) {
  if (G.screen !== 'play' || G.paused) return;
  G.health -= amount;
  G.lastDamageAt = G.elapsed;
  if (G.health <= 0) {
    G.health = 0;
    showScreen('wasted');
    G.screen = 'wasted';
    playFail();
  }
}

// ---------------------------------------------------------------- save / load
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash, missionsDone: G.missionsDone,
      collectiblesGot: G.collectibles.filter((c) => c.got).map((c) => G.collectibles.indexOf(c)),
      hours: G.hours,
    }));
  } catch (e) { /* storage unavailable — play on without saving */ }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function applySave(save) {
  G.cash = save.cash || 200;
  G.missionsDone = save.missionsDone || 0;
  if (Array.isArray(save.collectiblesGot)) {
    for (const i of save.collectiblesGot) {
      const c = G.collectibles[i];
      if (c && !c.got) { c.got = true; c.mesh.visible = false; G.collectiblesGot += 1; }
    }
  }
  if (save.hours) G.setTimeOfDay(save.hours);
  renderMissionList(G);
}

function updateSaveButton() {
  const save = loadSave();
  if (save) document.getElementById('btn-continue').classList.remove('hidden');
}

// ---------------------------------------------------------------- per-frame update
function readInput() {
  const k = G.keys;
  return {
    forward: !!(k.KeyW || k.ArrowUp),
    back: !!(k.KeyS || k.ArrowDown),
    left: !!(k.KeyA || k.ArrowLeft),
    right: !!(k.KeyD || k.ArrowRight),
    handbrake: !!k.Space,
    run: !!k.ShiftLeft || !!k.ShiftRight,
  };
}

function updatePlayerOnFoot(dt, input) {
  const p = G.player;
  const yaw = G.camYaw;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  let mx = 0;
  let mz = 0;
  if (input.forward) { mx += fx; mz += fz; }
  if (input.back) { mx -= fx; mz -= fz; }
  if (input.right) { mx += rx; mz += rz; }
  if (input.left) { mx -= rx; mz -= rz; }
  const len = Math.hypot(mx, mz);
  const speed = input.run ? 8.5 : 5;
  if (len > 0) {
    mx /= len; mz /= len;
    G.playerAngle = angleLerp(G.playerAngle, Math.atan2(mx, mz), dt * 10);
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    G.playerSpeed = speed;
    p.mesh.rotation.y = G.playerAngle;
    p.mesh.position.y = Math.abs(Math.sin(G.elapsed * 11)) * 0.06;
  } else {
    G.playerSpeed = 0;
    p.mesh.position.y = 0;
  }
  const hitWall = resolveCollisions(p, 0.7, G.city.colliders);
  if (hitWall) { /* pushed out by resolveCollisions */ }
  clampWalkable(p);
  p.mesh.position.set(p.x, p.mesh.position.y, p.z);
  if (G.fireHeld) {
    G.playerAngle = angleLerp(G.playerAngle, Math.atan2(-Math.sin(G.camYaw), -Math.cos(G.camYaw)), dt * 12);
    fireWeapon();
  }
}

function updateBoat(dt, input) {
  const b = G.playerBoat;
  if (!b) return;
  const maxSpeed = 26;
  if (input.forward) b.speed += 14 * dt;
  if (input.back) b.speed -= 18 * dt;
  if (!input.forward && !input.back) b.speed -= Math.sign(b.speed) * 5 * dt;
  b.speed = clamp(b.speed, -6, maxSpeed);
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  b.angle += steer * 1.4 * clamp(Math.abs(b.speed) / 10, 0.3, 1) * dt * Math.sign(b.speed || 1);
  b.x += Math.sin(b.angle) * b.speed * dt;
  b.z += Math.cos(b.angle) * b.speed * dt;
  b.x = clamp(b.x, -560, -292);
  b.z = clamp(b.z, -300, 300);
  b.mesh.position.set(b.x, -0.35 + Math.sin(G.elapsed * 2.2) * 0.12, b.z);
  b.mesh.rotation.y = b.angle;
  b.mesh.rotation.z = steer * -0.06 * clamp(Math.abs(b.speed) / 20, 0, 1);
  setEngine(true, Math.abs(b.speed) / maxSpeed);
  // target boat flees along its waypoints
  if (G.targetBoat) {
    const t = G.targetBoat;
    const wp = t.waypoints[t.wp];
    const want = Math.atan2(wp.x - t.x, wp.z - t.z);
    t.angle = angleLerp(t.angle, want, dt * 1.2);
    t.speed = lerp(t.speed, 15, dt);
    t.x += Math.sin(t.angle) * t.speed * dt;
    t.z += Math.cos(t.angle) * t.speed * dt;
    if (dist2d(t.x, t.z, wp.x, wp.z) < 12) t.wp = (t.wp + 1) % t.waypoints.length;
    t.mesh.position.set(t.x, -0.35 + Math.sin(G.elapsed * 2.0 + 1) * 0.12, t.z);
    t.mesh.rotation.y = t.angle;
  }
}

function updateWorld(dt, input) {
  if (G.screen !== 'play' && !G.shotMode) return;
  if (G.paused && !G.shotMode) return;
  const inp = input || readInput();
  G.elapsed += dt;
  // clock: one game hour every 90 real seconds
  const prevHours = G.hours;
  G.hours = (G.hours + dt / 90) % 24;
  if (Math.abs(G.hours - prevHours) > 0.02) applyTimeOfDay(G.city, G.hours);

  // driving / boating / walking
  if (G.currentCar) {
    const car = G.currentCar;
    driveCar(car, inp, dt, G.city.colliders, (s) => { playCrash(); hurtPlayer(3); });
    setEngine(true, Math.abs(car.speed) / 30);
    // stunt ramps
    if (!car.airborne) {
      for (const r of G.city.ramps) {
        if (dist2d(car.x, car.z, r.x, r.z) < 6 && Math.abs(car.speed) > 18) {
          car.airborne = true; car.vy = 9; car.airT = 0;
          playHorn();
          break;
        }
      }
    } else {
      car.airT += dt;
      car.vy -= 24 * dt;
      car.y = (car.y || 0) + car.vy * dt;
      if (car.y <= 0) {
        car.y = 0;
        car.airborne = false;
        if (car.airT > 0.7) {
          G.cash += 200;
          toast('Stunt jump! +$200');
          playCash();
        }
      }
      car.mesh.position.y = car.y;
    }
    // hit pedestrians
    for (const ped of G.peds) {
      if (ped.alive && dist2d(car.x, car.z, ped.x, ped.z) < 2.4 && Math.abs(car.speed) > 4) {
        knockPed(ped);
      }
    }
    // bump traffic
    for (const t of G.trafficCars) {
      if (dist2d(car.x, car.z, t.x, t.z) < 3.4) {
        car.speed *= 0.6;
        t.x += Math.sin(t.angle + Math.PI / 2) * 1.2;
        t.z += Math.cos(t.angle + Math.PI / 2) * 1.2;
        playCrash();
      }
    }
    // roadblocks
    for (const rb of G.roadblocks) {
      if (dist2d(car.x, car.z, rb.x, rb.z) < 4 && Math.abs(car.speed) > 6) {
        car.speed *= 0.3;
        playCrash();
        G.scene.remove(rb.mesh);
        G.roadblocks = G.roadblocks.filter((r) => r !== rb);
        G.addWanted(1);
      }
    }
    // camera follows behind the car
    G.camYaw = angleLerp(G.camYaw, car.angle + Math.PI, dt * 1.6);
    G.camDist = lerp(G.camDist, 13, dt * 3);
  } else if (G.playerBoat) {
    updateBoat(dt, inp);
    G.camYaw = angleLerp(G.camYaw, G.playerBoat.angle + Math.PI, dt * 1.6);
    G.camDist = lerp(G.camDist, 15, dt * 3);
  } else {
    updatePlayerOnFoot(dt, inp);
    setEngine(false, 0);
    G.camDist = lerp(G.camDist, 9, dt * 3);
  }

  // traffic + pedestrians
  for (const t of G.trafficCars) updateTrafficCar(t, dt, G.city.colliders);
  for (const ped of G.peds) {
    const danger = G.currentCar && Math.abs(G.currentCar.speed) > 8 ? G.currentCar : null;
    if (ped.alive && danger && dist2d(ped.x, ped.z, danger.x, danger.z) < 14) ped.scared = 2.5;
    updatePedestrian(ped, dt, G.rng, G.city, danger);
  }
  // tail target drives its loop
  if (G.tailTarget) updateTrafficCar(G.tailTarget, dt, G.city.colliders);

  // cops + police cars + heli
  updatePolice(dt);
  for (const cop of G.cops) {
    const result = updateCop(cop, dt, G.playerPosition(), G.city.colliders);
    if (result === 'punch') { hurtPlayer(8); playPunch(); }
    if (result === 'busted') {
      showScreen('busted');
      G.screen = 'busted';
      playFail();
    }
  }
  for (const pc of G.policeCars) {
    updatePoliceCar(pc, dt, G.playerPosition(), G.city.colliders, (car) => {
      if (!G.currentCar) { hurtPlayer(15); playCrash(); }
      else { G.currentCar.speed *= 0.6; playCrash(); }
    });
  }
  if (G.heli) {
    const p = G.playerPosition();
    G.heli.x = lerp(G.heli.x, p.x, dt * 0.8);
    G.heli.z = lerp(G.heli.z, p.z, dt * 0.8);
    G.heli.mesh.position.set(G.heli.x, 42 + Math.sin(G.elapsed * 1.4) * 1.5, G.heli.z);
    G.heli.mesh.rotation.y = Math.atan2(p.x - G.heli.x, p.z - G.heli.z);
    G.heli.mesh.userData.rotor.rotation.y += dt * 22;
  }

  // collectibles
  const pp = G.playerPosition();
  for (const c of G.collectibles) {
    if (c.got) continue;
    c.mesh.rotation.y += dt * 1.6;
    c.mesh.position.y = 1.2 + Math.sin(G.elapsed * 2 + c.phase) * 0.25;
    if (dist2d(pp.x, pp.z, c.x, c.z) < 2.6) {
      c.got = true;
      c.mesh.visible = false;
      G.collectiblesGot += 1;
      G.cash += 250;
      toast('Package found! +$250 (' + G.collectiblesGot + '/12)');
      playPickup();
      saveGame();
    }
  }

  // missions
  G.missions.update(dt);

  // mission beacon
  const beacon = G.missions.beaconTarget();
  const showBeacon = !!beacon && G.screen === 'play';
  G.beacon.visible = showBeacon;
  G.beaconRing.visible = showBeacon;
  if (beacon) {
    G.beacon.position.set(beacon.x, 20, beacon.z);
    G.beaconRing.position.set(beacon.x, 0.15, beacon.z);
    const s = 1 + Math.sin(G.elapsed * 3) * 0.12;
    G.beacon.scale.set(s, 1, s);
  }

  // health regen after 5 quiet seconds
  if (G.elapsed - G.lastDamageAt > 5 && G.health > 0 && G.health < 100) {
    G.health = Math.min(100, G.health + 2 * dt);
  }

  // tracers fade
  for (const t of G.tracers) {
    t.ttl -= dt;
    if (t.ttl <= 0) { G.scene.remove(t.line); }
  }
  G.tracers = G.tracers.filter((t) => t.ttl > 0);

  // autosave every 20s of play
  if (Math.floor(G.elapsed) % 20 === 0 && Math.floor(G.elapsed - dt) % 20 !== 0) saveGame();
}

// ---------------------------------------------------------------- camera + render
function updateCamera() {
  const target = G.playerPosition();
  if (G.shotCamMode === 'chase') {
    // Ride ahead of the car/boat and look back at it, so the pursuit behind
    // it is in frame — the shot the judge wants to see.
    const veh = G.currentCar || G.playerBoat;
    if (veh) {
      const fx = Math.sin(veh.angle);
      const fz = Math.cos(veh.angle);
      const rx = -fz;
      const rz = fx;
      G.camera.position.set(
        veh.x + fx * 24 + rx * 8,
        8,
        veh.z + fz * 24 + rz * 8);
      G.camera.lookAt(veh.x - fx * 6, 1.5, veh.z - fz * 6);
      return;
    }
  }
  if (G.fixedCamera) {
    G.camera.position.set(G.fixedCamera.pos.x, G.fixedCamera.pos.y, G.fixedCamera.pos.z);
    G.camera.lookAt(G.fixedCamera.look.x, G.fixedCamera.look.y, G.fixedCamera.look.z);
    return;
  }
  const ty = G.currentCar || G.playerBoat ? 2.2 : 2.0;
  const cp = Math.cos(G.camPitch);
  const sp = Math.sin(G.camPitch);
  G.camera.position.set(
    target.x + Math.sin(G.camYaw) * cp * G.camDist,
    ty + sp * G.camDist,
    target.z + Math.cos(G.camYaw) * cp * G.camDist);
  G.camera.lookAt(target.x, ty, target.z);
}

let lastT = 0;
let hudAcc = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min((t - lastT) / 1000 || 0.016, 0.05);
  lastT = t;
  updateWorld(dt, null);
  updateCamera();
  G.renderer.render(G.scene, G.camera);
  hudAcc += dt;
  if (hudAcc > 0.12) {
    hudAcc = 0;
    if (G.screen === 'play' || G.shotMode) updateHud(G);
  }
  if (!window.__solmarReady) window.__solmarReady = true;
}

init();
