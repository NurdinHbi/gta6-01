// Solmar City: the procedural coastal city, vehicles, pedestrians, police,
// helicopter, boat, wanted level and combat. All geometry is generated from
// the seed at boot; nothing is loaded from disk or the network.
import * as THREE from 'three';
import {
  CITY, DAY, DAY_LENGTH, PLAYER, WEAPONS, WANTED, TRAFFIC_CARS, PARKED_CARS,
  PEDESTRIANS, BRIEFCASES, STUNT_RAMPS, BRIEFCASE_REWARD, STUNT_REWARD,
  PALETTE, JOBS,
} from './config.js';
import { range, int, pick, shuffle } from './random.js';

const PITCH = CITY.block + CITY.road; // 38
const AVENUES = [];
for (let k = -5; k <= 5; k += 1) AVENUES.push(k * PITCH);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function skyFor(hour) {
  // Returns [background hex, sun hex, sun intensity, hemi intensity].
  if (hour < 5 || hour >= 21) return [PALETTE.skyNight, 0x8fa3ff, 0.12, 0.25];
  if (hour < 7) {
    const t = (hour - 5) / 2;
    return [linterpColor(PALETTE.skyNight, PALETTE.skyDawn, t), lerpColor(PALETTE.sunDusk, 0xffd9a0, t), lerp(0.12, 0.7, t), lerp(0.25, 0.5, t)];
  }
  if (hour < 10) {
    const t = (hour - 7) / 3;
    return [linterpColor(PALETTE.skyDawn, PALETTE.skyNoon, t), lerpColor(0xffd9a0, PALETTE.sunNoon, t), lerp(0.7, 1.15, t), lerp(0.5, 0.75, t)];
  }
  if (hour < 16) return [PALETTE.skyNoon, PALETTE.sunNoon, 1.15, 0.75];
  if (hour < 19) {
    const t = (hour - 16) / 3;
    return [linterpColor(PALETTE.skyNoon, PALETTE.skyDusk, t), lerpColor(PALETTE.sunNoon, PALETTE.sunDusk, t), lerp(1.15, 0.75, t), lerp(0.75, 0.5, t)];
  }
  if (hour < 21) {
    const t = (hour - 19) / 2;
    return [linterpColor(PALETTE.skyDusk, PALETTE.skyNight, t), lerpColor(PALETTE.sunDusk, 0x8fa3ff, t), lerp(0.75, 0.12, t), lerp(0.5, 0.25, t)];
  }
  return [PALETTE.skyNight, 0x8fa3ff, 0.12, 0.25];
}

function lerpColor(a, b, t) {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return ca.lerp(cb, t).getHex();
}

function linterpColor(a, b, t) {
  return lerpColor(a, b, t);
}

const LANDMARKS = {
  tower: { x: 19, z: 19, w: 22, d: 22, h: 96, name: 'Solmar Tower' },
  bank: { x: 57, z: -19, w: 20, d: 16, h: 22, name: 'First Solmar Bank' },
  casino: { x: -57, z: 133, w: 26, d: 20, h: 26, name: 'Grand Solmar' },
  stadium: { x: -152, z: -114, w: 30, d: 22, h: 16, name: 'Stadium' },
};

function blockCenter(bx, bz) {
  return { x: (bx + 0.5) * PITCH, z: (bz + 0.5) * PITCH };
}

function isLandmarkBlock(bx, bz) {
  const c = blockCenter(bx, bz);
  return Object.values(LANDMARKS).some((lm) => Math.abs(lm.x - c.x) < 20 && Math.abs(lm.z - c.z) < 20);
}

