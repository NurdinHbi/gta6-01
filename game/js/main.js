// Solmar City — main game: state, loop, input, camera, combat, wanted system,
// police spawning, save/load, and the ?shot= staging used for screenshots.
const SAVE_KEY = 'solmar-city-save-v1';

const G = {
  state: 'title',
  scene: null, camera: null, renderer: null, city: null, beacon: null,
  player: null, parkedCars: [], trafficCars: [], peds: [], footCops: [], policeCars: [],
  missionCar: null,
  wanted: 0, cash: 200, gameMinutes: 480,
  missionIndex: 0, mission: null,
  keys: {}, camYaw: Math.PI, camPitch: 0.34, camDist: 7, freeLookT: 0,
  lastCrimeT: -999, crimeCd: {}, quietT: 0, copSpawnT: 0, policeSpawnT: 0,
  lastDamageT: -999, regenT: 0, shotMode: null, shotSeed: 1,
  tracer: null, tracerT: 0, clockT: 0, saveT: 0, rng: Math.random,
};
window.__game = G;
window.__shotReady = false;

G.toast = (msg, ms) => Hud.toast(msg, ms);
G.setWanted = (n) => { G.wanted = clamp(n, 0, 5); G.lastCrimeT = performance.now() / 1000; };
G.save = () => saveGame();

function addWanted(n, type, cooldown) {
  const now = performance.now() / 1000;
  if (cooldown && G.crimeCd[type] && now - G.crimeCd[type] < cooldown) return;
  G.crimeCd[type] = now;
  G.wanted = clamp(G.wanted + n, 0, 5);
  G.lastCrimeT = now;
  G.quietT = 0;
}

// ---------------- setup ----------------
function initThree() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('app').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5d6);
  scene.fog = new THREE.Fog(0x87b5d6, 130, 460);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x3a4a3a, 0.95));
  const sun = new THREE.DirectionalLight(0xfff2d8, 0.95);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  G.renderer = renderer; G.scene = scene; G.camera = camera;
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function buildWorld() {
  G.city = buildCity(G.scene);
  G.beacon = createBeacon(G.scene);
  const rng = mulberry32(42);
  // Player mesh.
  const pm = makePlayerMesh();
  G.scene.add(pm.group);
  G.player = {
    mesh: pm, x: CITY.SPAWN.x, z: CITY.SPAWN.z, heading: CITY.SPAWN.heading,
    health: 100, weapon: 'pistol', inCar: false, car: null,
    walkPhase: 0, lastStep: 0, punchT: 0, shootCd: 0, speed: 0,
  };
  // 12 stealable parked cars: the starter car by the spawn, then 11 roadside.
  G.missionCar = makeCar(G.scene, 0.5, 131, Math.PI, 0xe8c33a, { parked: true });
  G.parkedCars.push(G.missionCar);
  for (let i = 0; i < 11; i++) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const road = CITY.ROAD_CENTERS[Math.floor(rng() * CITY.ROAD_CENTERS.length)];
    const along = -140 + rng() * 280;
    const side = rng() < 0.5 ? 5.6 : -5.6;
    const color = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
    let x, z, heading;
    if (axis === 'x') { x = along; z = road + side; heading = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2; }
    else { x = road + side; z = along; heading = rng() < 0.5 ? 0 : Math.PI; }
    if (dist2(x, z, CITY.SPAWN.x, CITY.SPAWN.z) < 12) { i--; continue; }
    const c = makeCar(G.scene, x, z, heading, color, { parked: true });
    G.parkedCars.push(c);
  }
  G.trafficCars = spawnTraffic(G.scene, mulberry32(99), 10);
  G.peds = spawnPeds(G.scene, mulberry32(7), 24, G.city.colliders);
  G.rng = Math.random;
}

// ---------------- save / load ----------------
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.cash, missionIndex: G.missionIndex,
      x: G.player.x, z: G.player.z, heading: G.player.heading, health: G.player.health,
    }));
  } catch (e) {}
}
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

