// Solmar City round 7 — the procedural coastal city, vehicles, pedestrians,
// police, helicopter, boats, weather, taxi stands and the safehouse garage.
// All geometry is generated from the seed at boot; nothing is loaded from
// disk or the network. The game object this builds is the API the other
// modules use: state, player, world, step/render, enterCar, setWanted, msg,
// respawn, getSave/applySave, setBeacon and the garage actions.
import * as THREE from 'three';
import {
  CITY, DAY, DAY_LENGTH, PLAYER, WEAPONS, WANTED, TRAFFIC_CARS, PARKED_CARS,
  PEDESTRIANS, BRIEFCASES, STUNT_RAMPS, TAXI_STANDS, TAXI, GARAGE,
  BRIEFCASE_REWARD, STUNT_REWARD, BUSTED_LOSS, PALETTE,
} from './config.js';
import { ACTION_INTERACT, ACTION_SHOOT, ACTION_RELOAD, ACTION_RADIO, ACTION_TAXI, ACTION_GARAGE } from './input.js';
import { RADIO_STATIONS } from './audio.js';

const ROAD_PITCH = CITY.block + CITY.road; // 38
const CITY_MIN = -CITY.half;
const CITY_MAX = CITY.half;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist2(ax, az, bx, bz) { const dx = ax - bx; const dz = az - bz; return dx * dx + dz * dz; }
function lerpColor(a, b, t) {
  const ca = new THREE.Color(a); const cb = new THREE.Color(b);
  return ca.lerp(cb, t);
}