export function createWorld(canvas, rng, audio) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyNoon);
  scene.fog = new THREE.Fog(0x87b5e0, 180, 520);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a3230, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sunNoon, 1.15);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x404050, 0.35));

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
  const sphereGeo = new THREE.SphereGeometry(1, 10, 8);
  const coneGeo = new THREE.ConeGeometry(1, 1, 8);
  const planeGeo = new THREE.PlaneGeometry(1, 1);

  const matCache = new Map();
  function mat(color, opts = {}) {
    const key = `${color}|${opts.emissive || ''}|${opts.transparent || ''}`;
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
    return matCache.get(key);
  }
  function box(w, h, d, color, x, y, z, opts) {
    const m = new THREE.Mesh(boxGeo, mat(color, opts));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  }

  // ---- ground: asphalt city, sand beach, moving sea -----------------------
  const ground = new THREE.Mesh(planeGeo, mat(PALETTE.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.scale.set(420, 420, 1);
  ground.position.set(0, 0, 0);
  scene.add(ground);

  const beach = new THREE.Mesh(planeGeo, mat(PALETTE.sand));
  beach.rotation.x = -Math.PI / 2;
  beach.scale.set(16, 420, 1);
  beach.position.set(-183, 0.05, 0);
  scene.add(beach);

  const sea = new THREE.Mesh(planeGeo, new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.94 }));
  sea.rotation.x = -Math.PI / 2;
  sea.scale.set(320, 460, 1);
  sea.position.set(-350, 0.12, 0);
  scene.add(sea);

  // Avenue centre lines and sidewalks.
  for (const a of AVENUES) {
    const lineV = box(0.5, 0.02, 400, 0xd8b13a, a, 0.08, 0);
    lineV.scale.set(0.5, 0.02, 400);
    const lineH = box(400, 0.02, 0.5, 0xd8b13a, 0, 0.08, a);
    lineH.scale.set(400, 0.02, 0.5);
  }
  for (let bx = -5; bx < 5; bx += 1) {
    for (let bz = -5; bz < 5; bz += 1) {
      const c = blockCenter(bx, bz);
      const walk = box(CITY.block + 2, 0.12, CITY.block + 2, PALETTE.sidewalk, c.x, 0.06, c.z);
      walk.scale.set(CITY.block + 2, 0.12, CITY.block + 2);
    }
  }

  // ---- buildings ----------------------------------------------------------
  const colliders = []; // {x0,z0,x1,z1}
  const buildings = [];
  const buildingMats = PALETTE.building.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const windowMat = new THREE.MeshLambertMaterial({ color: 0x1c2733, emissive: 0x0a1420 });
  const tankMat = new THREE.MeshLambertMaterial({ color: 0x9aa4a8 });

  function addBuilding(x, z, w, d, h, material, name) {
    const m = new THREE.Mesh(boxGeo, material);
    m.scale.set(w, h, d);
    m.position.set(x, h / 2 + 0.12, z);
    scene.add(m);
    // Window band: a slightly inset darker box near the top reads as glazing.
    const band = new THREE.Mesh(boxGeo, windowMat);
    band.scale.set(w * 0.92, Math.min(2.2, h * 0.12), d * 0.92);
    band.position.set(x, h * 0.82, z);
    scene.add(band);
    colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
    buildings.push({ x, z, w, d, h, mesh: m, name: name || '' });
    return m;
  }

  // Landmarks first, so they are never overwritten by generic blocks.
  const towerMat = new THREE.MeshLambertMaterial({ color: 0x4a5a70, emissive: 0x0a1626 });
  addBuilding(LANDMARKS.tower.x, LANDMARKS.tower.z, 22, 22, 96, towerMat, 'Solmar Tower');
  const towerCrown = box(10, 4, 10, 0x2a3648, LANDMARKS.tower.x, 98, LANDMARKS.tower.z);
  const towerBeacon = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xff2d55 }));
  towerBeacon.scale.setScalar(1.2);
  towerBeacon.position.set(LANDMARKS.tower.x, 101, LANDMARKS.tower.z);
  scene.add(towerBeacon);
  // Rooftop platform (the heist roof) with a glowing pad.
  const roofPad = box(12, 0.4, 12, 0x3a3f47, LANDMARKS.tower.x, 96.3, LANDMARKS.tower.z);
  const casinoMat = new THREE.MeshLambertMaterial({ color: 0x7a2a4a, emissive: 0x2a0a1a });
  addBuilding(LANDMARKS.casino.x, LANDMARKS.casino.z, 26, 20, 26, casinoMat, 'Grand Solmar');
  addBuilding(LANDMARKS.bank.x, LANDMARKS.bank.z, 20, 16, 22, new THREE.MeshLambertMaterial({ color: 0xb8a888 }), 'First Solmar Bank');
  addBuilding(LANDMARKS.stadium.x, LANDMARKS.stadium.z, 30, 22, 16, new THREE.MeshLambertMaterial({ color: 0x5a6e8c }), 'Stadium');
  // Casino neon sign and bank columns.
  const neonSigns = [];
  PALETTE.neon.forEach((c, i) => {
    const sign = box(6, 1.6, 0.4, c, LANDMARKS.casino.x - 8 + i * 4, 24 + (i % 2) * 2, LANDMARKS.casino.z - 10.2, { emissive: c });
    neonSigns.push(sign);
  });
  for (let i = -1; i <= 1; i += 1) box(1.2, 12, 1.2, 0xd8cdb8, LANDMARKS.bank.x + i * 6, 6, LANDMARKS.bank.z - 8.6);

  // Generic blocks: ~150 buildings in a dozen styles and heights.
  let buildingCount = 4;
  for (let bx = -5; bx < 5; bx += 1) {
    for (let bz = -5; bz < 5; bz += 1) {
      if (isLandmarkBlock(bx, bz)) continue;
      if (rng() < 0.08) continue; // plaza / empty lot
      const c = blockCenter(bx, bz);
      const n = int(rng, 1, 2);
      for (let i = 0; i < n; i += 1) {
        const w = range(rng, 8, 16);
        const d = range(rng, 8, 16);
        const h = pick(rng, [6, 9, 12, 15, 20, 26, 34, 44]);
        const x = c.x + range(rng, -6, 6);
        const z = c.z + range(rng, -6, 6);
        addBuilding(x, z, w, d, h, pick(rng, buildingMats));
        buildingCount += 1;
        if (rng() < 0.35) {
          // Rooftop water tank.
          const tank = new THREE.Mesh(cylGeo, tankMat);
          tank.scale.set(1.4, 2.2, 1.4);
          tank.position.set(x + w * 0.2, h + 1.2, z - d * 0.2);
          scene.add(tank);
        }
        if (rng() < 0.22) {
          // Billboard on the roof edge.
          box(w * 0.7, 3, 0.3, pick(rng, PALETTE.neon), x, h + 2.4, z + d / 2 + 0.2, { emissive: 0x223344 });
        }
      }
    }
  }

  // ---- street furniture: lamps, palms, benches, traffic lights ------------
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lampGlowOff = new THREE.MeshLambertMaterial({ color: 0x555544 });
  const lamps = [];
  for (const a of AVENUES) {
    for (let s = -152; s <= 152; s += 76) {
      const pole = new THREE.Mesh(cylGeo, lampMat);
      pole.scale.set(0.18, 7, 0.18);
      pole.position.set(a + 5.4, 3.5, s);
      scene.add(pole);
      const bulb = new THREE.Mesh(sphereGeo, lampGlowOff);
      bulb.scale.setScalar(0.55);
      bulb.position.set(a + 5.4, 7.1, s);
      scene.add(bulb);
      lamps.push(bulb);
    }
  }
  // Palms along the beachfront.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2e7d4a });
  for (let z = -180; z <= 180; z += 24) {
    const x = -178 + range(rng, -1, 1);
    const trunk = new THREE.Mesh(cylGeo, trunkMat);
    trunk.scale.set(0.35, 7, 0.35);
    trunk.position.set(x, 3.5, z);
    trunk.rotation.z = 0.12;
    scene.add(trunk);
    const fronds = new THREE.Mesh(coneGeo, frondMat);
    fronds.scale.set(3.2, 2.4, 3.2);
    fronds.position.set(x + 0.8, 7.6, z);
    scene.add(fronds);
  }
  // Benches on sidewalks.
  for (let i = 0; i < 18; i += 1) {
    const a = pick(rng, AVENUES);
    const b = range(rng, -160, 160);
    box(2.4, 0.5, 0.9, 0x7a5a34, a + 5.6, 0.5, b);
  }

  // Traffic lights at the four central intersections.
  const trafficLights = [];
  for (const [ix, iz] of [[-38, -38], [38, -38], [-38, 38], [38, 38]]) {
    const pole = new THREE.Mesh(cylGeo, lampMat);
    pole.scale.set(0.2, 6, 0.2);
    pole.position.set(ix + 5, 3, iz + 5);
    scene.add(pole);
    const head = box(0.9, 2.4, 0.9, 0x111111, ix + 5, 6.4, iz + 5);
    const red = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.scale.setScalar(0.32);
    red.position.set(ix + 5, 7.1, iz + 4.5);
    scene.add(red);
    const green = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0x22ff66 }));
    green.scale.setScalar(0.32);
    green.position.set(ix + 5, 5.9, iz + 4.5);
    scene.add(green);
    trafficLights.push({ red, green });
  }

  // ---- pier, marina, lighthouse -------------------------------------------
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x6b4e2e });
  for (let x = -176; x >= -228; x -= 4) {
    const plank = box(4.2, 0.5, 8, 0x6b4e2e, x, 1.0, 62);
    void plank;
  }
  // Broken pier ramp at the end (the stunt jump), with a gap past it.
  const rampMesh = box(7, 0.6, 9, 0x8a6a3a, -232, 1.6, 62);
  rampMesh.rotation.z = -0.38;
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
  const lightTower = new THREE.Mesh(cylGeo, lightMat);
  lightTower.scale.set(2.2, 26, 2.2);
  lightTower.position.set(-238, 13, 178);
  scene.add(lightTower);
  const lightTop = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  lightTop.scale.setScalar(1.8);
  lightTop.position.set(-238, 26.5, 178);
  scene.add(lightTop);
  colliders.push({ x0: -240.5, z0: 175.5, x1: -235.5, z1: 180.5 });

  // Marina: wooden dock + moored boats.
  for (let z = -64; z <= -16; z += 6) box(3, 0.5, 6, 0x6b4e2e, -196, 1.0, z);
  const boatMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const boatHullMat = new THREE.MeshLambertMaterial({ color: 0x2a6ea8 });
  function makeBoatMesh() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(boxGeo, boatHullMat);
    hull.scale.set(7, 1.2, 2.6);
    hull.position.y = 0.6;
    g.add(hull);
    const deck = new THREE.Mesh(boxGeo, boatMat);
    deck.scale.set(5, 0.8, 2);
    deck.position.y = 1.4;
    g.add(deck);
    const mast = new THREE.Mesh(cylGeo, lampMat);
    mast.scale.set(0.12, 3.4, 0.12);
    mast.position.set(-0.5, 3, 0);
    g.add(mast);
    return g;
  }
  const mooredBoats = [];
  for (let i = 0; i < 4; i += 1) {
    const b = makeBoatMesh();
    b.position.set(-206 - i * 2, 0.2, -56 + i * 12);
    b.rotation.y = Math.PI / 2 + range(rng, -0.2, 0.2);
    scene.add(b);
    mooredBoats.push(b);
  }

  // ---- vehicles ------------------------------------------------------------
  function makeCarMesh(color, police) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: police ? 0x111418 : color });
    const body = new THREE.Mesh(boxGeo, bodyMat);
    body.scale.set(4.4, 0.85, 2.0);
    body.position.y = 0.65;
    g.add(body);
    const cabin = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: police ? 0xf2f2f2 : 0x1a2530 }));
    cabin.scale.set(2.2, 0.75, 1.8);
    cabin.position.set(-0.2, 1.4, 0);
    g.add(cabin);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
    for (const [wx, wz] of [[1.5, 0.95], [1.5, -0.95], [-1.5, 0.95], [-1.5, -0.95]]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.42, wz);
      g.add(wheel);
    }
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
    for (const wz of [0.7, -0.7]) {
      const hl = new THREE.Mesh(boxGeo, headMat);
      hl.scale.set(0.15, 0.3, 0.5);
      hl.position.set(2.22, 0.7, wz);
      g.add(hl);
    }
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    for (const wz of [0.7, -0.7]) {
      const tl = new THREE.Mesh(boxGeo, tailMat);
      tl.scale.set(0.15, 0.3, 0.5);
      tl.position.set(-2.22, 0.7, wz);
      g.add(tl);
    }
    let lightBar = null;
    if (police) {
      lightBar = new THREE.Group();
      const r = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      r.scale.set(0.7, 0.25, 0.6);
      r.position.set(0, 0, 0.5);
      const b = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x2244ff }));
      b.scale.set(0.7, 0.25, 0.6);
      b.position.set(0, 0, -0.5);
      lightBar.add(r);
      lightBar.add(b);
      lightBar.position.set(-0.2, 1.9, 0);
      lightBar.userData = { r, b };
      g.add(lightBar);
    }
    // One spotlight for the player's headlights at night; attached on demand.
    const headlight = new THREE.SpotLight(0xffeebb, 0, 60, 0.55, 0.5, 1.2);
    headlight.position.set(2.2, 0.9, 0);
    const headTarget = new THREE.Object3D();
    headTarget.position.set(14, 0, 0);
    g.add(headTarget);
    headlight.target = headTarget;
    g.add(headlight);
    g.userData = { lightBar, headlight };
    return g;
  }

  function roadSpot() {
    const a = pick(rng, AVENUES);
    const along = range(rng, -160, 160);
    const side = rng() < 0.5 ? 5.2 : -5.2;
    return { x: a + side, z: along, angle: 0, alongRoad: 'z' };
  }

  // A parked car must never spawn wedged inside a building: the driving
  // collision pushes it out every step and kills its speed, so the car can
  // never move. Try spots until one is clear of every building collider.
  function spotClear(x, z, r) {
    for (const c of colliders) {
      const nx = Math.max(c.x0, Math.min(x, c.x1));
      const nz = Math.max(c.z0, Math.min(z, c.z1));
      const dx = x - nx;
      const dz = z - nz;
      if (dx * dx + dz * dz < r * r) return false;
    }
    return true;
  }

  const parkedCars = [];
  for (let i = 0; i < PARKED_CARS; i += 1) {
    let spot = roadSpot();
    let tries = 0;
    while (!spotClear(spot.x, spot.z, 3.2) && tries < 24) {
      spot = roadSpot();
      tries += 1;
    }
    const mesh = makeCarMesh(pick(rng, PALETTE.car), false);
    mesh.position.set(spot.x, 0, spot.z);
    mesh.rotation.y = -Math.PI / 2;
    scene.add(mesh);
    parkedCars.push({ x: spot.x, z: spot.z, angle: 0, speed: 0, health: 100, wrecked: false, mesh, police: false, parked: true, stolen: false, smoke: 0 });
  }
  const trafficCars = [];
  for (let i = 0; i < TRAFFIC_CARS; i += 1) {
    const a = pick(rng, AVENUES);
    const mesh = makeCarMesh(pick(rng, PALETTE.car), false);
    scene.add(mesh);
    trafficCars.push({
      x: a + 1.5, z: range(rng, -160, 160), angle: rng() < 0.5 ? 0 : Math.PI,
      avenue: a, dir: rng() < 0.5 ? 1 : -1, speed: range(rng, 8, 12), health: 100,
      wrecked: false, mesh, police: false, parked: false, axis: 'z', smoke: 0,
    });
    trafficCars[trafficCars.length - 1].cruise = trafficCars[trafficCars.length - 1].speed;
  }

  // ---- pedestrians ---------------------------------------------------------
  const pedShirts = [0xc23b2e, 0x2e6fc2, 0x3aa655, 0xe0a92e, 0x7a4fd0, 0xdddddd, 0xd06a2e, 0x2a9d8f];
  const peds = [];
  for (let i = 0; i < PEDESTRIANS; i += 1) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: pick(rng, pedShirts) }));
    body.scale.set(0.7, 1.1, 0.45);
    body.position.y = 1.15;
    g.add(body);
    const head = new THREE.Mesh(sphereGeo, new THREE.MeshLambertMaterial({ color: 0xd8a878 }));
    head.scale.setScalar(0.32);
    head.position.y = 1.95;
    g.add(head);
    const legs = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x222831 }));
    legs.scale.set(0.6, 0.7, 0.4);
    legs.position.y = 0.35;
    g.add(legs);
    const ax = AVENUES[Math.floor(rng() * AVENUES.length)];
    const x = rng() < 0.5 ? ax + 5.2 : range(rng, -170, 170);
    const z = rng() < 0.5 ? range(rng, -170, 170) : ax + 5.2;
    g.position.set(x, 0.12, z);
    scene.add(g);
    peds.push({
      x, z, angle: range(rng, 0, Math.PI * 2), speed: range(rng, 1.0, 1.6),
      tx: x, tz: z, mesh: g, alive: true, scatter: 0, down: 0,
    });
  }

  // ---- police, helicopter, roadblocks --------------------------------------
  const cops = [];
  function makeCopMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x1a2a4a }));
    body.scale.set(0.75, 1.15, 0.5);
    body.position.y = 1.15;
    g.add(body);
    const head = new THREE.Mesh(sphereGeo, new THREE.MeshLambertMaterial({ color: 0xd8a878 }));
    head.scale.setScalar(0.32);
    head.position.y = 1.95;
    g.add(head);
    const cap = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x0e1a30 }));
    cap.scale.set(0.7, 0.18, 0.7);
    cap.position.y = 2.2;
    g.add(cap);
    scene.add(g);
    return g;
  }
  const cruisers = [];
  const heliGroup = new THREE.Group();
  const heliBody = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x223344 }));
  heliBody.scale.set(5, 1.8, 2.4);
  heliGroup.add(heliBody);
  const rotor = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x111111 }));
  rotor.scale.set(9, 0.15, 0.5);
  rotor.position.y = 1.2;
  heliGroup.add(rotor);
  const searchCone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.22 }));
  searchCone.scale.set(6, 40, 6);
  searchCone.position.y = -20;
  searchCone.rotation.x = Math.PI;
  heliGroup.add(searchCone);
  heliGroup.visible = false;
  scene.add(heliGroup);

  const roadblockGroup = new THREE.Group();
  roadblockGroup.visible = false;
  scene.add(roadblockGroup);
  const roadblocks = [];

  // ---- briefcases and stunt ramps ------------------------------------------
  const briefcaseMeshes = [];
  const briefcaseSpots = [
    [19, 96.6, 19], [-196, 1.4, 78], [-152, 1.0, -96], [57, 1.0, -32], [-57, 1.0, 148],
    [150, 1.0, -138], [-120, 1.0, 164], [95, 1.0, 95], [-95, 1.0, -150], [24, 1.0, 140],
  ];
  const briefcases = [];
  for (let i = 0; i < BRIEFCASES; i += 1) {
    const [x, y, z] = briefcaseSpots[i % briefcaseSpots.length];
    const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6a5200 }));
    m.scale.set(1.1, 0.7, 0.35);
    m.position.set(x, y, z);
    scene.add(m);
    briefcaseMeshes.push(m);
    briefcases.push({ x, y, z, found: false, mesh: m });
  }
  const ramps = [
    { x: -232, z: 62, dirX: -1, dirZ: 0, used: false },
    { x: -152, z: -88, dirX: 0, dirZ: -1, used: false },
    { x: 120, z: -168, dirX: 0, dirZ: -1, used: false },
  ];
  for (const r of ramps) {
    const m = box(7, 0.6, 9, 0x8a6a3a, r.x, 1.6, r.z);
    m.rotation.z = r.dirX !== 0 ? -0.38 * r.dirX : 0;
    m.rotation.x = r.dirZ !== 0 ? 0.38 * r.dirZ : 0;
  }

  // ---- player --------------------------------------------------------------
  const playerGroup = new THREE.Group();
  const pBody = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x2e6fc2 }));
  pBody.scale.set(0.75, 1.1, 0.45);
  pBody.position.y = 1.15;
  playerGroup.add(pBody);
  const pHead = new THREE.Mesh(sphereGeo, new THREE.MeshLambertMaterial({ color: 0xd8a878 }));
  pHead.scale.setScalar(0.34);
  pHead.position.y = 1.95;
  playerGroup.add(pHead);
  const pLegs = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x222831 }));
  pLegs.scale.set(0.6, 0.7, 0.4);
  pLegs.position.y = 0.35;
  playerGroup.add(pLegs);
  scene.add(playerGroup);

  // Mission beacon: pulsing cylinder + vertical beam.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.7 });
  const beacon = new THREE.Mesh(cylGeo, beaconMat);
  beacon.scale.set(2.2, 30, 2.2);
  beacon.visible = false;
  scene.add(beacon);
  const beaconRing = new THREE.Mesh(new THREE.TorusGeometry(3, 0.25, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  beaconRing.rotation.x = Math.PI / 2;
  beaconRing.visible = false;
  scene.add(beaconRing);

  // The player's speedboat and the smuggler's boat.
  const playerBoat = makeBoatMesh();
  playerBoat.position.set(-206, 0.2, -40);
  scene.add(playerBoat);
  const smugglerBoat = makeBoatMesh();
  smugglerBoat.children[0].material = new THREE.MeshLambertMaterial({ color: 0x8a1a1a });
  smugglerBoat.position.set(-280, 0.2, -140);
  scene.add(smugglerBoat);

  // Muzzle flash + tracer, reused for every shot.
  const flash = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  flash.scale.setScalar(0.001);
  scene.add(flash);
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  const tracer = new THREE.Mesh(boxGeo, tracerMat);
  tracer.scale.set(0.001, 0.001, 0.001);
  scene.add(tracer);

  // Smoke puffs for wrecked cars.
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.5 });
  const smokePuffs = [];
  for (let i = 0; i < 12; i += 1) {
    const s = new THREE.Mesh(sphereGeo, smokeMat);
    s.scale.setScalar(0.001);
    scene.add(s);
    smokePuffs.push({ mesh: s, life: 0 });
  }
  let smokeIndex = 0;
  function puff(x, y, z) {
    const p = smokePuffs[smokeIndex];
    smokeIndex = (smokeIndex + 1) % smokePuffs.length;
    p.mesh.position.set(x, y, z);
    p.mesh.scale.setScalar(1.4);
    p.life = 1.4;
  }

  return {
    scene, camera, renderer, sun, hemi, sea, lamps, lampGlowMat, lampGlowOff,
    neonSigns, trafficLights, towerBeacon, mooredBoats, parkedCars, trafficCars,
    peds, cops, cruisers, heliGroup, rotor, searchCone, roadblockGroup, roadblocks,
    briefcases, ramps, playerGroup, beacon, beaconRing, playerBoat, smugglerBoat,
    flash, tracer, colliders, buildings, buildingCount, makeCarMesh, makeCopMesh,
    puff, smokePuffs, rng, audio, box, mat,
  };
}