// ---------------- screens / flow ----------------
function showOnly(id) {
  for (const s of ['screen-title', 'screen-pause', 'screen-busted', 'screen-wasted']) {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  }
  if (!id) for (const s of ['screen-title', 'screen-pause', 'screen-busted', 'screen-wasted']) {
    document.getElementById(s).classList.add('hidden');
  }
}

function startGame(fromSave) {
  const save = fromSave ? loadSave() : null;
  if (save) {
    G.cash = save.cash; G.missionIndex = save.missionIndex;
    G.player.x = save.x; G.player.z = save.z; G.player.heading = save.heading;
    G.player.health = save.health || 100;
    G.toast('Welcome back to Solmar City.');
  } else {
    G.cash = 200; G.missionIndex = 0;
    G.player.x = CITY.SPAWN.x; G.player.z = CITY.SPAWN.z; G.player.heading = CITY.SPAWN.heading;
    G.player.health = 100;
    clearSave();
  }
  G.wanted = 0; G.gameMinutes = 480;
  G.mission = { idx: -1, stage: 0, timer: 0, dwell: 0, active: false };
  hideBeacon(G.beacon); hideMarker(G.beacon);
  G.camYaw = G.player.heading; G.camPitch = 0.34;
  showOnly(null);
  Hud.show();
  G.state = 'playing';
  AudioSys.init();
  AudioSys.engineStart();
}

function endRun(kind) {
  // Busted or wasted: lose 10% cash, lose the mission, wake up at the hospital.
  const lost = Math.floor(G.cash * 0.1);
  G.cash -= lost;
  if (G.mission && G.mission.active) {
    G.mission = { idx: -1, stage: 0, timer: 0, dwell: 0, active: false };
    hideBeacon(G.beacon); hideMarker(G.beacon);
  }
  AudioSys.sirenStop();
  AudioSys.engineSet(0, false);
  if (kind === 'busted') {
    document.getElementById('busted-text').textContent = 'The Solmar PD caught up with you. You lost ' + fmtMoney(lost) + '.';
    showOnly('screen-busted');
    AudioSys.busted();
  } else {
    document.getElementById('wasted-text').textContent = 'Solmar City chewed you up. You lost ' + fmtMoney(lost) + '.';
    showOnly('screen-wasted');
    AudioSys.fail();
  }
  G.state = kind;
}

function respawn() {
  // Clear all police, wake at the hospital with full health, no heat.
  for (const c of G.footCops) G.scene.remove(c.mesh.group);
  for (const c of G.policeCars) G.scene.remove(c.mesh.group);
  G.footCops = []; G.policeCars = [];
  G.wanted = 0; G.quietT = 0;
  const P = G.player;
  if (P.inCar) { P.inCar = false; P.car = null; P.mesh.group.visible = true; }
  P.x = CITY.HOSPITAL.x; P.z = CITY.HOSPITAL.z + 14; P.heading = 0; P.health = 100;
  P.mesh.group.position.set(P.x, 0, P.z);
  G.camYaw = P.heading;
  showOnly(null);
  G.state = 'playing';
  G.toast('You wake up at Solmar General. Stay out of trouble... or don\'t.');
  saveGame();
}

// ---------------- car enter / exit ----------------
function nearestParkedCar(maxD) {
  let best = null, bd = maxD;
  for (const c of G.parkedCars) {
    const d = dist2(G.player.x, G.player.z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function enterCar(car) {
  const P = G.player;
  const firstSteal = !car.stolen;
  car.stolen = true;
  car.parked = false;
  P.inCar = true; P.car = car;
  P.mesh.group.visible = false;
  P.x = car.x; P.z = car.z; P.heading = car.heading;
  G.camDist = 10;
  AudioSys.engineStart();
  if (firstSteal) { addWanted(1, 'steal', 0); G.toast('You stole a car! The law is watching.'); }
  refreshMissionBeacon(G);
}

function exitCar() {
  const P = G.player;
  const car = P.car;
  const rx = -Math.cos(car.heading), rz = Math.sin(car.heading); // right side of the car
  P.x = clamp(car.x + rx * 2.4, -160, 160);
  P.z = clamp(car.z + rz * 2.4, -160, 244);
  P.heading = car.heading;
  P.inCar = false; P.car = null;
  P.mesh.group.visible = true;
  P.mesh.group.position.set(P.x, 0, P.z);
  G.camDist = 7;
  AudioSys.engineSet(0, false);
}

// ---------------- combat ----------------
function shotDirection() {
  const P = G.player;
  const dx = P.x - G.camera.position.x, dz = P.z - G.camera.position.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

function fireTracer(from, to) {
  if (G.tracer) { G.scene.remove(G.tracer); G.tracer.geometry.dispose(); }
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(from.x, 1.4, from.z),
    new THREE.Vector3(to.x, 1.2, to.z),
  ]);
  G.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe066 }));
  G.scene.add(G.tracer);
  G.tracerT = 0.09;
}