function makeWindowTexture(rng, lit) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#5a5f68'; g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 5; x < 58; x += 11) {
      const on = rng.next() < (lit ? 0.55 : 0.25);
      g.fillStyle = on ? (lit ? '#ffd88a' : '#9fc4e0') : '#2c313a';
      g.fillRect(x, y, 7, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createGame(canvas, rng, audio) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyNoon);
  scene.fog = new THREE.Fog(PALETTE.skyNoon, 120, 520);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(40, 30, 160);

  const sun = new THREE.DirectionalLight(PALETTE.sunNoon, 1.6);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3230, 0.7);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambient);

  const state = {
    cash: PLAYER.startCash,
    health: PLAYER.maxHealth,
    jobsDone: 0,
    briefcasesFound: 0,
    bestStunt: 0,
    timeSec: 17.6 * 3600,
    elapsed: 0,
    wanted: 0,
    driving: false,
    inBoat: false,
    car: null,
    carAngle: 0,
    carSpeed: 0,
    playerY: 0,
    onRoof: false,
    over: null,
    lastLoss: 0,
    rain: 0,
    rainTarget: 0,
    weatherTimer: 45,
    radioStation: 0,
    radioOn: false,
    taxiActive: false,
    taxiFare: 0,
    taxiTimeLeft: 0,
    taxiDest: null,
    taxiPassenger: null,
    taxiEarned: 0,
    taxiJobsDone: 0,
    garageOpen: false,
    garageUpgrades: 0,
    weaponIndex: 0,
    ammo: WEAPONS.map((w) => w.ammo),
    mags: WEAPONS.map((w) => w.mag),
    punchCooldown: 0,
    shootCooldown: 0,
    reloadTimer: 0,
    airborne: false,
    airTime: 0,
    camYaw: Math.PI,
    camPitch: 0.32,
    camDist: 11,
    chaseCam: false,
    messages: [],
    events: [],
    msgTimer: 0,
    seen: false,
    shotFlash: 0,
  };

  const player = { x: PLAYER.startX, z: PLAYER.startZ, angle: Math.PI, mesh: null };

  const world = {
    colliders: [],
    buildings: [],
    parkedCars: [],
    trafficCars: [],
    pedestrians: [],
    briefcases: [],
    ramps: [],
    boats: [],
    taxiPassengers: [],
    roadblocks: [],
    cops: [],
    cruisers: [],
    heli: null,
    beacon: null,
    garageZone: { x: 150, z: -150, r: 12 },
    trafficLights: [],
    smuggler: null,
    playerBoat: null,
    sea: null,
    rainPoints: null,
    neonSigns: [],
    lampMeshes: [],
    roadMat: null,
    windowTex: null,
    glowTex: makeGlowTexture(),
  };

  // ---------- ground, roads, beach, sea ----------
  const groundMat = new THREE.MeshLambertMaterial({ color: PALETTE.ground });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(460, 460), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  scene.add(ground);

  const sandMat = new THREE.MeshLambertMaterial({ color: PALETTE.sand });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(22, 420), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(-187, 0.02, 0);
  scene.add(sand);

  const seaGeo = new THREE.PlaneGeometry(160, 460, 24, 24);
  const seaMat = new THREE.MeshLambertMaterial({ color: PALETTE.sea });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-280, -0.4, 0);
  scene.add(sea);
  world.sea = sea;
  const seaBase = seaGeo.attributes.position.array.slice();

  world.roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  // Roads run on the grid lines between blocks; sidewalks edge them.
  for (let i = 0; i <= CITY.blocks; i += 1) {
    const c = -CITY.half + i * ROAD_PITCH - CITY.road / 2 + 6;
    const roadV = new THREE.Mesh(new THREE.PlaneGeometry(CITY.road, 400), world.roadMat);
    roadV.rotation.x = -Math.PI / 2;
    roadV.position.set(c, 0.01, 0);
    scene.add(roadV);
    const roadH = new THREE.Mesh(new THREE.PlaneGeometry(400, CITY.road), world.roadMat);
    roadH.rotation.x = -Math.PI / 2;
    roadH.position.set(0, 0.01, c);
    scene.add(roadH);
    // Centre dashes.
    for (let d = -180; d < 180; d += 16) {
      const dashMat = new THREE.MeshBasicMaterial({ color: 0xc8b45a });
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(c, 0.03, d);
      scene.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
      dash2.rotation.x = -Math.PI / 2;
      dash2.position.set(d, 0.03, c);
      scene.add(dash2);
    }
  }

  // ---------- buildings ----------
  world.windowTex = makeWindowTexture(rng, true);
  const landmarkCells = new Set(['0,0', '3,1', '6,7', '1,8', '8,2', '5,5', '9,0', '2,5']);
  function addCollider(cx, cz, hw, hd) {
    world.colliders.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd });
  }
  function addBuilding(cx, cz, w, h, d, color, landmark) {
    const mat = new THREE.MeshLambertMaterial({ color, map: world.windowTex, emissive: 0xffc46b, emissiveMap: world.windowTex, emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(cx, h / 2, cz);
    scene.add(mesh);
    addCollider(cx, cz, w / 2, d / 2);
    const b = { x: cx, z: cz, w, h, d, mesh, mat, landmark: landmark || null };
    world.buildings.push(b);
    // Rooftop water tank on taller blocks.
    if (h > 22 && rng.chance(0.6)) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 8), new THREE.MeshLambertMaterial({ color: 0x6b7a80 }));
      tank.position.set(cx + w * 0.25, h + 1.2, cz - d * 0.2);
      scene.add(tank);
    }
    return b;
  }

  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      const key = `${bx},${bz}`;
      if (landmarkCells.has(key)) continue;
      const cx = -CITY.half + CITY.road + bx * ROAD_PITCH + CITY.block / 2 - 6;
      const cz = -CITY.half + CITY.road + bz * ROAD_PITCH + CITY.block / 2 - 6;
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k += 1) {
        const ox = rng.range(-7, 7);
        const oz = rng.range(-7, 7);
        const w = rng.range(7, 12);
        const d = rng.range(7, 12);
        const h = rng.pick([8, 11, 14, 18, 24, 30, 42]);
        addBuilding(cx + ox, cz + oz, w, h, d, rng.pick(PALETTE.building));
      }
    }
  }

  // Landmarks.
  const tower = addBuilding(12, 12, 22, 96, 22, 0x4a5a70, 'tower');
  const casino = addBuilding(-60, 132, 34, 26, 22, 0x7a2d5a, 'casino');
  const bank = addBuilding(60, -24, 20, 16, 16, 0x9c8a6a, 'bank');
  const stadium = addBuilding(-150, -120, 40, 14, 30, 0x5f6e5a, 'stadium');
  const warehouse = addBuilding(60, -150, 24, 12, 18, 0x707a80, 'warehouse');
  const hideout = addBuilding(150, -150, 16, 10, 14, 0x8c6f5a, 'hideout');
  // Marina docks + pier + lighthouse.
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2f });
  for (const [dx, dz, len] of [[-200, -40, 26], [-200, -10, 18], [-196, 62, 34]]) {
    const dock = new THREE.Mesh(new THREE.BoxGeometry(4, 1, len), dockMat);
    dock.position.set(dx, 0.5, dz);
    scene.add(dock);
    addCollider(dx, dz, 2, len / 2);
  }
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xe8e0d0 });
  const lighthouse = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 30, 10), lightMat);
  lighthouse.position.set(-206, 15, 150);
  scene.add(lighthouse);
  addCollider(-206, 150, 4.5, 4.5);
  const lampTop = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  lampTop.position.set(-206, 31, 150);
  scene.add(lampTop);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(6, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  beam.rotation.z = Math.PI / 2;
  beam.position.set(-206, 31, 150);
  scene.add(beam);
  world.lighthouseBeam = beam;

  // Neon signs — casino, tower, and a few downtown fronts. They glow at night.
  function neonSign(x, y, z, w, h, color, face) {
    // A dark backing plate makes the glowing panel read as signage, not a
    // flat block of colour.
    const plate = new THREE.Mesh(new THREE.BoxGeometry(w + 1.6, h + 1.6, 0.3), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    plate.position.set(x, y, z + 0.25);
    if (face === 'north') plate.rotation.y = Math.PI;
    scene.add(plate);
    const mat = new THREE.MeshBasicMaterial({ color });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.6), mat);
    sign.position.set(x, y, z);
    if (face === 'north') sign.rotation.y = Math.PI;
    scene.add(sign);
    world.neonSigns.push({ mesh: sign, mat, base: color });
    return sign;
  }
  neonSign(-60, 22, 120.5, 26, 5, PALETTE.neon[0]);
  neonSign(-60, 16, 120.5, 18, 3, PALETTE.neon[1]);
  neonSign(12, 88, 0.5, 18, 4, PALETTE.neon[2]);
  neonSign(12, 80, 0.5, 12, 3, PALETTE.neon[4]);
  neonSign(60, 14, -15.5, 14, 3, PALETTE.neon[3]);
  neonSign(-150, 12, -104.5, 22, 3, PALETTE.neon[1]);

  // Palm trees along the beachfront and the main avenues.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3a });
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat);
    trunk.position.y = 3.5;
    g.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 4), frondMat);
      const a = (i / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.6, 7.2, Math.sin(a) * 1.6);
      frond.rotation.z = Math.cos(a) * 1.1;
      frond.rotation.x = -Math.sin(a) * 1.1;
      g.add(frond);
    }
    g.position.set(x, 0, z);
    scene.add(g);
  }
  for (let z = -170; z <= 170; z += 28) palm(-178, z + rng.range(-3, 3));
  for (let z = -150; z <= 150; z += 40) { palm(-8, z); palm(30, z + 20); }

  // Street lamps along the avenues.
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let x = -170; x <= 170; x += 38) {
    for (const z of [-170, 170]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 6), lampPoleMat);
      pole.position.set(x, 3, z);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), lampGlowMat.clone());
      bulb.position.set(x, 6.2, z);
      scene.add(bulb);
      world.lampMeshes.push(bulb);
    }
  }

  // Traffic lights at the four central intersections.
  const lightCycle = { period: 24, t: 0 };
  function trafficLight(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5.5, 6), lampPoleMat);
    pole.position.y = 2.75;
    g.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.4, 0.9), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    box.position.y = 5.6;
    g.add(box);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: 0x551111 }));
    red.position.set(0, 6.4, 0.5);
    g.add(red);
    const green = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: 0x115511 }));
    green.position.set(0, 5.0, 0.5);
    g.add(green);
    g.position.set(x, 0, z);
    scene.add(g);
    const tl = { x, z, red, green, nsGreen: true };
    world.trafficLights.push(tl);
    return tl;
  }
  for (const [x, z] of [[-38, -38], [-38, 76], [76, -38], [76, 76], [-152, 38], [38, -152]]) trafficLight(x, z);

  // ---------- vehicles ----------
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  function makeCarMesh(type, colorHex) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
    let len = 4.4; let wid = 2; let h = 0.85; let cabH = 0.7;
    if (type === 'bus') { len = 9; wid = 2.6; h = 2.2; cabH = 0.4; }
    if (type === 'van' || type === 'truck') { len = 5.6; wid = 2.2; h = 1.5; cabH = 0.8; }
    if (type === 'sports') { len = 4.2; wid = 2; h = 0.6; cabH = 0.55; }
    const body = new THREE.Mesh(new THREE.BoxGeometry(wid, h, len), bodyMat);
    body.position.y = 0.55 + h / 2 - 0.4;
    g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.85, cabH, len * 0.45), new THREE.MeshLambertMaterial({ color: 0x1a2028 }));
    cab.position.set(0, body.position.y + h / 2 + cabH / 2 - 0.1, -len * 0.05);
    g.add(cab);
    if (type === 'taxi') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.5), new THREE.MeshBasicMaterial({ color: PALETTE.taxiYellow }));
      sign.position.set(0, body.position.y + h / 2 + cabH + 0.15, 0);
      g.add(sign);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(wid + 0.05, 0.3, len + 0.05), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      stripe.position.y = body.position.y;
      g.add(stripe);
    }
    let lightBar = null;
    if (type === 'police') {
      lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      lightBar.position.set(0, body.position.y + h / 2 + cabH + 0.1, 0);
      g.add(lightBar);
    }
    if (type === 'sports') {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.9, 0.12, 0.5), bodyMat);
      spoiler.position.set(0, body.position.y + 0.75, len / 2 - 0.2);
      g.add(spoiler);
    }
    const wheels = [];
    const wheelPos = type === 'bus'
      ? [[-1.15, 3.2], [1.15, 3.2], [-1.15, -3.2], [1.15, -3.2], [-1.15, 0], [1.15, 0]]
      : [[-wid / 2, len / 2 - 0.8], [wid / 2, len / 2 - 0.8], [-wid / 2, -len / 2 + 0.8], [wid / 2, -len / 2 + 0.8]];
    for (const [wx, wz] of wheelPos) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.42, wz);
      g.add(w);
      wheels.push(w);
    }
    // Headlights.
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
    for (const sx of [-0.7, 0.7]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), headMat);
      hl.position.set(sx, 0.7, -len / 2 - 0.05);
      g.add(hl);
    }
    g.userData = { bodyMat, wheels, type, len, lightBar };
    return g;
  }

  function newCar(type, colorHex, x, z, angle) {
    const mesh = makeCarMesh(type, colorHex);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = angle;
    scene.add(mesh);
    const car = {
      type, color: colorHex, x, z, angle, speed: 0, health: 100,
      mesh, bodyMat: mesh.userData.bodyMat, wrecked: false, stolen: false,
      owned: false, underglow: null, spoilerAdded: false, smoke: null, fire: null,
      route: null, cruiseSpeed: rng.range(8, 13),
    };
    return car;
  }

  // Parked cars along the avenues.
  const parkedTypes = ['sedan', 'sedan', 'taxi', 'van', 'sports', 'sedan', 'truck', 'taxi', 'sedan', 'van', 'sports', 'sedan', 'taxi', 'van'];
  for (let i = 0; i < PARKED_CARS; i += 1) {
    const vertical = i % 2 === 0;
    const roadC = -CITY.half + (1 + Math.floor(i / 2) % 5) * ROAD_PITCH - CITY.road / 2 + 6;
    const along = rng.range(-160, 160);
    const type = parkedTypes[i % parkedTypes.length];
    const color = type === 'taxi' ? PALETTE.taxiYellow : rng.pick(PALETTE.car);
    const car = newCar(type, color, vertical ? roadC + 4 : along, vertical ? along : roadC + 4, vertical ? 0 : Math.PI / 2);
    world.parkedCars.push(car);
  }

  // Traffic cars drive the grid, obeying the lights.
  for (let i = 0; i < TRAFFIC_CARS; i += 1) {
    const type = rng.pick(['sedan', 'sedan', 'sedan', 'taxi', 'bus', 'van', 'truck', 'sports']);
    const color = type === 'taxi' ? PALETTE.taxiYellow : rng.pick(PALETTE.car);
    const vertical = rng.chance(0.5);
    const roadC = -CITY.half + rng.int(1, 9) * ROAD_PITCH - CITY.road / 2 + 6;
    const car = newCar(type, color, vertical ? roadC + 2.5 : rng.range(-170, 170), vertical ? rng.range(-170, 170) : roadC + 2.5, vertical ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2));
    car.route = { vertical, dir: rng.chance(0.5) ? 1 : -1, road: roadC };
    car.speed = car.cruiseSpeed;
    world.trafficCars.push(car);
  }

  // ---------- pedestrians: walkers, beachgoers, pier fishermen, vendors ----------
  const pedShirts = [0xd05050, 0x5080d0, 0x50b060, 0xe0c050, 0x9050c0, 0xe08040, 0x40c0c0, 0xd0d0d0];
  const pedSkins = [0xd8a880, 0xa87650, 0x8a5a38, 0xe8c098];
  function makePedMesh(kind) {
    const g = new THREE.Group();
    const shirt = rng.pick(pedShirts);
    const skin = rng.pick(pedSkins);
    let shirtColor = shirt;
    let scale = 1;
    if (kind === 'beachgoer') { shirtColor = rng.pick([0xff6a8a, 0x3fd0d0, 0xffd23f]); scale = rng.range(0.92, 1.05); }
    if (kind === 'fisherman') { shirtColor = 0x5a6a7a; }
    if (kind === 'vendor') { shirtColor = 0xf0e0c0; }
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.32), new THREE.MeshLambertMaterial({ color: shirtColor }));
    body.position.y = 1.05;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshLambertMaterial({ color: skin }));
    head.position.y = 1.75;
    g.add(head);
    if (kind === 'fisherman') {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.3, 8), new THREE.MeshLambertMaterial({ color: 0x8a7a4a }));
      hat.position.y = 1.95;
      g.add(hat);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 5), new THREE.MeshLambertMaterial({ color: 0x3a2a1a }));
      rod.position.set(0.4, 1.6, -0.5);
      rod.rotation.x = 0.9;
      g.add(rod);
    }
    if (kind === 'beachgoer' && rng.chance(0.5)) {
      const towel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 1.4), new THREE.MeshLambertMaterial({ color: rng.pick([0xff5a7a, 0x3fa0ff, 0xffd23f]) }));
      towel.position.set(0, 0.06, 0);
      g.add(towel);
    }
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), new THREE.MeshLambertMaterial({ color: 0x2a2a34 }));
    legL.position.set(-0.14, 0.3, 0);
    g.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.14;
    g.add(legR);
    g.scale.setScalar(scale);
    g.userData = { legL, legR, kind };
    return g;
  }

  function addPed(kind, x, z) {
    const mesh = makePedMesh(kind);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const ped = { kind, x, z, angle: rng.range(0, Math.PI * 2), speed: kind === 'walker' ? rng.range(1, 2) : 0, tx: x, tz: z, mesh, dead: false, wait: rng.range(0, 4) };
    world.pedestrians.push(ped);
    return ped;
  }
  for (let i = 0; i < PEDESTRIANS; i += 1) {
    const roll = rng.next();
    if (roll < 0.55) {
      addPed('walker', rng.range(-170, 170), rng.range(-170, 170));
    } else if (roll < 0.75) {
      addPed('beachgoer', rng.range(-184, -178), rng.range(-160, 160));
    } else if (roll < 0.85) {
      addPed('fisherman', -196 + rng.range(-1, 1), rng.range(50, 92));
    } else {
      addPed('vendor', rng.pick([-38, 76, -152, 38]), rng.pick([-38, 76, -152, 38]));
    }
  }
  // Vendor stalls: striped canopy + crate counter at the corners.
  for (const ped of world.pedestrians) {
    if (ped.kind !== 'vendor') continue;
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 1.2), new THREE.MeshLambertMaterial({ color: 0x8a5a2a }));
    counter.position.y = 0.5;
    stall.add(counter);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.15, 1.8), new THREE.MeshLambertMaterial({ color: rng.pick([0xff5a5a, 0x3fa0ff, 0xffd23f]) }));
    canopy.position.y = 2.3;
    stall.add(canopy);
    for (const [px, pz] of [[-1.2, -0.7], [1.2, -0.7], [-1.2, 0.7], [1.2, 0.7]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5), new THREE.MeshLambertMaterial({ color: 0x333333 }));
      pole.position.set(px, 1.15, pz);
      stall.add(pole);
    }
    stall.position.set(ped.x + 1.5, 0, ped.z);
    scene.add(stall);
  }

  // ---------- briefcases, ramps, boats ----------
  const caseSpots = [
    [-196, 62, 1], [-150, -120, 1], [-200, -40, 1], [-184, 100, 1], [12, 12, 96],
    [150, -150, 1], [-60, 132, 1], [60, -24, 1], [-206, 150, 1], [24, -168, 1],
  ];
  for (let i = 0; i < BRIEFCASES; i += 1) {
    const [x, z, y] = caseSpots[i];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x664400 }));
    mesh.position.set(x, y + 0.4, z);
    scene.add(mesh);
    world.briefcases.push({ x, z, y, mesh, found: false });
  }
  const rampSpots = [[-196, 96, Math.PI / 2], [76, -152, 0], [-38, 76, Math.PI]];
  for (const [x, z, rot] of rampSpots) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 8), new THREE.MeshLambertMaterial({ color: 0xd06a2e }));
    mesh.position.set(x, 1.2, z);
    mesh.rotation.x = -0.35;
    mesh.rotation.y = rot;
    scene.add(mesh);
    world.ramps.push({ x, z, mesh, used: false });
  }
  function makeBoatMesh(colorHex, big) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(big ? 3 : 2.2, 0.9, big ? 8 : 6), new THREE.MeshLambertMaterial({ color: colorHex }));
    hull.position.y = 0.4;
    g.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(big ? 2.4 : 1.8, 0.5, big ? 3 : 2.2), new THREE.MeshLambertMaterial({ color: 0xe8e0d0 }));
    deck.position.set(0, 1, big ? -1 : -0.8);
    g.add(deck);
    return g;
  }
  const playerBoatMesh = makeBoatMesh(0xd05050, false);
  playerBoatMesh.position.set(-204, 0, -40);
  scene.add(playerBoatMesh);
  world.playerBoat = { x: -204, z: -40, angle: 0, speed: 0, mesh: playerBoatMesh, boarded: false };
  const smugglerMesh = makeBoatMesh(0x222226, true);
  smugglerMesh.position.set(-240, 0, -120);
  scene.add(smugglerMesh);
  world.smuggler = { x: -240, z: -120, angle: 0, speed: 0, mesh: smugglerMesh, active: false };
  const moored = makeBoatMesh(0x3fa0ff, false);
  moored.position.set(-204, 0, -12);
  scene.add(moored);

  // ---------- taxi stands + waiting passengers ----------
  const standSpots = [[-38, 76], [76, -38], [-152, 38], [38, 76], [-60, 120]];
  const taxiSignMat = new THREE.MeshBasicMaterial({ color: PALETTE.taxiYellow });
  for (let i = 0; i < TAXI_STANDS; i += 1) {
    const [x, z] = standSpots[i];
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.3), taxiSignMat);
    sign.position.set(x, 2.6, z);
    scene.add(sign);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    pole.position.set(x, 1.3, z);
    scene.add(pole);
    const ped = addPed('walker', x + 1.5, z + 1);
    ped.waitingTaxi = true;
    world.taxiPassengers.push({ ped, x: ped.x, z: ped.z, active: i === 0, taken: false });
  }

  // ---------- job beacon ----------
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.5, depthWrite: false });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true), beaconMat);
  beacon.position.set(0, 30, 0);
  beacon.visible = false;
  scene.add(beacon);
  const beaconRing = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.4, 24), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.set(0, 0.15, 0);
  beaconRing.visible = false;
  scene.add(beaconRing);
  world.beacon = beacon;
  world.beaconRing = beaconRing;

  // ---------- player mesh ----------
  const playerGroup = new THREE.Group();
  const pBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1, 0.4), new THREE.MeshLambertMaterial({ color: 0x2e6fc2 }));
  pBody.position.y = 1.1;
  playerGroup.add(pBody);
  const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd8a880 }));
  pHead.position.y = 1.85;
  playerGroup.add(pHead);
  const pLegL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), new THREE.MeshLambertMaterial({ color: 0x222226 }));
  pLegL.position.set(-0.16, 0.35, 0);
  playerGroup.add(pLegL);
  const pLegR = pLegL.clone();
  pLegR.position.x = 0.16;
  playerGroup.add(pLegR);
  playerGroup.position.set(player.x, 0, player.z);
  scene.add(playerGroup);
  player.mesh = playerGroup;
  player.legL = pLegL;
  player.legR = pLegR;

  // ---------- police, helicopter, roadblocks ----------
  const heliGroup = new THREE.Group();
  const heliBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 4.5), new THREE.MeshLambertMaterial({ color: 0x1a2a4a }));
  heliGroup.add(heliBody);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.6), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  rotor.position.y = 0.9;
  heliGroup.add(rotor);
  const heliLight = new THREE.SpotLight(0xfff2b0, 0, 120, 0.35, 0.4);
  heliLight.position.set(0, -0.8, 0);
  heliLight.target.position.set(0, -40, 0);
  heliGroup.add(heliLight);
  heliGroup.add(heliLight.target);
  heliGroup.visible = false;
  scene.add(heliGroup);
  world.heli = { mesh: heliGroup, rotor, light: heliLight, angle: 0 };

  const roadblockMat = new THREE.MeshLambertMaterial({ color: 0xffd23f });
  const rbStripeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (let i = 0; i < 4; i += 1) {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 0.6), roadblockMat);
    bar.position.y = 1;
    g.add(bar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 0.65), rbStripeMat);
    stripe.position.y = 1;
    g.add(stripe);
    for (const sx of [-4.5, 4.5]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), rbStripeMat);
      leg.position.set(sx, 0.5, 0);
      g.add(leg);
    }
    g.visible = false;
    scene.add(g);
    world.roadblocks.push({ mesh: g, x: 0, z: 0 });
  }

  // ---------- damage smoke / fire (sprite pools per car) ----------
  function makeDamagePool(colorHex, size) {
    const pool = [];
    for (let i = 0; i < 14; i += 1) {
      const mat = new THREE.SpriteMaterial({ map: world.glowTex, color: colorHex, transparent: true, opacity: 0, depthWrite: false });
      const spr = new THREE.Sprite(mat);
      spr.scale.setScalar(size);
      spr.visible = false;
      scene.add(spr);
      pool.push({ spr, life: 0, max: 1 });
    }
    return pool;
  }
  function attachDamage(car) {
    car.smoke = makeDamagePool(0x888888, 2.2);
    car.fire = makeDamagePool(0xff7a1a, 1.4);
  }
  for (const car of [...world.parkedCars, ...world.trafficCars]) attachDamage(car);

  // ---------- rain ----------
  const rainCount = 900;
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i += 1) {
    rainPos[i * 3] = rng.range(-60, 60);
    rainPos[i * 3 + 1] = rng.range(0, 40);
    rainPos[i * 3 + 2] = rng.range(-60, 60);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.PointsMaterial({ color: 0xaac8e0, size: 0.35, transparent: true, opacity: 0 });
  const rainPoints = new THREE.Points(rainGeo, rainMat);
  rainPoints.visible = false;
  scene.add(rainPoints);
  world.rainPoints = rainPoints;
  world.rainMat = rainMat;

  // ---------- garage visuals ----------
  const garagePad = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), new THREE.MeshBasicMaterial({ color: 0x3fa0ff, transparent: true, opacity: 0.25 }));
  garagePad.rotation.x = -Math.PI / 2;
  garagePad.position.set(150, 0.06, -150);
  scene.add(garagePad);
  world.garagePad = garagePad;

  // ---------- helpers ----------
  function collideCircle(x, z, r) {
    // Push a circle out of every building AABB it overlaps. Returns corrected [x, z].
    for (const c of world.colliders) {
      const nx = clamp(x, c.minX, c.maxX);
      const nz = clamp(z, c.minZ, c.maxZ);
      const dx = x - nx; const dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * r;
          z = nz + (dz / d) * r;
        } else {
          // Centre inside the box: push out along the smallest penetration.
          const pl = x - c.minX; const pr = c.maxX - x; const pt = z - c.minZ; const pb = c.maxZ - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
          else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
        }
      }
    }
    return [x, z];
  }

  function msg(text) {
    state.messages.push(text);
    if (state.messages.length > 4) state.messages.shift();
    state.msgTimer = 6;
  }

  function setWanted(n) {
    state.wanted = clamp(n, 0, WANTED.max);
  }

  function setBeacon(x, y, z, on) {
    world.beacon.visible = !!on;
    world.beaconRing.visible = !!on;
    if (on) {
      world.beacon.position.set(x, (y || 0) + 30, z);
      world.beaconRing.position.set(x, (y || 0) + 0.15, z);
    }
  }

  function nearestCar(x, z, maxD) {
    let best = null; let bd = maxD * maxD;
    for (const car of world.parkedCars) {
      if (car.wrecked) continue;
      const d = dist2(x, z, car.x, car.z);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }

  function enterCar(car) {
    if (!car || car.wrecked) return false;
    state.driving = true;
    state.inBoat = false;
    state.car = car;
    state.carAngle = car.angle;
    state.carSpeed = 0;
    player.mesh.visible = false;
    if (!car.owned && !car.stolen) {
      car.stolen = true;
      setWanted(state.wanted + WANTED.steal);
      msg('You stole a car — the cops noticed.');
    }
    audio.engine(0, true);
    return true;
  }

  function exitCar() {
    if (!state.car) return;
    const car = state.car;
    car.angle = state.carAngle;
    state.driving = false;
    state.car = null;
    state.carSpeed = 0;
    player.x = car.x + Math.sin(car.angle + Math.PI / 2) * 2.5;
    player.z = car.z + Math.cos(car.angle + Math.PI / 2) * 2.5;
    player.mesh.visible = true;
    player.mesh.position.set(player.x, state.playerY, player.z);
    audio.engine(0, false);
  }

  function damageCar(car, amount) {
    if (!car || car.wrecked) return;
    car.health -= amount;
    if (car.health <= 0) {
      car.health = 0;
      car.wrecked = true;
      car.speed = 0;
      msg('The car is wrecked!');
      audio.fail();
      if (state.car === car) exitCar();
    }
  }

  // ---------- garage ----------
  function garageRepair() {
    const car = state.car;
    if (!car) return 'No car in the garage.';
    if (state.cash < GARAGE.repairCost) return 'Not enough cash for repairs.';
    if (car.health >= 100) return 'This car is already in perfect shape.';
    state.cash -= GARAGE.repairCost;
    car.health = 100;
    state.garageUpgrades += 1;
    return 'Repaired to full health. -$100';
  }
  function garageRepaint() {
    const car = state.car;
    if (!car) return 'No car in the garage.';
    if (state.cash < GARAGE.repaintCost) return 'Not enough cash for a repaint.';
    state.cash -= GARAGE.repaintCost;
    const idx = (PALETTE.car.indexOf(car.color) + 1) % PALETTE.car.length;
    car.color = PALETTE.car[idx];
    car.bodyMat.color.setHex(car.color);
    car.owned = true;
    state.garageUpgrades += 1;
    return 'Fresh paint job — this car is yours now. -$50';
  }
  function garageUnderglow() {
    const car = state.car;
    if (!car) return 'No car in the garage.';
    if (car.underglow) return 'Underglow is already fitted.';
    if (state.cash < GARAGE.underglowCost) return 'Not enough cash for underglow.';
    state.cash -= GARAGE.underglowCost;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(3, 5.4), new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.5 }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.08;
    car.mesh.add(glow);
    car.underglow = glow;
    car.owned = true;
    state.garageUpgrades += 1;
    return 'Neon underglow fitted. -$150';
  }
  function garageSpoiler() {
    const car = state.car;
    if (!car) return 'No car in the garage.';
    if (car.spoilerAdded || car.type === 'sports') return 'This car already has a spoiler.';
    if (state.cash < GARAGE.spoilerCost) return 'Not enough cash for a spoiler.';
    state.cash -= GARAGE.spoilerCost;
    const sp = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.5), car.bodyMat);
    sp.position.set(0, 1.5, 2);
    car.mesh.add(sp);
    car.spoilerAdded = true;
    car.owned = true;
    state.garageUpgrades += 1;
    return 'Spoiler fitted. -$120';
  }

  // ---------- taxi ----------
  const TAXI_DESTS = [
    { name: 'Grand Solmar casino', x: -60, z: 132 },
    { name: 'Solmar Tower', x: 12, z: 12 },
    { name: 'the stadium', x: -150, z: -120 },
    { name: 'the marina', x: -200, z: -40 },
    { name: 'the lighthouse', x: -206, z: 150 },
    { name: 'the north docks', x: 24, z: -168 },
  ];
  function startTaxi() {
    if (!state.driving || state.taxiActive) return false;
    let best = null; let bd = 49;
    for (const tp of world.taxiPassengers) {
      if (!tp.active || tp.taken) continue;
      const d = dist2(state.car.x, state.car.z, tp.x, tp.z);
      if (d < bd) { bd = d; best = tp; }
    }
    if (!best) return false;
    best.taken = true;
    best.ped.mesh.visible = false;
    state.taxiActive = true;
    state.taxiPassenger = best;
    state.taxiFare = TAXI.baseFare;
    state.taxiTimeLeft = TAXI.timeLimit;
    state.taxiDest = rng.pick(TAXI_DESTS);
    setBeacon(state.taxiDest.x, 0, state.taxiDest.z, true);
    msg(`Taxi fare: take your passenger to ${state.taxiDest.name}. Meter running!`);
    audio.pickup();
    return true;
  }
  function endTaxi(success) {
    const tp = state.taxiPassenger;
    state.taxiActive = false;
    setBeacon(0, 0, 0, false);
    if (tp) {
      tp.ped.mesh.visible = true;
      tp.ped.x = state.car.x + 2; tp.ped.z = state.car.z + 2;
      tp.ped.mesh.position.set(tp.ped.x, 0, tp.ped.z);
      tp.taken = false;
      tp.active = false;
      // A new passenger flags down at another stand.
      const next = rng.pick(world.taxiPassengers.filter((p) => p !== tp));
      if (next) next.active = true;
    }
    if (success) {
      const tip = state.taxiTimeLeft > TAXI.timeLimit / 2 ? TAXI.tipPerfect : 0;
      const total = Math.round(state.taxiFare) + tip;
      state.cash += total;
      state.taxiEarned += total;
      state.taxiJobsDone += 1;
      msg(`Fare complete! +$${total}${tip ? ` (includes $${tip} fast tip)` : ''}`);
      audio.cash();
    } else {
      msg('The passenger gave up and walked away.');
      audio.fail();
    }
    state.taxiPassenger = null;
    state.taxiDest = null;
  }

  // ---------- police ----------
  function spawnCop() {
    const a = rng.range(0, Math.PI * 2);
    const x = clamp(player.x + Math.cos(a) * 42, -180, 180);
    const z = clamp(player.z + Math.sin(a) * 42, -180, 180);
    const mesh = makePedMesh('walker');
    mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const cop = { x, z, angle: a, health: 50, mesh, attack: 0, dead: false };
    world.cops.push(cop);
    return cop;
  }
  function spawnCruiser() {
    const a = rng.range(0, Math.PI * 2);
    const x = clamp(player.x + Math.cos(a) * 55, -180, 180);
    const z = clamp(player.z + Math.sin(a) * 55, -180, 180);
    const car = newCar('police', 0xe8e8e8, x, z, a);
    car.speed = 14;
    world.cruisers.push(car);
    return car;
  }

  function updateDamageParticles(car, dt) {
    if (!car.smoke) return;
    const smoking = car.health < 55 && !car.wrecked;
    const burning = car.health < 25 && !car.wrecked;
    for (const pool of [car.smoke, car.fire]) {
      const isFire = pool === car.fire;
      const active = isFire ? burning : smoking;
      for (const p of pool) {
        if (active && p.life <= 0 && rng.chance(0.25)) {
          p.life = p.max = rng.range(0.6, 1.2);
          p.spr.visible = true;
          p.spr.position.set(car.x + rng.range(-0.5, 0.5), 1.2, car.z + rng.range(-0.5, 0.5));
          p.spr.material.opacity = 0.7;
        }
        if (p.life > 0) {
          p.life -= dt;
          p.spr.position.y += dt * (isFire ? 2.5 : 1.6);
          p.spr.material.opacity = Math.max(0, (p.life / p.max) * 0.7);
          if (p.life <= 0) p.spr.visible = false;
        }
      }
    }
  }

  function shoot() {
    const weapon = WEAPONS[state.weaponIndex];
    if (state.reloadTimer > 0 || state.shootCooldown > 0) return;
    if (state.mags[state.weaponIndex] <= 0) {
      state.reloadTimer = weapon.reload;
      msg('Reloading… (R)');
      return;
    }
    state.mags[state.weaponIndex] -= 1;
    state.shootCooldown = weapon.rate;
    state.shotFlash = 0.08;
    audio.shot();
    const pellets = weapon.pellets || 1;
    for (let p = 0; p < pellets; p += 1) {
      const spread = (rng.next() - 0.5) * weapon.spread * 2;
      const dirA = player.angle + spread;
      const dx = Math.sin(dirA); const dz = Math.cos(dirA);
      // Nearest cop or pedestrian inside the cone.
      let best = null; let bd = weapon.range;
      for (const cop of world.cops) {
        if (cop.dead) continue;
        const vx = cop.x - player.x; const vz = cop.z - player.z;
        const d = Math.sqrt(vx * vx + vz * vz);
        if (d > weapon.range) continue;
        const dot = (vx * dx + vz * dz) / (d || 1);
        if (dot > 0.94 && d < bd) { bd = d; best = { kind: 'cop', obj: cop, d }; }
      }
      for (const ped of world.pedestrians) {
        if (ped.dead || ped.waitingTaxi) continue;
        const vx = ped.x - player.x; const vz = ped.z - player.z;
        const d = Math.sqrt(vx * vx + vz * vz);
        if (d > weapon.range) continue;
        const dot = (vx * dx + vz * dz) / (d || 1);
        if (dot > 0.94 && d < bd) { bd = d; best = { kind: 'ped', obj: ped, d }; }
      }
      if (best) {
        if (best.kind === 'cop') {
          best.obj.health -= weapon.damage;
          if (best.obj.health <= 0 && !best.obj.dead) {
            best.obj.dead = true;
            best.obj.mesh.rotation.x = Math.PI / 2;
            setWanted(state.wanted + WANTED.copDown);
            msg('Cop down — the heat is on.');
          }
        } else {
          best.obj.dead = true;
          best.obj.mesh.rotation.x = Math.PI / 2;
          setWanted(state.wanted + WANTED.hitPed);
          msg('You hit a pedestrian!');
        }
      }
    }
    if (state.wanted < 1) setWanted(state.wanted + WANTED.shootPublic);
  }

  function punch() {
    if (state.punchCooldown > 0) return;
    state.punchCooldown = PLAYER.punchCooldown;
    audio.punch();
    for (const cop of world.cops) {
      if (cop.dead) continue;
      if (dist2(player.x, player.z, cop.x, cop.z) < PLAYER.punchRange * PLAYER.punchRange) {
        cop.health -= PLAYER.punchDamage;
        if (cop.health <= 0) { cop.dead = true; cop.mesh.rotation.x = Math.PI / 2; setWanted(state.wanted + WANTED.copDown); }
        return;
      }
    }
    for (const ped of world.pedestrians) {
      if (ped.dead || ped.waitingTaxi) continue;
      if (dist2(player.x, player.z, ped.x, ped.z) < PLAYER.punchRange * PLAYER.punchRange) {
        ped.dead = true;
        ped.mesh.rotation.x = Math.PI / 2;
        setWanted(state.wanted + WANTED.hitPed);
        msg('You hit a pedestrian!');
        return;
      }
    }
  }

  function respawn() {
    const loss = Math.floor(state.cash * BUSTED_LOSS);
    state.cash -= loss;
    state.lastLoss = loss;
    state.health = PLAYER.maxHealth;
    setWanted(0);
    state.over = null;
    state.inBoat = false;
    if (state.driving) exitCar();
    player.x = PLAYER.startX;
    player.z = PLAYER.startZ;
    player.angle = Math.PI;
    state.playerY = 0;
    state.onRoof = false;
    player.mesh.visible = true;
    player.mesh.position.set(player.x, 0, player.z);
    for (const cop of world.cops) { scene.remove(cop.mesh); }
    world.cops.length = 0;
    for (const c of world.cruisers) { scene.remove(c.mesh); }
    world.cruisers.length = 0;
    world.heli.mesh.visible = false;
    audio.siren(false);
    msg(`You wake up at the hospital. -$${loss}`);
  }

  // ---------- the step ----------
  function step(dt, input, actions, paused) {
    const events = [];
    state.events = events;
    if (paused) return events;
    state.elapsed += dt;
    state.timeSec = (state.timeSec + dt * (DAY / DAY_LENGTH)) % DAY;
    state.punchCooldown = Math.max(0, state.punchCooldown - dt);
    state.shootCooldown = Math.max(0, state.shootCooldown - dt);
    state.shotFlash = Math.max(0, state.shotFlash - dt);
    if (state.reloadTimer > 0) {
      state.reloadTimer -= dt;
      if (state.reloadTimer <= 0) {
        const w = WEAPONS[state.weaponIndex];
        const need = w.mag - state.mags[state.weaponIndex];
        const take = Math.min(need, state.ammo[state.weaponIndex]);
        state.mags[state.weaponIndex] += take;
        state.ammo[state.weaponIndex] -= take;
      }
    }
    if (state.msgTimer > 0) state.msgTimer -= dt;

    // Weather: dry spells and rain showers roll in and out.
    state.weatherTimer -= dt;
    if (state.weatherTimer <= 0) {
      state.rainTarget = state.rainTarget > 0.5 ? 0 : (rng.chance(0.4) ? 1 : 0);
      state.weatherTimer = state.rainTarget > 0.5 ? rng.range(25, 45) : rng.range(60, 120);
    }
    state.rain += (state.rainTarget - state.rain) * Math.min(1, dt * 0.5);
    audio.rain(state.rain > 0.4);

    // Traffic lights cycle NS / EW every 12 s.
    lightCycle.t += dt;
    const nsGreen = (lightCycle.t % lightCycle.period) < lightCycle.period / 2;
    for (const tl of world.trafficLights) {
      tl.nsGreen = nsGreen;
      tl.red.material.color.setHex(nsGreen ? 0x551111 : 0xff2222);
      tl.green.material.color.setHex(nsGreen ? 0x22ff44 : 0x115511);
    }

    const drag = input.takeDrag();
    state.camYaw -= drag.dx * 0.005;
    state.camPitch = clamp(state.camPitch + drag.dy * 0.003, -0.1, 0.9);
    const axes = input.moveAxes();

    // ----- on foot -----
    if (!state.driving && !state.inBoat) {
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const fwdX = Math.sin(state.camYaw + Math.PI);
      const fwdZ = Math.cos(state.camYaw + Math.PI);
      const rightX = Math.sin(state.camYaw + Math.PI / 2);
      const rightZ = Math.cos(state.camYaw + Math.PI / 2);
      let mx = (fwdX * axes.y + rightX * -axes.x) * speed * dt;
      let mz = (fwdZ * axes.y + rightZ * -axes.x) * speed * dt;
      if (mx || mz) {
        player.angle = Math.atan2(mx, mz);
        const legSwing = Math.sin(state.elapsed * 10) * 0.5;
        player.legL.rotation.x = legSwing;
        player.legR.rotation.x = -legSwing;
      } else {
        player.legL.rotation.x = 0;
        player.legR.rotation.x = 0;
      }
      let nx = player.x + mx;
      let nz = player.z + mz;
      if (state.onRoof) {
        nx = clamp(nx, 3, 21);
        nz = clamp(nz, 3, 21);
      } else {
        [nx, nz] = collideCircle(nx, nz, PLAYER.radius);
        nx = clamp(nx, -205, 188);
        nz = clamp(nz, -188, 188);
      }
      player.x = nx;
      player.z = nz;
      player.mesh.position.set(player.x, state.playerY, player.z);
      player.mesh.rotation.y = player.angle;

      if (actions & ACTION_INTERACT) {
        // Lift up / down Solmar Tower.
        if (dist2(player.x, player.z, 12, 12) < 25) {
          if (!state.onRoof) {
            state.onRoof = true;
            state.playerY = 96;
            player.mesh.position.y = 96;
            msg('Lift to the roof — grab the briefcase.');
          } else {
            state.onRoof = false;
            state.playerY = 0;
            player.mesh.position.y = 0;
            msg('Back on the street.');
          }
        } else if (dist2(player.x, player.z, world.playerBoat.x, world.playerBoat.z) < 30 && player.x < -180) {
          state.inBoat = true;
          player.mesh.visible = false;
          msg('Speedboat — W/S throttle, A/D steer.');
          // Consume the press: the boat branch below runs in this same step
          // and would otherwise read the same INTERACT bit as "get out".
          actions &= ~ACTION_INTERACT;
        } else {
          const car = nearestCar(player.x, player.z, 4.5);
          if (car && enterCar(car)) {
            // Same-step guard: the driving branch below would read this
            // INTERACT bit as "exit the car" and undo the entry.
            actions &= ~ACTION_INTERACT;
          }
        }
      }
      if ((actions & ACTION_SHOOT) || input.mouseDown) shoot();
      if (input.keys.has('Space')) punch();
      if (actions & ACTION_RELOAD) {
        const w = WEAPONS[state.weaponIndex];
        if (state.mags[state.weaponIndex] < w.mag && state.ammo[state.weaponIndex] > 0) state.reloadTimer = w.reload;
      }
      if (input.keys.has('Digit1')) state.weaponIndex = 0;
      if (input.keys.has('Digit2')) state.weaponIndex = 1;
      if (input.keys.has('Digit3')) state.weaponIndex = 2;
    }

    // ----- driving -----
    if (state.driving && state.car) {
      const car = state.car;
      const maxFwd = car.type === 'sports' ? 34 : car.type === 'bus' ? 20 : 28;
      const accel = 16;
      if (axes.y > 0) state.carSpeed += accel * dt;
      if (axes.y < 0) state.carSpeed -= (state.carSpeed > 0 ? 22 : 10) * dt;
      if (input.handbrake) state.carSpeed *= Math.max(0, 1 - 3 * dt);
      if (axes.y === 0) state.carSpeed *= Math.max(0, 1 - 0.6 * dt);
      state.carSpeed = clamp(state.carSpeed, -10, maxFwd);
      if (Math.abs(state.carSpeed) > 0.5) {
        const steer = axes.x * (state.carSpeed >= 0 ? 1 : -1);
        state.carAngle += steer * 1.7 * dt * Math.min(1, Math.abs(state.carSpeed) / 8);
      }
      car.angle = state.carAngle;
      let nx = car.x + Math.sin(state.carAngle) * state.carSpeed * dt;
      let nz = car.z + Math.cos(state.carAngle) * state.carSpeed * dt;
      const before = [nx, nz];
      [nx, nz] = collideCircle(nx, nz, 1.6);
      if ((nx !== before[0] || nz !== before[1]) && Math.abs(state.carSpeed) > 8) {
        damageCar(car, 6);
        state.carSpeed *= -0.25;
        msg('You slammed into a building!');
      }
      car.x = clamp(nx, -205, 188);
      car.z = clamp(nz, -188, 188);
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.angle;
      player.x = car.x;
      player.z = car.z;
      if (actions & ACTION_INTERACT) exitCar();
      if (actions & ACTION_TAXI) startTaxi();
      if (actions & ACTION_GARAGE) {
        if (dist2(car.x, car.z, world.garageZone.x, world.garageZone.z) < world.garageZone.r * world.garageZone.r) {
          state.garageOpen = true;
        } else {
          msg('Garage is at the safehouse (south-east corner). Drive there and press G.');
        }
      }
      // Stunt ramps.
      for (const ramp of world.ramps) {
        if (!ramp.used && dist2(car.x, car.z, ramp.x, ramp.z) < 36 && Math.abs(state.carSpeed) > 18) {
          state.airborne = true;
          state.airTime = 0;
          ramp.used = true;
        }
      }
      if (state.airborne) {
        state.airTime += dt;
        car.mesh.position.y = Math.sin(Math.min(1, state.airTime / 0.9) * Math.PI) * 3;
        if (state.airTime > 0.9) {
          state.airborne = false;
          car.mesh.position.y = 0;
          const dist = Math.round(state.airTime * Math.abs(state.carSpeed));
          state.bestStunt = Math.max(state.bestStunt, dist);
          state.cash += STUNT_REWARD;
          events.push({ type: 'stunt', distance: dist });
          msg(`Clean landing — ${dist}m jump! +$${STUNT_REWARD}`);
          audio.cash();
        }
      }
      // Running over pedestrians is a crime.
      for (const ped of world.pedestrians) {
        if (ped.dead || ped.waitingTaxi) continue;
        if (dist2(car.x, car.z, ped.x, ped.z) < 4 && Math.abs(state.carSpeed) > 3) {
          ped.dead = true;
          ped.mesh.rotation.x = Math.PI / 2;
          setWanted(state.wanted + WANTED.hitPed);
          msg('You hit a pedestrian!');
        }
      }
      audio.engine(state.carSpeed, true);
    } else {
      audio.engine(0, false);
    }

    // ----- boat -----
    if (state.inBoat) {
      const boat = world.playerBoat;
      if (axes.y > 0) boat.speed = Math.min(26, boat.speed + 14 * dt);
      if (axes.y < 0) boat.speed = Math.max(-6, boat.speed - 14 * dt);
      if (axes.y === 0) boat.speed *= Math.max(0, 1 - 0.5 * dt);
      boat.angle += axes.x * 1.4 * dt * Math.min(1, Math.abs(boat.speed) / 8);
      boat.x = clamp(boat.x + Math.sin(boat.angle) * boat.speed * dt, -330, -178);
      boat.z = clamp(boat.z + Math.cos(boat.angle) * boat.speed * dt, -200, 200);
      boat.mesh.position.set(boat.x, Math.sin(state.elapsed * 2) * 0.2, boat.z);
      boat.mesh.rotation.y = boat.angle;
      player.x = boat.x;
      player.z = boat.z;
      if (actions & ACTION_INTERACT) {
        state.inBoat = false;
        player.x = -184;
        player.z = boat.z;
        player.mesh.visible = true;
        player.mesh.position.set(player.x, 0, player.z);
      }
      if (world.smuggler.active) {
        const sm = world.smuggler;
        const dx = sm.x - boat.x; const dz = sm.z - boat.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const fleeA = Math.atan2(dx, dz) + Math.PI;
        sm.angle = fleeA;
        sm.speed = 16;
        sm.x = clamp(sm.x + Math.sin(sm.angle) * sm.speed * dt, -330, -190);
        sm.z = clamp(sm.z + Math.cos(sm.angle) * sm.speed * dt, -190, 190);
        sm.mesh.position.set(sm.x, Math.sin(state.elapsed * 2 + 1) * 0.2, sm.z);
        sm.mesh.rotation.y = sm.angle;
        if (d < 14) {
          sm.active = false;
          events.push({ type: 'smugglerCaught' });
        }
      }
    }

    // ----- traffic -----
    for (const car of world.trafficCars) {
      const r = car.route;
      let targetSpeed = car.cruiseSpeed;
      // Stop at a red light when close to an intersection on this road.
      for (const tl of world.trafficLights) {
        const near = r.vertical
          ? Math.abs(car.z - tl.z) < 12 && Math.abs(car.x - tl.x) < 6
          : Math.abs(car.x - tl.x) < 12 && Math.abs(car.z - tl.z) < 6;
        if (near) {
          const redForMe = r.vertical ? !tl.nsGreen : tl.nsGreen;
          if (redForMe) targetSpeed = 0;
        }
      }
      // Don't rear-end the car ahead in the same lane.
      for (const other of world.trafficCars) {
        if (other === car || !other.route || other.route.vertical !== r.vertical || other.route.road !== r.road) continue;
        const ahead = r.vertical ? (other.z - car.z) * r.dir : (other.x - car.x) * r.dir;
        if (ahead > 0 && ahead < 9) targetSpeed = Math.min(targetSpeed, other.speed * 0.8);
      }
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
      if (r.vertical) {
        car.z += car.speed * r.dir * dt;
        if (car.z > 185) car.z = -185;
        if (car.z < -185) car.z = 185;
        car.angle = r.dir > 0 ? 0 : Math.PI;
      } else {
        car.x += car.speed * r.dir * dt;
        if (car.x > 185) car.x = -185;
        if (car.x < -185) car.x = 185;
        car.angle = r.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.angle;
      for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2;
    }

    // ----- pedestrians -----
    for (const ped of world.pedestrians) {
      if (ped.dead || ped.waitingTaxi) continue;
      if (ped.wait > 0) { ped.wait -= dt; continue; }
      const dx = ped.tx - ped.x; const dz = ped.tz - ped.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.6) {
        if (ped.kind === 'beachgoer') {
          ped.tx = rng.range(-184, -178);
          ped.tz = rng.range(-160, 160);
        } else if (ped.kind === 'fisherman') {
          ped.wait = rng.range(4, 10);
          continue;
        } else {
          ped.tx = clamp(ped.x + rng.range(-35, 35), -175, 175);
          ped.tz = clamp(ped.z + rng.range(-35, 35), -175, 175);
        }
        ped.wait = rng.range(0, 3);
        continue;
      }
      ped.x += (dx / d) * ped.speed * dt;
      ped.z += (dz / d) * ped.speed * dt;
      ped.angle = Math.atan2(dx, dz);
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.angle;
      const swing = Math.sin(state.elapsed * 8 + ped.x) * 0.4;
      ped.mesh.userData.legL.rotation.x = swing;
      ped.mesh.userData.legR.rotation.x = -swing;
    }

    // ----- briefcases -----
    for (let i = 0; i < world.briefcases.length; i += 1) {
      const b = world.briefcases[i];
      if (b.found) continue;
      const dy = state.onRoof ? Math.abs(state.playerY - b.y) : Math.abs(b.y - 1);
      if (dy > 4) continue;
      if (dist2(player.x, player.z, b.x, b.z) < 9 && !state.driving) {
        b.found = true;
        b.mesh.visible = false;
        state.briefcasesFound += 1;
        state.cash += BRIEFCASE_REWARD;
        events.push({ type: 'briefcase', index: i });
        msg(`Hidden briefcase found! +$${BRIEFCASE_REWARD}`);
        audio.cash();
      }
    }

    // ----- taxi fares -----
    if (state.taxiActive && state.taxiDest) {
      state.taxiTimeLeft -= dt;
      state.taxiFare += Math.abs(state.carSpeed) * TAXI.perMetre * dt;
      if (dist2(state.car.x, state.car.z, state.taxiDest.x, state.taxiDest.z) < 64) {
        endTaxi(true);
      } else if (state.taxiTimeLeft <= 0) {
        endTaxi(false);
      }
    }

    // ----- radio -----
    if (actions & ACTION_RADIO) {
      if (!state.driving) {
        msg('The radio only plays while you drive. Steal a car first!');
      } else if (!state.radioOn) {
        state.radioOn = true;
        const name = audio.setRadio(state.radioStation, true);
        msg(`Radio: ${name}`);
      } else {
        state.radioStation = (state.radioStation + 1) % RADIO_STATIONS.length;
        const name = audio.setRadio(state.radioStation, true);
        msg(`Radio: ${name}`);
      }
    }
    if (!state.driving && state.radioOn) {
      state.radioOn = false;
      audio.setRadio(state.radioStation, false);
    }

    // ----- wanted / police -----
    const wantedStars = Math.floor(state.wanted);
    const wantCops = wantedStars >= 1 ? Math.min(wantedStars * 2, 8) : 0;
    while (world.cops.filter((c) => !c.dead).length < wantCops) spawnCop();
    const wantCruisers = wantedStars >= 2 ? Math.min(wantedStars - 1, 4) : 0;
    while (world.cruisers.length < wantCruisers) spawnCruiser();
    state.seen = false;
    for (const cop of world.cops) {
      if (cop.dead) continue;
      const dx = player.x - cop.x; const dz = player.z - cop.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 45) state.seen = true;
      if (d > 1.8) {
        cop.x += (dx / (d || 1)) * 4.6 * dt;
        cop.z += (dz / (d || 1)) * 4.6 * dt;
        cop.angle = Math.atan2(dx, dz);
      } else if (!state.driving) {
        cop.attack += dt;
        state.health -= 8 * dt;
        if (cop.attack > 1.5) {
          state.over = 'busted';
          events.push({ type: 'busted' });
          return events;
        }
      }
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.angle;
    }
    for (const cruiser of world.cruisers) {
      const dx = player.x - cruiser.x; const dz = player.z - cruiser.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 55) state.seen = true;
      const target = Math.atan2(dx, dz);
      let diff = target - cruiser.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cruiser.angle += clamp(diff, -1.6 * dt, 1.6 * dt);
      cruiser.speed = d > 12 ? 17 : 10;
      cruiser.x += Math.sin(cruiser.angle) * cruiser.speed * dt;
      cruiser.z += Math.cos(cruiser.angle) * cruiser.speed * dt;
      cruiser.mesh.position.set(cruiser.x, 0, cruiser.z);
      cruiser.mesh.rotation.y = cruiser.angle;
      cruiser.mesh.userData.lightBar.material.color.setHex(Math.floor(state.elapsed * 4) % 2 ? 0xff2222 : 0x2266ff);
      if (state.driving && state.car && d < 3.4) {
        damageCar(state.car, 8 * dt);
        state.carSpeed *= 0.98;
      }
    }
    if (!state.seen) state.wanted = Math.max(0, state.wanted - WANTED.decayQuiet * dt);
    audio.siren(wantedStars >= 2);

    // Helicopter + roadblocks at 4+ stars.
    const heli = world.heli;
    if (wantedStars >= 4) {
      heli.mesh.visible = true;
      heli.angle += dt * 0.5;
      heli.mesh.position.set(player.x + Math.cos(heli.angle) * 26, 42, player.z + Math.sin(heli.angle) * 26);
      heli.mesh.rotation.y = -heli.angle;
      heli.rotor.rotation.y += dt * 22;
      heli.light.intensity = 2.2;
      heli.light.target.position.set(player.x - heli.mesh.position.x, -42, player.z - heli.mesh.position.z);
      heli.light.target.updateMatrixWorld();
      world.roadblocks.forEach((rb, i) => {
        rb.mesh.visible = true;
        const a = (i / 4) * Math.PI * 2 + 0.4;
        rb.x = clamp(player.x + Math.cos(a) * 42, -175, 175);
        rb.z = clamp(player.z + Math.sin(a) * 42, -175, 175);
        rb.mesh.position.set(rb.x, 0, rb.z);
        rb.mesh.rotation.y = a;
      });
    } else {
      heli.mesh.visible = false;
      heli.light.intensity = 0;
      for (const rb of world.roadblocks) rb.mesh.visible = false;
    }

    // Health / wrecked car.
    if (state.health <= 0) {
      state.health = 0;
      state.over = 'wasted';
      events.push({ type: 'wasted' });
      return events;
    }
    for (const car of [...world.parkedCars, ...world.trafficCars, ...world.cruisers]) {
      updateDamageParticles(car, dt);
    }

    return events;
  }

  // ---------- render ----------
  function render() {
    const hour = state.timeSec / 3600;
    const dayT = clamp((hour - 6) / 12, 0, 1); // 0 dawn, 1 noon
    const duskT = clamp(1 - Math.abs(hour - 18.5) / 2.5, 0, 1);
    const night = hour < 5.5 || hour > 19.5;
    let sky = lerpColor(PALETTE.skyDawn, PALETTE.skyNoon, dayT);
    if (duskT > 0) sky = lerpColor(sky, PALETTE.skyDusk, duskT * 0.7);
    if (night) sky = lerpColor(sky, PALETTE.skyNight, 0.85);
    if (state.rain > 0.3) sky = lerpColor(sky, new THREE.Color(0x5a6672), state.rain * 0.6);
    scene.background = sky;
    scene.fog.color.copy(sky);
    scene.fog.near = state.rain > 0.3 ? 60 : 120;
    scene.fog.far = state.rain > 0.3 ? 300 : 520;
    sun.intensity = night ? 0.25 : 1.6 - duskT * 0.7 - state.rain * 0.7;
    sun.color.setHex(night ? 0x8899ff : duskT > 0.4 ? PALETTE.sunDusk : PALETTE.sunNoon);
    sun.position.set(Math.cos((hour / 24) * Math.PI * 2) * 160, 120 + Math.sin((hour / 24) * Math.PI * 2) * 80, 60);
    hemi.intensity = night ? 0.25 : 0.7 - state.rain * 0.3;
    ambient.intensity = night ? 0.35 : 0.25;

    // Wet roads in the rain.
    world.roadMat.color.setHex(state.rain > 0.4 ? PALETTE.roadWet : PALETTE.road);

    // Neon + windows + lamps at night.
    const nightGlow = night ? 1 : duskT * 0.6;
    for (const sign of world.neonSigns) {
      sign.mat.color.setHex(sign.base);
    }
    for (const b of world.buildings) b.mat.emissiveIntensity = nightGlow * 0.55;
    for (const lamp of world.lampMeshes) lamp.material.color.setHex(night || duskT > 0.5 ? 0xffe9a8 : 0x444444);

    // Sea swell.
    const pos = world.sea.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const bx = seaBase[i * 3];
      const by = seaBase[i * 3 + 1];
      pos.setZ(i, Math.sin(bx * 0.08 + state.elapsed * 1.2) * 0.5 + Math.cos(by * 0.06 + state.elapsed * 0.9) * 0.4);
    }
    pos.needsUpdate = true;

    // Lighthouse beam sweeps.
    world.lighthouseBeam.rotation.y = state.elapsed * 0.4;
    world.lighthouseBeam.material.opacity = night ? 0.22 : 0.06;

    // Rain falls around the camera.
    if (state.rain > 0.05) {
      world.rainPoints.visible = true;
      world.rainMat.opacity = state.rain * 0.75;
      const rp = world.rainPoints.geometry.attributes.position;
      const cx = player.x; const cz = player.z;
      for (let i = 0; i < rp.count; i += 1) {
        let y = rp.getY(i) - 38 * (1 / 60);
        if (y < 0) y = 40;
        rp.setY(i, y);
        rp.setX(i, cx + ((rp.getX(i) - cx + 60) % 120 + 120) % 120 - 60);
        rp.setZ(i, cz + ((rp.getZ(i) - cz + 60) % 120 + 120) % 120 - 60);
      }
      rp.needsUpdate = true;
      world.rainPoints.position.set(0, 0, 0);
    } else {
      world.rainPoints.visible = false;
    }

    // Beacon pulse.
    if (world.beacon.visible) {
      const s = 1 + Math.sin(state.elapsed * 4) * 0.15;
      world.beacon.scale.set(s, 1, s);
      world.beaconRing.scale.setScalar(1 + Math.sin(state.elapsed * 4) * 0.2);
    }

    // Briefcase glint.
    for (const b of world.briefcases) {
      if (!b.found) b.mesh.rotation.y += 0.02;
    }

    // Camera: third-person orbit on foot, chase cam in a car, wide on the boat.
    const focusX = player.x;
    const focusZ = player.z;
    const focusY = state.playerY + (state.driving ? 1.5 : 1.8);
    const dist = state.driving ? 13 : state.inBoat ? 16 : state.camDist;
    const yaw = state.driving ? state.carAngle + Math.PI : state.camYaw;
    // The chase cam is deliberately flatter than the on-foot orbit so the
    // road ahead — and a hunting helicopter — stay in frame.
    const pitch = state.driving ? 0.2 : state.camPitch;
    camera.position.set(
      focusX + Math.sin(yaw) * Math.cos(pitch) * dist,
      focusY + Math.sin(pitch) * dist + 2,
      focusZ + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    camera.lookAt(focusX, focusY, focusZ);
    if (state.shotFlash > 0) {
      camera.position.x += (Math.random() - 0.5) * 0.2;
      camera.position.y += (Math.random() - 0.5) * 0.2;
    }

    renderer.render(scene, camera);
  }

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  function getSave() {
    return {
      cash: state.cash,
      jobsDone: state.jobsDone,
      briefcasesFound: state.briefcasesFound,
      bestStunt: state.bestStunt,
      taxiJobsDone: state.taxiJobsDone,
      garageUpgrades: state.garageUpgrades,
    };
  }

  function applySave(save) {
    if (!save) return;
    state.cash = save.cash ?? state.cash;
    state.jobsDone = save.jobsDone ?? 0;
    state.briefcasesFound = save.briefcasesFound ?? 0;
    state.bestStunt = save.bestStunt ?? 0;
    state.taxiJobsDone = save.taxiJobsDone ?? 0;
    state.garageUpgrades = save.garageUpgrades ?? 0;
    for (let i = 0; i < Math.min(state.briefcasesFound, world.briefcases.length); i += 1) {
      world.briefcases[i].found = true;
      world.briefcases[i].mesh.visible = false;
    }
  }

  const game = {
    state, player, world, audio, renderer, scene, camera,
    step, render, resize, msg, setWanted, setBeacon, enterCar, exitCar,
    respawn, getSave, applySave, startTaxi, endTaxi,
    garageRepair, garageRepaint, garageUnderglow, garageSpoiler,
    missions: null,
    saveProgress: null,
  };
  return game;
}