// ---------------------------------------------------------------------------
// Game state and simulation on top of the built scene.
// ---------------------------------------------------------------------------
import {
  CITY as _CITY, DAY as _DAY, DAY_LENGTH as _DAY_LENGTH, PLAYER as _PLAYER,
  WEAPONS as _WEAPONS, WANTED as _WANTED, BRIEFCASE_REWARD as _BRIEF_REWARD,
  STUNT_REWARD as _STUNT_REWARD, BUSTED_LOSS as _BUSTED_LOSS,
} from './config.js';
import { ACTION_CAMERA, ACTION_ENTER, ACTION_PUNCH, ACTION_RELOAD, ACTION_SHOOT, ACTION_WEAPON_1, ACTION_WEAPON_2, ACTION_WEAPON_3 } from './input.js';

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function angleTo(ax, az, bx, bz) {
  return Math.atan2(bx - ax, bz - az);
}

function collideCircle(w, x, z, r) {
  // Push a circle out of every building AABB; returns the corrected position.
  let px = x;
  let pz = z;
  for (const c of w.colliders) {
    const nx = clamp(px, c.x0, c.x1);
    const nz = clamp(pz, c.z0, c.z1);
    const dx = px - nx;
    const dz = pz - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        px = nx + (dx / d) * r;
        pz = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pl = px - c.x0;
        const pr = c.x1 - px;
        const pt = pz - c.z0;
        const pb = c.z1 - pz;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) px = c.x0 - r;
        else if (m === pr) px = c.x1 + r;
        else if (m === pt) pz = c.z0 - r;
        else pz = c.z1 + r;
      }
    }
  }
  return { x: px, z: pz };
}