function shoot() {
  const P = G.player;
  if (P.shootCd > 0) return;
  P.shootCd = 0.28;
  AudioSys.shot();
  addWanted(1, 'shot', 4);
  const dir = shotDirection();
  let best = null, bestD = 45, bestKind = null;
  const consider = (x, z, kind, obj) => {
    const dx = x - P.x, dz = z - P.z;
    const d = Math.hypot(dx, dz);
    if (d > 45 || d < 0.5) return;
    const dot = (dx * dir.x + dz * dir.z) / d;
    if (dot < 0.93) return;
    if (d < bestD) { bestD = d; best = obj; bestKind = kind; }
  };
  for (const p of G.peds) if (p.state !== 'down') consider(p.x, p.z, 'ped', p);
  for (const c of G.footCops) consider(c.x, c.z, 'cop', c);
  const end = { x: P.x + dir.x * 40, z: P.z + dir.z * 40 };
  if (best) {
    fireTracer(P, { x: best.x, z: best.z });
    if (bestKind === 'ped') {
      best.health -= 50;
      if (best.health <= 0) {
        best.state = 'down'; best.downT = 14;
        addWanted(1, 'killped', 0);
        G.toast('You took someone down. The city saw it.');
      }
    } else {
      best.health = (best.health || 100) - 34;
      if (best.health <= 0) {
        G.scene.remove(best.mesh.group);
        G.footCops = G.footCops.filter((c) => c !== best);
        addWanted(2, 'killcop', 0);
        G.toast('You killed a cop. Every unit in Solmar is coming.');
      }
    }
  } else fireTracer(P, end);
}

function punch() {
  const P = G.player;
  P.punchT = 0.28;
  AudioSys.punch();
  const fx = Math.sin(P.heading), fz = Math.cos(P.heading);
  const hit = (x, z) => {
    const dx = x - P.x, dz = z - P.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.3) return false;
    return (dx * fx + dz * fz) / d > 0.2;
  };
  for (const p of G.peds) {
    if (p.state !== 'down' && hit(p.x, p.z)) {
      p.health -= 25;
      p.x += fx * 1.2; p.z += fz * 1.2;
      addWanted(1, 'punch', 3);
      if (p.health <= 0) { p.state = 'down'; p.downT = 14; addWanted(1, 'killped', 0); }
      return;
    }
  }
  for (const c of G.footCops) {
    if (hit(c.x, c.z)) {
      c.health = (c.health || 100) - 25;
      c.x += fx * 1.2; c.z += fz * 1.2;
      addWanted(1, 'punch', 3);
      if (c.health <= 0) {
        G.scene.remove(c.mesh.group);
        G.footCops = G.footCops.filter((x) => x !== c);
        addWanted(2, 'killcop', 0);
      }
      return;
    }
  }
}

function tryAttack() {
  if (G.state !== 'playing') return;
  const P = G.player;
  if (P.inCar) { AudioSys.horn(); return; }
  if (P.weapon === 'pistol') shoot();
  else punch();
}

// ---------------- police management ----------------
function nearestCopDist() {
  let bd = 1e9;
  for (const c of G.footCops) bd = Math.min(bd, dist2(c.x, c.z, G.player.x, G.player.z));
  for (const c of G.policeCars) bd = Math.min(bd, dist2(c.x, c.z, G.player.x, G.player.z));
  return bd;
}

function spawnPointOnRoad(distMin, distMax) {
  const P = G.player;
  for (let tries = 0; tries < 10; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = distMin + Math.random() * (distMax - distMin);
    let x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d;
    if (Math.random() < 0.5) x = nearestRoad(x); else z = nearestRoad(z);
    x = clamp(x, -150, 150); z = clamp(z, -150, 148);
    if (!pointInColliders(x, z, G.city.colliders)) return { x, z };
  }
  return { x: clamp(P.x + 35, -150, 150), z: clamp(P.z, -150, 148) };
}

function managePolice(dt) {
  const P = G.player;
  const now = performance.now() / 1000;
  // Wanted decay: quiet + out of sight -> stars fall off.
  if (G.wanted > 0 && now - G.lastCrimeT > 15 && nearestCopDist() > 30) {
    G.quietT += dt;
    if (G.quietT >= 8) { G.quietT = 0; G.wanted--; if (G.wanted === 0) G.toast('You lost the heat.'); }
  } else G.quietT = 0;

  const wantCops = G.wanted >= 1 ? Math.min(1 + G.wanted, 5) : 0;
  G.copSpawnT -= dt;
  if (G.footCops.length < wantCops && G.copSpawnT <= 0) {
    const pt = spawnPointOnRoad(30, 45);
    G.footCops.push(spawnFootCop(G.scene, pt.x, pt.z));
    G.copSpawnT = 2;
  }
  if (G.wanted === 0) {
    for (const c of G.footCops) G.scene.remove(c.mesh.group);
    G.footCops = [];
  }
  const wantCars = G.wanted >= 2 ? Math.min(G.wanted - 1, 3) : 0;
  G.policeSpawnT -= dt;
  if (G.policeCars.length < wantCars && G.policeSpawnT <= 0) {
    const pt = spawnPointOnRoad(35, 50);
    const h = Math.atan2(P.x - pt.x, P.z - pt.z);
    G.policeCars.push(spawnPoliceCar(G.scene, pt.x, pt.z, h));
    G.policeSpawnT = 3;
  }
  if (G.wanted < 2) {
    for (const c of G.policeCars) G.scene.remove(c.mesh.group);
    G.policeCars = [];
  }
  if (G.policeCars.length > 0) AudioSys.sirenStart(); else AudioSys.sirenStop();
}

// ---------------- per-frame updates ----------------
function updatePlayerFoot(dt) {
  const P = G.player;
  const k = G.keys;
  const ix = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
  const iz = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
  const run = !!k.ShiftLeft || !!k.ShiftRight;
  const fx = Math.sin(G.camYaw), fz = Math.cos(G.camYaw);
  const rx = -Math.cos(G.camYaw), rz = Math.sin(G.camYaw);
  let mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
  const ml = Math.hypot(mx, mz);
  if (ml > 0.01) {
    mx /= ml; mz /= ml;
    const sp = run ? 8.5 : 5;
    P.speed = sp;
    const targetHeading = Math.atan2(mx, mz);
    P.heading = angLerp(P.heading, targetHeading, dt * 10);
    const pos = { x: P.x + mx * sp * dt, z: P.z + mz * sp * dt };
    collideWorld(pos, 0.45, G.city.colliders);
    // Don't walk through cars.
    for (const c of [...G.parkedCars, ...G.trafficCars, ...G.policeCars]) {
      const d = dist2(pos.x, pos.z, c.x, c.z);
      if (d < 1.9) {
        const push = 1.9 - d;
        const nx = (pos.x - c.x) / (d || 1), nz = (pos.z - c.z) / (d || 1);
        pos.x += nx * push; pos.z += nz * push;
      }
    }
    P.x = clamp(pos.x, -160, 160);
    P.z = clamp(pos.z, -160, 244);
    P.walkPhase += dt * (run ? 13 : 9);
    const stepIdx = Math.floor(P.walkPhase / Math.PI);
    if (stepIdx !== P.lastStep) { P.lastStep = stepIdx; AudioSys.step(); }
  } else P.speed = 0;
  // Walk / punch animation.
  const sw = Math.sin(P.walkPhase) * (P.speed > 0 ? 0.55 : 0);
  P.mesh.legL.rotation.x = sw; P.mesh.legR.rotation.x = -sw;
  P.mesh.armL.rotation.x = -sw * 0.7;
  if (P.punchT > 0) {
    P.punchT -= dt;
    P.mesh.armR.rotation.x = -1.9 * Math.sin((0.28 - P.punchT) / 0.28 * Math.PI);
  } else if (P.weapon === 'pistol') P.mesh.armR.rotation.x = -1.25;
  else P.mesh.armR.rotation.x = sw * 0.7;
  P.mesh.gun.visible = P.weapon === 'pistol';
  P.mesh.group.position.set(P.x, 0, P.z);
  P.mesh.group.rotation.y = P.heading;
  P.shootCd = Math.max(0, P.shootCd - dt);
}