export function createGame(canvas, rng, audio) {
  const w = createWorld(canvas, rng, audio);
  const T = w;

  const state = {
    timeSec: 10 * 3600, // 10:00 to start
    elapsed: 0,
    cash: _PLAYER.startCash,
    health: _PLAYER.maxHealth,
    wanted: 0,
    heat: 0, // 0..5 float behind the star display
    quietTimer: 0,
    seenTimer: 0,
    driving: false,
    inBoat: false,
    car: null, // the car the player drives
    carSpeed: 0,
    carAngle: 0,
    boatSpeed: 0,
    boatAngle: Math.PI / 2,
    weaponIndex: 0,
    mag: _WEAPONS.map((wp) => wp.mag),
    reserve: _WEAPONS.map((wp) => wp.ammo),
    reloading: 0,
    reloadWeapon: -1,
    shootCooldown: 0,
    punchCooldown: 0,
    camYaw: Math.PI,
    camPitch: 0.32,
    camDist: 13,
    camFar: false,
    messages: [],
    jobsDone: 0,
    briefcasesFound: 0,
    bestStunt: 0,
    freeRoam: false,
    over: null, // 'busted' | 'wasted' | null
    airTime: 0,
    airborne: false,
    carVy: 0,
    carY: 0,
    jumpSpeed: 0,
    onRoof: false,
    flashTimer: 0,
    tracerTimer: 0,
    engineOn: false,
    sirenOn: false,
    playerY: 0,
    vy: 0,
  };

  const player = {
    x: _PLAYER.startX, z: _PLAYER.startZ, angle: Math.PI, speed: 0,
  };

  function msg(text) {
    state.messages.push(text);
    if (state.messages.length > 5) state.messages.shift();
  }

  function addCash(n) {
    state.cash += n;
  }

  function raiseWanted(n, reason) {
    const before = state.wanted;
    state.heat = Math.min(_WANTED.max, state.heat + n);
    state.wanted = Math.ceil(state.heat);
    state.quietTimer = 0;
    if (state.wanted > before) msg(`Wanted level ${state.wanted} star${state.wanted > 1 ? 's' : ''} — ${reason}`);
  }

  function nearestCar(maxD) {
    let best = null;
    let bestD = maxD;
    for (const c of [...w.parkedCars, ...w.trafficCars]) {
      if (c.wrecked) continue;
      const d = dist2d(player.x, player.z, c.x, c.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  function enterCar(car) {
    state.driving = true;
    state.car = car;
    state.carAngle = car.angle;
    state.carSpeed = 0;
    state.carY = 0;
    car.parked = false;
    if (!car.stolen) {
      car.stolen = true;
      raiseWanted(_WANTED.steal, 'grand theft auto');
      msg('You stole the car. The cops noticed.');
    } else {
      msg('You got in the car.');
    }
    audio.unlock();
  }

  function exitCar() {
    if (!state.car) return;
    const car = state.car;
    player.x = car.x + Math.sin(car.angle + Math.PI / 2) * 2.2;
    player.z = car.z + Math.cos(car.angle + Math.PI / 2) * 2.2;
    player.angle = car.angle;
    state.driving = false;
    state.car = null;
    state.carSpeed = 0;
    state.engineOn = false;
  }

  function spawnCop() {
    if (w.cops.length >= 6) return;
    const mesh = w.makeCopMesh();
    const a = rng() * Math.PI * 2;
    const x = clamp(player.x + Math.cos(a) * 26, -175, 175);
    const z = clamp(player.z + Math.sin(a) * 26, -175, 175);
    mesh.position.set(x, 0.12, z);
    w.cops.push({ x, z, angle: a, health: 50, mesh, hitTimer: 0 });
  }

  function spawnCruiser() {
    if (w.cruisers.length >= 3) return;
    const mesh = w.makeCarMesh(0, true);
    w.scene.add(mesh);
    const a = rng() * Math.PI * 2;
    const x = clamp(player.x + Math.cos(a) * 42, -175, 175);
    const z = clamp(player.z + Math.sin(a) * 42, -175, 175);
    mesh.position.set(x, 0, z);
    w.cruisers.push({ x, z, angle: a, speed: 0, health: 120, wrecked: false, mesh, police: true, parked: false, smoke: 0 });
  }

  function spawnRoadblocks() {
    if (w.roadblocks.length > 0) return;
    const spots = [
      { x: player.x + 40, z: player.z, angle: 0 },
      { x: player.x - 40, z: player.z, angle: 0 },
      { x: player.x, z: player.z + 40, angle: Math.PI / 2 },
      { x: player.x, z: player.z - 40, angle: Math.PI / 2 },
    ];
    for (const s of spots) {
      const g = new THREE.Group();
      for (let i = -1; i <= 1; i += 1) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 0.5), new THREE.MeshLambertMaterial({ color: i === 0 ? 0xd83a2a : 0xf2f2f2 }));
        bar.position.set(i * 3.6, 0.7, 0);
        g.add(bar);
      }
      g.position.set(clamp(s.x, -175, 175), 0, clamp(s.z, -175, 175));
      g.rotation.y = s.angle;
      w.scene.add(g);
      w.roadblocks.push({ x: g.position.x, z: g.position.z, mesh: g });
      w.colliders.push({ x0: g.position.x - 5, z0: g.position.z - 1, x1: g.position.x + 5, z1: g.position.z + 1 });
    }
    msg('Roadblocks across the avenues!');
  }

  function clearRoadblocks() {
    for (const rb of w.roadblocks) {
      w.scene.remove(rb.mesh);
      const idx = w.colliders.findIndex((c) => Math.abs(c.x0 - (rb.x - 5)) < 0.01 && Math.abs(c.z0 - (rb.z - 1)) < 0.01);
      if (idx >= 0) w.colliders.splice(idx, 1);
    }
    w.roadblocks.length = 0;
  }

  function fireWeapon() {
    const wp = _WEAPONS[state.weaponIndex];
    if (state.reloading > 0 || state.shootCooldown > 0) return;
    if (state.mag[state.weaponIndex] <= 0) {
      reloadWeapon();
      return;
    }
    state.mag[state.weaponIndex] -= 1;
    state.shootCooldown = wp.rate;
    audio.gunshot(state.weaponIndex);
    state.flashTimer = 0.06;
    state.tracerTimer = 0.09;
    raiseWanted(_WANTED.shootPublic, 'shots fired in public');
    for (const ped of w.peds) if (ped.alive) ped.scatter = 3;
    const ox = player.x;
    const oz = player.z;
    const pellets = wp.pellets || 1;
    for (let p = 0; p < pellets; p += 1) {
      const spread = (rng() - 0.5) * 2 * wp.spread;
      const aim = player.angle + spread;
      const dx = Math.sin(aim);
      const dz = Math.cos(aim);
      // Nearest target roughly in the firing cone.
      let best = null;
      let bestD = wp.range;
      const consider = (tx, tz, obj, kind) => {
        const vx = tx - ox;
        const vz = tz - oz;
        const d = Math.sqrt(vx * vx + vz * vz);
        if (d > wp.range || d < 0.5) return;
        const dot = (vx * dx + vz * dz) / d;
        if (dot < 0.965) return;
        if (d < bestD) {
          bestD = d;
          best = { obj, kind, d };
        }
      };
      for (const ped of w.peds) if (ped.alive) consider(ped.x, ped.z, ped, 'ped');
      for (const cop of w.cops) consider(cop.x, cop.z, cop, 'cop');
      for (const car of [...w.parkedCars, ...w.trafficCars, ...w.cruisers]) {
        if (!car.wrecked) consider(car.x, car.z, car, 'car');
      }
      if (best) {
        if (best.kind === 'ped') {
          best.obj.alive = false;
          best.obj.down = 6;
          best.obj.mesh.rotation.z = Math.PI / 2;
          raiseWanted(_WANTED.hitPed, 'pedestrian down');
          msg('Pedestrian down. Witnesses are calling it in.');
        } else if (best.kind === 'cop') {
          best.obj.health -= wp.damage;
          if (best.obj.health <= 0) {
            w.scene.remove(best.obj.mesh);
            w.cops.splice(w.cops.indexOf(best.obj), 1);
            raiseWanted(_WANTED.copDown, 'officer down');
            msg('Officer down. The whole city is coming for you.');
          }
        } else {
          best.obj.health -= wp.damage;
          if (best.obj.health <= 0 && !best.obj.wrecked) {
            best.obj.wrecked = true;
            best.obj.speed = 0;
            msg('That car is wrecked.');
          }
        }
        break;
      }
    }
    // Tracer end point.
    const aim0 = player.angle;
    const tx = ox + Math.sin(aim0) * wp.range;
    const tz = oz + Math.cos(aim0) * wp.range;
    w.tracer.position.set((ox + tx) / 2, 1.4, (oz + tz) / 2);
    w.tracer.scale.set(0.06, 0.06, wp.range);
    w.tracer.rotation.y = aim0;
    w.flash.position.set(ox + Math.sin(aim0) * 1.2, 1.4, oz + Math.cos(aim0) * 1.2);
    w.flash.scale.setScalar(0.7);
  }

  function reloadWeapon() {
    const i = state.weaponIndex;
    const wp = _WEAPONS[i];
    if (state.reloading > 0 || state.mag[i] >= wp.mag || state.reserve[i] <= 0) return;
    state.reloading = wp.reload;
    state.reloadWeapon = i;
    audio.reload();
  }

  function punch() {
    if (state.punchCooldown > 0) return;
    state.punchCooldown = _PLAYER.punchCooldown;
    audio.punch();
    const aim = player.angle;
    const consider = (tx, tz, obj, kind) => {
      const d = dist2d(player.x, player.z, tx, tz);
      if (d > _PLAYER.punchRange) return;
      const dot = ((tx - player.x) * Math.sin(aim) + (tz - player.z) * Math.cos(aim)) / Math.max(d, 0.01);
      if (dot < 0.5) return;
      if (kind === 'ped') {
        obj.alive = false;
        obj.down = 6;
        obj.mesh.rotation.z = Math.PI / 2;
        raiseWanted(_WANTED.hitPed, 'assault in public');
      } else {
        obj.health -= _PLAYER.punchDamage;
        if (obj.health <= 0) {
          w.scene.remove(obj.mesh);
          w.cops.splice(w.cops.indexOf(obj), 1);
          raiseWanted(_WANTED.copDown, 'officer down');
        }
      }
    };
    for (const ped of w.peds) if (ped.alive) consider(ped.x, ped.z, ped, 'ped');
    for (const cop of [...w.cops]) consider(cop.x, cop.z, cop, 'cop');
  }

  function setBeacon(x, y, z, color = 0xffd23f) {
    w.beacon.visible = true;
    w.beaconRing.visible = true;
    w.beacon.position.set(x, (y || 0) + 15, z);
    w.beaconRing.position.set(x, (y || 0) + 0.4, z);
    w.beacon.material.color.setHex(color);
    w.beaconRing.material.color.setHex(color);
    state.beacon = { x, y: y || 0, z };
  }

  function clearBeacon() {
    w.beacon.visible = false;
    w.beaconRing.visible = false;
    state.beacon = null;
  }

  function setWanted(n) {
    state.heat = n;
    state.wanted = n;
    state.quietTimer = 0;
  }

  function busted() {
    if (state.over) return;
    state.over = 'busted';
    const loss = Math.floor(state.cash * _BUSTED_LOSS);
    state.cash -= loss;
    state.lastLoss = loss;
    audio.busted();
    msg(`Busted! You lost $${loss}.`);
  }

  function wasted() {
    if (state.over) return;
    state.over = 'wasted';
    const loss = Math.floor(state.cash * _BUSTED_LOSS);
    state.cash -= loss;
    state.lastLoss = loss;
    audio.busted();
    msg(`Wasted! You lost $${loss}.`);
  }

  function respawn() {
    state.over = null;
    state.health = _PLAYER.maxHealth;
    setWanted(0);
    if (state.driving) {
      state.driving = false;
      state.car = null;
      state.carSpeed = 0;
    }
    if (state.inBoat) {
      state.inBoat = false;
      state.boatSpeed = 0;
    }
    player.x = 24;
    player.z = 120;
    player.angle = Math.PI;
    state.playerY = 0;
    state.onRoof = false;
    for (const cop of w.cops) w.scene.remove(cop.mesh);
    w.cops.length = 0;
    for (const c of w.cruisers) w.scene.remove(c.mesh);
    w.cruisers.length = 0;
    w.heliGroup.visible = false;
    clearRoadblocks();
    msg('You wake up at the hospital. Mara is waiting.');
  }

  // ---- per-frame simulation ------------------------------------------------
  function step(dt, input, actions, paused) {
    const events = [];
    state.elapsed += dt;
    if (!paused) {
      state.timeSec = (state.timeSec + (dt * _DAY) / _DAY_LENGTH) % _DAY;
    }
    const hour = state.timeSec / 3600;
    const night = hour < 5.5 || hour >= 18.5;

    // Timers.
    if (state.shootCooldown > 0) state.shootCooldown -= dt;
    if (state.punchCooldown > 0) state.punchCooldown -= dt;
    if (state.flashTimer > 0) {
      state.flashTimer -= dt;
      if (state.flashTimer <= 0) w.flash.scale.setScalar(0.001);
    }
    if (state.tracerTimer > 0) {
      state.tracerTimer -= dt;
      if (state.tracerTimer <= 0) w.tracer.scale.set(0.001, 0.001, 0.001);
    }
    if (state.reloading > 0) {
      state.reloading -= dt;
      if (state.reloading <= 0) {
        const i = state.reloadWeapon;
        const wp = _WEAPONS[i];
        const need = wp.mag - state.mag[i];
        const take = Math.min(need, state.reserve[i]);
        state.mag[i] += take;
        state.reserve[i] -= take;
        state.reloadWeapon = -1;
      }
    }

    if (!paused && !state.over) {
      // Camera orbit.
      const drag = input.takeDrag();
      state.camYaw -= drag.dx * 0.005;
      state.camPitch = clamp(state.camPitch + drag.dy * 0.003, 0.08, 1.1);
      if (input.keys.has('ArrowLeft')) state.camYaw += dt * 2.2;
      if (input.keys.has('ArrowRight')) state.camYaw -= dt * 2.2;
      if (actions & ACTION_CAMERA) state.camFar = !state.camFar;

      if (actions & ACTION_WEAPON_1) state.weaponIndex = 0;
      if (actions & ACTION_WEAPON_2) state.weaponIndex = 1;
      if (actions & ACTION_WEAPON_3) state.weaponIndex = 2;
      if (actions & ACTION_RELOAD) reloadWeapon();

      const axes = input.moveAxes();

      if (state.inBoat) {
        // Speedboat on the water.
        if (axes.y > 0) state.boatSpeed = Math.min(26, state.boatSpeed + 16 * dt);
        else if (axes.y < 0) state.boatSpeed = Math.max(-6, state.boatSpeed - 12 * dt);
        else state.boatSpeed *= (1 - 0.6 * dt);
        state.boatAngle += axes.x * -1.9 * dt * clamp(Math.abs(state.boatSpeed) / 8, 0, 1) * Math.sign(state.boatSpeed || 1);
        const bx = w.playerBoat.position.x + Math.sin(state.boatAngle) * state.boatSpeed * dt;
        const bz = w.playerBoat.position.z + Math.cos(state.boatAngle) * state.boatSpeed * dt;
        w.playerBoat.position.x = clamp(bx, -330, -178);
        w.playerBoat.position.z = clamp(bz, -210, 210);
        w.playerBoat.rotation.y = state.boatAngle;
        w.playerBoat.position.y = 0.2 + Math.sin(state.elapsed * 2.2) * 0.18;
        player.x = w.playerBoat.position.x;
        player.z = w.playerBoat.position.z;
        if (actions & ACTION_ENTER) {
          state.inBoat = false;
          state.boatSpeed = 0;
          player.x = -182;
          player.z = w.playerBoat.position.z;
          msg('You step back onto the dock.');
          events.push({ type: 'boatExit' });
        }
      } else if (state.driving && state.car) {
        const car = state.car;
        const accel = axes.y > 0 ? 15 : axes.y < 0 ? -20 : 0;
        if (axes.y > 0) state.carSpeed = Math.min(34, state.carSpeed + accel * dt);
        else if (axes.y < 0) {
          state.carSpeed = state.carSpeed > 0.5 ? state.carSpeed + accel * dt : Math.max(-9, state.carSpeed - 10 * dt);
        } else state.carSpeed *= (1 - 0.5 * dt);
        if (input.handbrake) state.carSpeed *= (1 - 2.4 * dt);
        const steer = axes.x * -1.6 * dt * clamp(Math.abs(state.carSpeed) / 6, 0, 1) * Math.sign(state.carSpeed || 1);
        state.carAngle += steer;
        car.angle = state.carAngle;
        // Stunt ramps: speed over a ramp launches the car.
        let launched = false;
        for (const r of w.ramps) {
          if (!state.airborne && dist2d(car.x, car.z, r.x, r.z) < 7 && Math.abs(state.carSpeed) > 17) {
            state.airborne = true;
            state.carVy = 9;
            state.jumpSpeed = Math.abs(state.carSpeed);
            launched = true;
            break;
          }
        }
        if (state.airborne) {
          state.carVy -= 22 * dt;
          state.carY += state.carVy * dt;
          state.airTime += dt;
          if (state.carY <= 0) {
            state.carY = 0;
            state.airborne = false;
            const landing = { x: car.x, z: car.z };
            events.push({ type: 'jumpLand', speed: state.jumpSpeed, airTime: state.airTime, ...landing });
            if (state.jumpSpeed > 17 && state.airTime > 0.7) {
              state.bestStunt = Math.max(state.bestStunt, Math.round(state.jumpSpeed * state.airTime * 10));
              msg(`Clean landing! Stunt scored ${Math.round(state.jumpSpeed * state.airTime * 10)} pts.`);
            }
            state.airTime = 0;
          }
        }
        const nx = car.x + Math.sin(state.carAngle) * state.carSpeed * dt;
        const nz = car.z + Math.cos(state.carAngle) * state.carSpeed * dt;
        const fixed = collideCircle(w, nx, nz, 2.4);
        if (fixed.x !== nx || fixed.z !== nz) {
          if (Math.abs(state.carSpeed) > 12) {
            audio.crash();
            car.health -= 18;
            if (car.health <= 0 && !car.wrecked) {
              car.wrecked = true;
              msg('Your car is wrecked.');
              events.push({ type: 'carWreck' });
            }
          }
          state.carSpeed *= -0.25;
        }
        car.x = fixed.x;
        car.z = fixed.z;
        car.x = clamp(car.x, -186, 186);
        car.z = clamp(car.z, -186, 186);
        car.mesh.position.set(car.x, state.carY, car.z);
        car.mesh.rotation.y = state.carAngle - Math.PI / 2;
        car.mesh.rotation.z = state.airborne ? -0.12 : 0;
        player.x = car.x;
        player.z = car.z;
        player.angle = state.carAngle;
        state.engineOn = true;
        audio.engine(Math.abs(state.carSpeed) / 34, true);
        if (actions & ACTION_ENTER && Math.abs(state.carSpeed) < 1.5) exitCar();
        if (actions & ACTION_PUNCH) {
          // Handbrake is Space while driving; Space also punches on foot only.
        }
        // Run over pedestrians.
        for (const ped of w.peds) {
          if (!ped.alive) continue;
          if (dist2d(car.x, car.z, ped.x, ped.z) < 2.2 && Math.abs(state.carSpeed) > 2) {
            ped.alive = false;
            ped.down = 6;
            ped.mesh.rotation.z = Math.PI / 2;
            raiseWanted(_WANTED.hitPed, 'pedestrian hit');
            events.push({ type: 'hitPed' });
          }
        }
        if (car.wrecked) {
          state.carSpeed = 0;
          if (rng() < dt * 6) w.puff(car.x, 1.5, car.z);
        }
      } else {
        // On foot.
        state.engineOn = false;
        audio.engine(0, false);
        const speed = input.run ? _PLAYER.runSpeed : _PLAYER.walkSpeed;
        const yaw = state.camYaw;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const rx = Math.cos(yaw);
        const rz = -Math.sin(yaw);
        let mx = fx * axes.y + rx * axes.x;
        let mz = fz * axes.y + rz * axes.x;
        const ml = Math.sqrt(mx * mx + mz * mz);
        if (ml > 0.01) {
          mx /= ml;
          mz /= ml;
          player.angle = Math.atan2(mx, mz);
          const nx = player.x + mx * speed * dt;
          const nz = player.z + mz * speed * dt;
          const fixed = collideCircle(w, nx, nz, _PLAYER.radius);
          player.x = clamp(fixed.x, -236, 186);
          player.z = clamp(fixed.z, -186, 186);
          player.speed = speed;
        } else player.speed = 0;
        // Roof gravity: walk off the tower roof and you fall.
        if (state.onRoof) {
          const dx = player.x - 19;
          const dz = player.z - 19;
          if (Math.abs(dx) > 11 || Math.abs(dz) > 11) {
            state.onRoof = false;
            state.vy = 0;
          }
        }
        if (!state.onRoof && state.playerY > 0) {
          state.vy -= 22 * dt;
          state.playerY += state.vy * dt;
          if (state.playerY <= 0) {
            state.playerY = 0;
            state.vy = 0;
            state.health -= 15;
            msg('That fall hurt.');
            if (state.health <= 0) wasted();
          }
        }
        if (actions & ACTION_PUNCH) punch();
        if (actions & ACTION_SHOOT) fireWeapon();
        else if (input.mouseDown && _WEAPONS[state.weaponIndex].auto) fireWeapon();
        if (actions & ACTION_ENTER) {
          // Solmar Tower lift pad (armed by the Rooftop Heist job).
          if (state.liftPadActive && dist2d(player.x, player.z, 12, 12) < 4) {
            state.onRoof = true;
            state.playerY = 96;
            player.x = 19;
            player.z = 19;
            msg('The lift takes you to the Solmar Tower roof.');
            events.push({ type: 'liftUp' });
          } else if (dist2d(player.x, player.z, w.playerBoat.position.x, w.playerBoat.position.z) < 5) {
            // Board the speedboat at the marina.
            state.inBoat = true;
            state.boatAngle = Math.PI / 2;
            state.boatSpeed = 0;
            msg('You board the speedboat.');
            audio.splash();
            events.push({ type: 'boatBoard' });
          } else if (state.onRoof) {
            // Roof exit pad: take the lift back down.
            state.onRoof = false;
            state.playerY = 0;
            player.x = 12;
            player.z = 12;
            msg('You ride the lift back down.');
            events.push({ type: 'liftDown' });
          } else {
            const car = nearestCar(4.5);
            if (car) enterCar(car);
          }
        }
        // Briefcase pickups.
        for (const b of w.briefcases) {
          if (b.found) continue;
          const dy = Math.abs((b.y || 0) - state.playerY);
          if (dist2d(player.x, player.z, b.x, b.z) < 2.6 && dy < 4) {
            b.found = true;
            b.mesh.visible = false;
            state.briefcasesFound += 1;
            addCash(_BRIEF_REWARD);
            audio.pickup();
            msg(`Gold briefcase found! +$${_BRIEF_REWARD} (${state.briefcasesFound}/10)`);
            events.push({ type: 'briefcase', count: state.briefcasesFound });
          }
        }
      }

      // Health regen while calm.
      if (state.wanted === 0 && state.health < _PLAYER.maxHealth) {
        state.health = Math.min(_PLAYER.maxHealth, state.health + 2 * dt);
      }

      // ---- traffic ---------------------------------------------------------
      const lightCycle = (state.elapsed % 24) < 12; // true: N/S green
      for (const car of w.trafficCars) {
        if (car.wrecked) continue;
        let targetSpeed = car.cruise || car.speed;
        // Stop for a red light near an intersection on its avenue.
        for (const a of AVENUES) {
          if (Math.abs(car.z - a) < 7 && Math.abs(car.x - a) < 4) {
            // At an intersection: red for z-traffic when lightCycle is false.
            if (!lightCycle) targetSpeed = 0;
          }
        }
        car.speed = targetSpeed;
        // Traffic runs along its avenue (heading 0 = +z, PI = -z).
        car.z += Math.cos(car.angle) * car.speed * dt;
        car.x += Math.sin(car.angle) * car.speed * dt;
        if (car.z > 185) car.z = -185;
        if (car.z < -185) car.z = 185;
        car.mesh.position.set(car.x, 0, car.z);
        car.mesh.rotation.y = car.angle - Math.PI / 2;
      }

      // ---- pedestrians ------------------------------------------------------
      for (const ped of w.peds) {
        if (!ped.alive) {
          ped.down -= dt;
          if (ped.down <= 0) {
            ped.alive = true;
            ped.mesh.rotation.z = 0;
            const ax2 = AVENUES[Math.floor(rng() * AVENUES.length)];
            ped.x = ax2 + 5.2;
            ped.z = range(rng, -170, 170);
            ped.tx = ped.x;
            ped.tz = ped.z;
            ped.mesh.position.set(ped.x, 0.12, ped.z);
          }
          continue;
        }
        if (ped.scatter > 0) {
          ped.scatter -= dt;
          const away = angleTo(player.x, player.z, ped.x, ped.z);
          ped.x += Math.sin(away) * 4.5 * dt;
          ped.z += Math.cos(away) * 4.5 * dt;
          ped.angle = away;
        } else {
          if (dist2d(ped.x, ped.z, ped.tx, ped.tz) < 2) {
            // Next waypoint stays on a street or sidewalk, never inside a
            // building: pick an avenue, then a point along it.
            const avenue = AVENUES[Math.floor(rng() * AVENUES.length)];
            if (rng() < 0.5) {
              ped.tx = avenue + (rng() < 0.5 ? 5.2 : -5.2);
              ped.tz = clamp(ped.z + range(rng, -60, 60), -172, 172);
            } else {
              ped.tx = clamp(ped.x + range(rng, -60, 60), -172, 172);
              ped.tz = avenue + (rng() < 0.5 ? 5.2 : -5.2);
            }
          }
          const a = angleTo(ped.x, ped.z, ped.tx, ped.tz);
          ped.angle = a;
          ped.x += Math.sin(a) * ped.speed * dt;
          ped.z += Math.cos(a) * ped.speed * dt;
        }
        ped.x = clamp(ped.x, -186, 186);
        ped.z = clamp(ped.z, -186, 186);
        ped.mesh.position.set(ped.x, 0.12, ped.z);
        ped.mesh.rotation.y = ped.angle;
        // Walk bob.
        ped.mesh.position.y = 0.12 + Math.abs(Math.sin(state.elapsed * 6 + ped.x)) * 0.06;
      }

      // ---- wanted: police response ------------------------------------------
      const wanted = state.wanted;
      const playerSeen = w.cops.some((c) => dist2d(c.x, c.z, player.x, player.z) < 42)
        || w.cruisers.some((c) => dist2d(c.x, c.z, player.x, player.z) < 55)
        || w.heliGroup.visible;
      if (wanted > 0) {
        if (playerSeen) {
          state.seenTimer = 3;
          state.quietTimer = 0;
        } else {
          state.quietTimer += dt;
          if (state.quietTimer > 4) {
            state.heat = Math.max(0, state.heat - _WANTED.decayQuiet * dt);
            const nw = Math.ceil(state.heat);
            if (nw < state.wanted) {
              state.wanted = nw;
              if (nw === 0) msg('You lost them. The heat is off.');
              else msg(`Heat dropping — ${nw} star${nw > 1 ? 's' : ''}.`);
            }
          }
        }
      }
      state.sirenOn = wanted >= 1;
      audio.siren(state.sirenOn, dt);

      // Foot cops.
      const wantCops = wanted >= 1 ? Math.min(wanted + 1, 5) : 0;
      while (w.cops.length < wantCops) spawnCop();
      for (const cop of [...w.cops]) {
        const d = dist2d(cop.x, cop.z, player.x, player.z);
        const a = angleTo(cop.x, cop.z, player.x, player.z);
        cop.angle = a;
        const speed = state.driving ? 0 : 6.8;
        if (d > 2.2) {
          cop.x += Math.sin(a) * speed * dt;
          cop.z += Math.cos(a) * speed * dt;
        } else if (!state.driving) {
          // Caught on foot.
          cop.hitTimer -= dt;
          if (cop.hitTimer <= 0) {
            cop.hitTimer = 0.6;
            state.health -= 9;
            msg('A cop is beating you down!');
            if (state.health <= 0) wasted();
            else if (d < 2.2 && state.health < 40) {
              // Low health + cop on top of you: busted.
              busted();
              events.push({ type: 'busted' });
            }
          }
        }
        cop.mesh.position.set(cop.x, 0.12, cop.z);
        cop.mesh.rotation.y = cop.angle;
      }
      if (wanted === 0) {
        for (const cop of w.cops) w.scene.remove(cop.mesh);
        w.cops.length = 0;
      }

      // Cruisers.
      const wantCruisers = wanted >= 2 ? Math.min(wanted - 1, 3) : 0;
      while (w.cruisers.length < wantCruisers) spawnCruiser();
      for (const c of [...w.cruisers]) {
        const d = dist2d(c.x, c.z, player.x, player.z);
        const a = angleTo(c.x, c.z, player.x, player.z);
        c.angle += clamp(((a - c.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -2.4 * dt, 2.4 * dt);
        c.speed = Math.min(24, c.speed + 10 * dt);
        if (d > 6) {
          c.x += Math.sin(c.angle) * c.speed * dt;
          c.z += Math.cos(c.angle) * c.speed * dt;
        } else {
          c.speed *= 0.9;
          if (!state.driving && d < 3.4) {
            busted();
            events.push({ type: 'busted' });
          }
          if (state.driving && state.car && d < 4.5) {
            state.car.health -= 30 * dt;
            state.carSpeed *= (1 - 1.2 * dt);
            if (state.car.health <= 0 && !state.car.wrecked) {
              state.car.wrecked = true;
              msg('Your car is wrecked — the cops boxed you in.');
            }
          }
        }
        const fixed = collideCircle(w, c.x, c.z, 2.4);
        c.x = fixed.x;
        c.z = fixed.z;
        c.mesh.position.set(c.x, 0, c.z);
        c.mesh.rotation.y = c.angle - Math.PI / 2;
        const bar = c.mesh.userData.lightBar;
        if (bar) {
          const on = Math.floor(state.elapsed * 4) % 2 === 0;
          bar.userData.r.material.color.setHex(on ? 0xff2222 : 0x330000);
          bar.userData.b.material.color.setHex(on ? 0x000033 : 0x2244ff);
        }
      }
      if (wanted < 2) {
        for (const c of w.cruisers) w.scene.remove(c.mesh);
        w.cruisers.length = 0;
      }

      // Helicopter + roadblocks at 4 stars.
      w.heliGroup.visible = wanted >= 4;
      if (w.heliGroup.visible) {
        const t = state.elapsed * 0.25;
        w.heliGroup.position.set(player.x + Math.cos(t) * 34, 46 + Math.sin(state.elapsed * 0.5) * 2, player.z + Math.sin(t) * 34);
        w.heliGroup.rotation.y = angleTo(w.heliGroup.position.x, w.heliGroup.position.z, player.x, player.z);
        w.rotor.rotation.y = state.elapsed * 22;
        w.searchCone.lookAt(player.x, 0, player.z);
      }
      if (wanted >= 4 && w.roadblocks.length === 0) spawnRoadblocks();
      if (wanted < 4 && w.roadblocks.length > 0) clearRoadblocks();

      // Smuggler boat patrols the coast.
      w.smugglerBoat.position.z += 7 * dt;
      if (w.smugglerBoat.position.z > 170) w.smugglerBoat.position.z = -170;
      w.smugglerBoat.position.x = -280 + Math.sin(state.elapsed * 0.1) * 12;
      w.smugglerBoat.rotation.y = Math.PI / 2;
      w.smugglerBoat.position.y = 0.2 + Math.sin(state.elapsed * 2.0) * 0.18;
      state.smugglerDist = dist2d(player.x, player.z, w.smugglerBoat.position.x, w.smugglerBoat.position.z);

      // Moored boats bob; the sea breathes.
      w.sea.position.y = 0.12 + Math.sin(state.elapsed * 0.7) * 0.12;
      for (const b of w.mooredBoats) b.position.y = 0.2 + Math.sin(state.elapsed * 1.7 + b.position.z) * 0.12;

      // Beacon pulse.
      if (w.beacon.visible) {
        const s = 1 + Math.sin(state.elapsed * 4) * 0.12;
        w.beaconRing.scale.set(s, s, 1);
        w.beacon.material.opacity = 0.45 + Math.sin(state.elapsed * 4) * 0.2;
      }
      // Briefcase spin.
      for (const b of w.briefcases) {
        if (!b.found) b.mesh.rotation.y = state.elapsed * 1.5;
      }
      // Tower beacon blink.
      w.towerBeacon.material.color.setHex(Math.floor(state.elapsed * 1.5) % 2 === 0 ? 0xff2d55 : 0x550000);
    }

    // ---- day/night lighting (also runs while paused so shots look right) ----
    const sky = skyFor(hour);
    w.scene.background.setHex(sky[0]);
    w.scene.fog.color.setHex(sky[0]);
    w.sun.color.setHex(sky[1]);
    w.sun.intensity = sky[2];
    w.hemi.intensity = sky[3];
    const sunAngle = ((hour - 6) / 12) * Math.PI;
    w.sun.position.set(Math.cos(sunAngle) * 200, Math.max(20, Math.sin(sunAngle) * 200), 80);
    const lampsOn = night;
    for (const lamp of w.lamps) lamp.material = lampsOn ? w.lampGlowMat : w.lampGlowOff;
    for (const sign of w.neonSigns) sign.material.emissive.setHex(night ? sign.material.color.getHex() : 0x111111);
    for (const tl of w.trafficLights) {
      const nsGreen = (state.elapsed % 24) < 12;
      tl.red.material.color.setHex(nsGreen ? 0x330000 : 0xff2222);
      tl.green.material.color.setHex(nsGreen ? 0x22ff66 : 0x003300);
    }
    // Player headlights at night.
    if (state.car) state.car.mesh.userData.headlight.intensity = night ? 2.2 : 0;
    for (const c of w.cruisers) c.mesh.userData.headlight.intensity = night ? 1.6 : 0;

    // Player mesh position.
    w.playerGroup.position.set(player.x, 0.12 + state.playerY, player.z);
    w.playerGroup.rotation.y = player.angle;
    w.playerGroup.visible = !state.driving && !state.inBoat;
    if (state.driving && state.car) {
      w.playerGroup.visible = false;
    }
    return events;
  }

  function render() {
    // Chase/orbit camera.
    const target = state.driving && state.car
      ? { x: state.car.x, y: state.carY + 1.5, z: state.car.z, yaw: state.carAngle }
      : state.inBoat
        ? { x: w.playerBoat.position.x, y: 1.5, z: w.playerBoat.position.z, yaw: state.boatAngle }
        : { x: player.x, y: 1.5 + state.playerY, z: player.z, yaw: state.camYaw };
    const dist = state.driving || state.inBoat ? (state.camFar ? 22 : 15) : state.camDist;
    const yaw = state.driving || state.inBoat ? target.yaw + Math.PI : state.camYaw;
    const pitch = state.driving || state.inBoat ? 0.3 : state.camPitch;
    const cx = target.x + Math.sin(yaw) * Math.cos(pitch) * dist;
    const cz = target.z + Math.cos(yaw) * Math.cos(pitch) * dist;
    const cy = target.y + Math.sin(pitch) * dist + 1.5;
    w.camera.position.set(cx, cy, cz);
    w.camera.lookAt(target.x, target.y + 1, target.z);
    w.renderer.render(w.scene, w.camera);
  }

  function resize() {
    w.camera.aspect = window.innerWidth / window.innerHeight;
    w.camera.updateProjectionMatrix();
    w.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function applySave(save) {
    if (!save) return;
    state.cash = save.cash ?? _PLAYER.startCash;
    state.jobsDone = save.jobsDone ?? 0;
    state.briefcasesFound = save.briefcasesFound ?? 0;
    state.bestStunt = save.bestStunt ?? 0;
    if (Array.isArray(save.briefcases)) {
      save.briefcases.forEach((found, i) => {
        if (found && w.briefcases[i]) {
          w.briefcases[i].found = true;
          w.briefcases[i].mesh.visible = false;
        }
      });
    }
  }

  function getSave() {
    return {
      cash: state.cash,
      jobsDone: state.jobsDone,
      briefcasesFound: state.briefcasesFound,
      bestStunt: state.bestStunt,
      briefcases: w.briefcases.map((b) => b.found),
    };
  }

  return {
    world: w, state, player, msg, addCash, raiseWanted, setBeacon, clearBeacon,
    setWanted, busted, wasted, respawn, step, render, resize, applySave, getSave,
    enterCar, exitCar, nearestCar, reloadWeapon,
  };
}