function updatePlayerCar(dt) {
  const P = G.player;
  const car = P.car;
  const k = G.keys;
  const input = {
    fwd: !!k.KeyW || !!k.ArrowUp,
    back: !!k.KeyS || !!k.ArrowDown,
    left: !!k.KeyA || !!k.ArrowLeft,
    right: !!k.KeyD || !!k.ArrowRight,
    brake: !!k.Space,
  };
  const res = drivePlayerCar(car, input, dt, G.city.colliders);
  P.x = car.x; P.z = car.z; P.heading = car.heading;
  P.speed = Math.abs(car.speed);
  if (res.crashed) {
    AudioSys.crash();
    P.health -= 8;
    G.lastDamageT = performance.now() / 1000;
  }
  // Running over pedestrians.
  for (const p of G.peds) {
    if (p.state === 'down') continue;
    if (dist2(car.x, car.z, p.x, p.z) < 2.1 && Math.abs(car.speed) > 3) {
      p.health = 0; p.state = 'down'; p.downT = 14;
      addWanted(1, 'hitped', 2);
      car.speed *= 0.65;
      AudioSys.punch();
      G.toast('You hit a pedestrian!');
    }
  }
  AudioSys.engineSet(Math.abs(car.speed) * 3.6, true);
  // Police cars ram the player car.
  for (const pc of G.policeCars) {
    pc.ramCooldown -= dt;
    if (pc.ramCooldown <= 0 && dist2(pc.x, pc.z, car.x, car.z) < 3.4) {
      pc.ramCooldown = 1.2;
      car.speed *= 0.55;
      P.health -= 4;
      G.lastDamageT = performance.now() / 1000;
      AudioSys.crash();
    }
  }
  // Police car hitting the player on foot is handled in updatePoliceCars via proximity damage below.
}

function updateCamera(dt) {
  const P = G.player;
  const target = { x: P.x, z: P.z };
  G.freeLookT -= dt;
  // Auto-follow: swing the camera behind the direction of travel.
  if (G.freeLookT <= 0 && P.speed > 0.5) {
    const want = P.heading;
    G.camYaw = angLerp(G.camYaw, want, dt * (P.inCar ? 1.6 : 2.4));
  }
  const dist = G.camDist;
  const cx = target.x - Math.sin(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cz = target.z - Math.cos(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cy = 1.6 + Math.sin(G.camPitch) * dist;
  G.camera.position.set(cx, cy, cz);
  G.camera.lookAt(target.x + Math.sin(G.camYaw) * 2.5, 1.6, target.z + Math.cos(G.camYaw) * 2.5);
}

function updateHealth(dt) {
  const P = G.player;
  const now = performance.now() / 1000;
  if (G.wanted === 0 && P.health < 100 && now - G.lastDamageT > 10) {
    P.health = Math.min(100, P.health + 2.5 * dt);
  }
  if (P.health <= 0 && G.state === 'playing') endRun('wasted');
}

// ---------------- shot staging ----------------
function stageShot(name, seed) {
  const rng = mulberry32(seed * 7919 + 13);
  const P = G.player;
  Hud.show();
  showOnly(null);
  G.state = 'playing';
  if (name === 'chase') {
    const car = makeCar(G.scene, -5, 100, Math.PI, 0xc0392b, { parked: false });
    car.stolen = true;
    G.parkedCars.push(car);
    P.inCar = true; P.car = car; P.mesh.group.visible = false;
    P.x = car.x; P.z = car.z; P.heading = car.heading; car.speed = 15;
    G.camYaw = Math.PI; G.camDist = 12;
    G.setWanted(2);
    // Pursuers converge on the player from up the road, in frame ahead of
    // the chase camera, already at speed so they keep up with the player's
    // car instead of falling behind (and under) the camera.
    const pc1 = spawnPoliceCar(G.scene, -9.5, 88, Math.PI);
    pc1.speed = 18;
    const pc2 = spawnPoliceCar(G.scene, 2.5, 90, Math.PI);
    pc2.speed = 18;
    G.policeCars.push(pc1, pc2);
    G.trafficCars[0].ai.pos = 70; G.trafficCars[0].ai.lane = -5 + 2.2;
  } else if (name === 'drive') {
    const car = makeCar(G.scene, -5, 60, Math.PI, 0x2e6fb0, { parked: false });
    car.stolen = true;
    G.parkedCars.push(car);
    P.inCar = true; P.car = car; P.mesh.group.visible = false;
    P.x = car.x; P.z = car.z; P.heading = car.heading; car.speed = 12;
    G.camYaw = Math.PI; G.camDist = 10;
  } else if (name === 'mission') {
    G.missionIndex = 0;
    startMission(G);
    P.x = -2; P.z = 134; P.heading = Math.PI * 0.85;
    P.mesh.group.position.set(P.x, 0, P.z);
    G.camYaw = Math.PI + 0.55; G.camDist = 8; G.camPitch = 0.3;
  } else { // 'foot' (default)
    P.x = 0; P.z = 168; P.heading = 0;
    P.weapon = 'pistol';
    P.mesh.group.position.set(P.x, 0, P.z);
    G.camYaw = 0; G.camDist = 9.5; G.camPitch = 0.45;
    for (let i = 0; i < 4 && i < G.peds.length; i++) {
      const p = G.peds[i];
      p.x = -6 + i * 4 + rng() * 2; p.z = 172 + rng() * 6;
      p.tx = p.x; p.tz = p.z - 10;
    }
  }
  setTimeout(() => { window.__shotReady = true; }, 900);
}

// ---------------- main loop ----------------
let lastT = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
  lastT = now;
  if (G.state === 'playing') {
    G.gameMinutes += dt * 0.5;
    G.clockT += dt;
    if (G.player.inCar) updatePlayerCar(dt); else updatePlayerFoot(dt);
    updateTraffic(G.trafficCars, dt, G.rng);
    // Pedestrians flee only when the player is actively dangerous: wanted,
    // or a crime in the last few seconds.
    const nowS = performance.now() / 1000;
    const threat = (!G.player.inCar && (G.wanted > 0 || nowS - G.lastCrimeT < 4))
      ? { x: G.player.x, z: G.player.z } : null;
    updatePeds(G.peds, dt, G.rng, G.city.colliders, threat);
    const busted = updateFootCops(G.footCops, dt, G.player, G.wanted, G.city.colliders);
    updatePoliceCars(G.policeCars, dt, G.player, G.city.colliders);
    // Police car touching the player on foot hurts.
    if (!G.player.inCar) {
      for (const pc of G.policeCars) {
        if (dist2(pc.x, pc.z, G.player.x, G.player.z) < 2.0) {
          G.player.health -= 14 * dt * 3;
          G.lastDamageT = performance.now() / 1000;
        }
      }
    }
    managePolice(dt);
    updateMission(G, dt);
    updateBeaconVisual(G.beacon, dt);
    updateHealth(dt);
    if (busted && G.state === 'playing') endRun('busted');
    if (G.tracer) { G.tracerT -= dt; if (G.tracerT <= 0) { G.scene.remove(G.tracer); G.tracer.geometry.dispose(); G.tracer = null; } }
    G.saveT += dt;
    if (G.saveT > 20) { G.saveT = 0; saveGame(); }
    Hud.update(G, dt);
  }
  updateCamera(dt);
  G.renderer.render(G.scene, G.camera);
}

// ---------------- input ----------------
function bindInput() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    G.keys[e.code] = true;
    if (e.code === 'Escape' && (G.state === 'playing' || G.state === 'paused')) {
      if (G.state === 'playing') {
        G.state = 'paused';
        const s = document.getElementById('pause-stats');
        s.innerHTML = 'Cash ' + fmtMoney(G.cash) + ' &nbsp;·&nbsp; Missions ' + G.missionIndex + '/4 &nbsp;·&nbsp; Wanted ' + G.wanted + '★';
        showOnly('screen-pause');
      } else {
        G.state = 'playing';
        showOnly(null);
      }
    }
    if (G.state !== 'playing') return;
    if (e.code === 'KeyE') {
      if (G.player.inCar) exitCar();
      else { const c = nearestParkedCar(6.5); if (c) enterCar(c); }
    }
    if (e.code === 'Digit1') G.player.weapon = 'fists';
    if (e.code === 'Digit2') G.player.weapon = 'pistol';
    if (e.code === 'KeyM' && (!G.mission || !G.mission.active)) startMission(G);
  });
  window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });

  let dragging = false, downX = 0, downY = 0, downT = 0, moved = 0;
  const cv = () => G.renderer.domElement;
  window.addEventListener('mousedown', (e) => {
    if (G.state !== 'playing' || e.target !== cv()) return;
    dragging = true; moved = 0; downX = e.clientX; downY = e.clientY; downT = performance.now();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - downX, dy = e.clientY - downY;
    moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    G.camYaw -= (e.movementX || 0) * 0.005;
    G.camPitch = clamp(G.camPitch + (e.movementY || 0) * 0.004, 0.08, 1.1);
    G.freeLookT = 2.5;
    downX = e.clientX; downY = e.clientY;
  });
  window.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    dragging = false;
    if (moved < 6 && performance.now() - downT < 350) tryAttack();
  });
  window.addEventListener('wheel', (e) => {
    if (G.state !== 'playing') return;
    G.camDist = clamp(G.camDist + Math.sign(e.deltaY) * 1.2, 4.5, 16);
  }, { passive: true });
  window.addEventListener('blur', () => { G.keys = {}; });

  document.getElementById('screen-start').addEventListener('click', () => { AudioSys.init(); startGame(false); });
  document.getElementById('screen-continue').addEventListener('click', () => { AudioSys.init(); startGame(true); });
  document.getElementById('resume-button').addEventListener('click', () => { G.state = 'playing'; showOnly(null); });
  document.getElementById('restart-button').addEventListener('click', () => {
    if (G.missionIndex < MISSIONS.length) { G.mission = { idx: -1, stage: 0, timer: 0, dwell: 0, active: false }; startMission(G); }
    G.state = 'playing'; showOnly(null);
  });
  document.getElementById('quit-button').addEventListener('click', () => {
    saveGame();
    G.state = 'title';
    showOnly('screen-title');
    Hud.hide();
    refreshContinueButton();
  });
  document.getElementById('busted-respawn').addEventListener('click', respawn);
  document.getElementById('wasted-respawn').addEventListener('click', respawn);
}

function refreshContinueButton() {
  const btn = document.getElementById('screen-continue');
  btn.classList.toggle('hidden', !loadSave());
}

// ---------------- boot ----------------
function boot() {
  Hud.init();
  initThree();
  buildWorld();
  bindInput();
  refreshContinueButton();
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (shot) {
    G.shotMode = shot;
    G.shotSeed = parseInt(q.get('seed') || '1', 10) || 1;
    stageShot(shot, G.shotSeed);
  }
  requestAnimationFrame(loop);
}
boot();
