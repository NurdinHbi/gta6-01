// Solmar City — the world: procedural coastal city, vehicles, pedestrians,
// police, helicopter, boat, wanted system, combat and the day/night cycle.
// Rendering is Three.js (vendored); the rules live here, with no DOM in them
// except the canvas the renderer owns. main.js drives the loop and the HUD.

import { CAR, COLLECTIBLES, LANDMARKS, PALETTE, PLAYER, WEAPONS, WANTED, WORLD } from './config.js';
import { pick, range } from './random.js';

const ROADS = [];
for (let v = -240; v <= 240; v += 60) ROADS.push(v);
const BLOCKS = [];
for (let v = -210; v <= 210; v += 60) BLOCKS.push(v);

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist2(ax, az, bx, bz) { const dx = ax - bx; const dz = az - bz; return dx * dx + dz * dz; }
function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function windowTexture(THREE, random) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#888888'; g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 5; x < 58; x += 10) {
      g.fillStyle = random() < 0.55 ? '#ffd27a' : '#202c3a';
      g.fillRect(x, y, 6, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function billboardTexture(THREE, text, sub, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.fillStyle = fg; g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText(text, 128, 58);
  g.font = '20px system-ui, sans-serif';
  g.fillText(sub, 128, 96);
  return new THREE.CanvasTexture(c);
}

export function createWorld(THREE, canvas, rng, audio, hooks) {
  const random = rng;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyNoon);
  scene.fog = new THREE.Fog(0x9fc8e8, 260, 700);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x5a5a48, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sunNoon, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 700;
  scene.add(sun);
  scene.add(sun.target);
  const moon = new THREE.DirectionalLight(PALETTE.moon, 0);
  moon.position.set(-120, 180, -80);
  scene.add(moon);

  // ---- shared geometry / materials -------------------------------------
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const winTex = windowTexture(THREE, random);
  const buildingMats = PALETTE.building.map((c) => new THREE.MeshLambertMaterial({
    color: c, map: winTex, emissive: 0xffc46b, emissiveMap: winTex, emissiveIntensity: 0,
  }));
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.roadLine });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const sandMat = new THREE.MeshLambertMaterial({ color: PALETTE.sand });
  const seaMat = new THREE.MeshLambertMaterial({ color: PALETTE.sea });
  const grassMat = new THREE.MeshLambertMaterial({ color: PALETTE.grass });
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const neonPinkMat = new THREE.MeshBasicMaterial({ color: PALETTE.neonPink });
  const neonCyanMat = new THREE.MeshBasicMaterial({ color: PALETTE.neonCyan });
  const neonGoldMat = new THREE.MeshBasicMaterial({ color: PALETTE.neonGold });

  const colliders = [];
  function addCollider(x, z, hw, hd) { colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd }); }
  function collideCircle(pos, radius) {
    for (const c of colliders) {
      const cx = clamp(pos.x, c.minX, c.maxX);
      const cz = clamp(pos.z, c.minZ, c.maxZ);
      const dx = pos.x - cx; const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
        return true;
      }
      if (d2 <= 0.0001) { pos.x = c.maxX + radius; return true; }
    }
    return false;
  }

  // ---- ground, roads, beach, sea ---------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(760, 760), grassMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.08, 20);
  ground.receiveShadow = true;
  scene.add(ground);
  const citySlab = new THREE.Mesh(boxGeo, walkMat);
  citySlab.scale.set(560, 0.3, 560); citySlab.position.set(0, -0.05, -20);
  citySlab.receiveShadow = true;
  scene.add(citySlab);
  for (const v of ROADS) {
    const roadNS = new THREE.Mesh(boxGeo, roadMat);
    roadNS.scale.set(14, 0.12, 560); roadNS.position.set(v, 0.02, -20);
    roadNS.receiveShadow = true; scene.add(roadNS);
    const roadEW = new THREE.Mesh(boxGeo, roadMat);
    roadEW.scale.set(560, 0.12, 14); roadEW.position.set(0, 0.02, v);
    roadEW.receiveShadow = true; scene.add(roadEW);
    for (let u = -240; u <= 240; u += 24) {
      const dash = new THREE.Mesh(boxGeo, lineMat);
      dash.scale.set(0.5, 0.05, 4); dash.position.set(v, 0.1, u);
      scene.add(dash);
      const dash2 = new THREE.Mesh(boxGeo, lineMat);
      dash2.scale.set(4, 0.05, 0.5); dash2.position.set(u, 0.1, v);
      scene.add(dash2);
    }
  }
  const beach = new THREE.Mesh(boxGeo, sandMat);
  beach.scale.set(620, 0.3, 52); beach.position.set(0, 0.02, 268);
  beach.receiveShadow = true; scene.add(beach);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(760, 420), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0.15, 500);
  scene.add(sea);
  const seaDeep = new THREE.Mesh(new THREE.PlaneGeometry(760, 200), new THREE.MeshLambertMaterial({ color: PALETTE.seaDeep }));
  seaDeep.rotation.x = -Math.PI / 2; seaDeep.position.set(0, 0.1, 700);
  scene.add(seaDeep);

  // Pier: planks out into the sea, with posts and a kiosk at the end.
  const pier = new THREE.Mesh(boxGeo, woodMat);
  pier.scale.set(12, 0.6, 96); pier.position.set(0, 0.6, 296);
  pier.castShadow = true; scene.add(pier);
  for (let z = 256; z <= 336; z += 16) {
    for (const x of [-5, 5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 6), woodMat);
      post.position.set(x, -0.6, z); scene.add(post);
    }
  }
  const kiosk = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xd84f6a }));
  kiosk.scale.set(8, 4, 6); kiosk.position.set(0, 2.6, 332);
  kiosk.castShadow = true; scene.add(kiosk);
  addCollider(0, 332, 4.5, 3.5);

  // Marina docks west of the pier.
  for (let i = 0; i < 3; i += 1) {
    const dock = new THREE.Mesh(boxGeo, woodMat);
    dock.scale.set(4, 0.5, 42); dock.position.set(-216 + i * 14, 0.5, 306);
    scene.add(dock);
  }

  // ---- buildings --------------------------------------------------------
  const landmarkBlocks = new Set([
    '-60,-60', '60,180', '-120,60', '180,-180', '-180,-120', '120,-60', '-240,240', '240,240', '-240,-240',
    '0,240', '60,240', '-60,240', '180,240', '-180,240', '240,180', '-240,180',
  ]);
  let buildingCount = 0;
  const downtown = (x, z) => Math.max(0, 1 - Math.hypot(x, z) / 320);
  for (const bx of BLOCKS) {
    for (const bz of BLOCKS) {
      if (bz >= 240) continue;
      if (landmarkBlocks.has(`${bx},${bz}`)) continue;
      const n = 2 + Math.floor(random() * 3);
      for (let i = 0; i < n; i += 1) {
        const ox = (i % 2 === 0 ? -13 : 13) + range(random, -4, 4);
        const oz = (i < 2 ? -13 : 13) + range(random, -4, 4);
        const w = range(random, 12, 22);
        const d = range(random, 12, 22);
        const h = range(random, 7, 14) + downtown(bx, bz) * range(random, 10, 38);
        const mat = pick(random, buildingMats);
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(bx + ox, h / 2, bz + oz);
        b.castShadow = true; b.receiveShadow = true;
        scene.add(b);
        const roof = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x5a5a52 }));
        roof.scale.set(w * 0.5, 1.2, d * 0.5); roof.position.set(bx + ox, h + 0.6, bz + oz);
        scene.add(roof);
        addCollider(bx + ox, bz + oz, w / 2 + 0.4, d / 2 + 0.4);
        buildingCount += 1;
      }
    }
  }

  // ---- landmarks --------------------------------------------------------
  function landmarkBox(x, z, w, h, d, color, neon) {
    const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color, map: winTex, emissive: 0xffc46b, emissiveMap: winTex, emissiveIntensity: 0 }));
    m.scale.set(w, h, d); m.position.set(x, h / 2, z);
    m.castShadow = true; scene.add(m);
    addCollider(x, z, w / 2 + 0.4, d / 2 + 0.4);
    if (neon) {
      const strip = new THREE.Mesh(boxGeo, neon);
      strip.scale.set(w + 0.6, 0.8, d + 0.6); strip.position.set(x, h - 1, z);
      scene.add(strip);
    }
    return m;
  }
  // Solmar Tower — the tallest thing in the city.
  const tower = landmarkBox(LANDMARKS.tower.x, LANDMARKS.tower.z, 34, 92, 34, 0x9fb4c4, neonCyanMat);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.2, 22, 6), poleMat);
  antenna.position.set(LANDMARKS.tower.x, 103, LANDMARKS.tower.z); scene.add(antenna);
  const towerBeacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
  towerBeacon.position.set(LANDMARKS.tower.x, 114, LANDMARKS.tower.z); scene.add(towerBeacon);
  // Tower terrace (mission 7 pickup) — a low podium south of the tower.
  const terrace = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xc4b49a }));
  terrace.scale.set(20, 2, 14); terrace.position.set(LANDMARKS.towerRoof.x, 1, LANDMARKS.towerRoof.z);
  terrace.castShadow = true; scene.add(terrace);
  // Grand Solmar casino — wide, gold, neon.
  landmarkBox(LANDMARKS.casino.x, LANDMARKS.casino.z, 52, 22, 30, 0x8f2a5e, neonPinkMat);
  const casinoSign = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), new THREE.MeshBasicMaterial({ map: billboardTexture(THREE, 'GRAND SOLMAR', 'CASINO • HOTEL', '#2a0a2e', '#ffc93c') }));
  casinoSign.position.set(LANDMARKS.casino.x, 26, LANDMARKS.casino.z - 16); scene.add(casinoSign);
  // First Solmar Bank — columns and a pediment.
  landmarkBox(LANDMARKS.bank.x, LANDMARKS.bank.z, 34, 18, 26, 0xd8d2c0, neonGoldMat);
  for (let i = -2; i <= 2; i += 1) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 14, 8), new THREE.MeshLambertMaterial({ color: 0xf2eee0 }));
    col.position.set(LANDMARKS.bank.x + i * 6, 7, LANDMARKS.bank.z - 14); scene.add(col);
  }
  // Stadium — a big low cylinder with a ring.
  const stadium = new THREE.Mesh(new THREE.CylinderGeometry(42, 46, 16, 24), new THREE.MeshLambertMaterial({ color: 0x7f9fb8, map: winTex }));
  stadium.position.set(LANDMARKS.stadium.x, 8, LANDMARKS.stadium.z); stadium.castShadow = true; scene.add(stadium);
  addCollider(LANDMARKS.stadium.x, LANDMARKS.stadium.z, 44, 44);
  const stadiumRing = new THREE.Mesh(new THREE.TorusGeometry(40, 1.2, 6, 32), neonCyanMat);
  stadiumRing.rotation.x = Math.PI / 2; stadiumRing.position.set(LANDMARKS.stadium.x, 16.5, LANDMARKS.stadium.z); scene.add(stadiumRing);
  // Lighthouse at the east end of the beach.
  const lightHouse = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 34, 10), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
  lightHouse.position.set(LANDMARKS.lighthouse.x, 17, LANDMARKS.lighthouse.z); lightHouse.castShadow = true; scene.add(lightHouse);
  addCollider(LANDMARKS.lighthouse.x, LANDMARKS.lighthouse.z, 6, 6);
  const lightTop = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  lightTop.position.set(LANDMARKS.lighthouse.x, 36, LANDMARKS.lighthouse.z); scene.add(lightTop);
  const lightBeam = new THREE.Mesh(new THREE.ConeGeometry(10, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide }));
  lightBeam.rotation.z = Math.PI / 2; lightBeam.position.set(LANDMARKS.lighthouse.x - 30, 36, LANDMARKS.lighthouse.z); scene.add(lightBeam);
  // Hospital (white, red cross) and precinct (blue sign).
  landmarkBox(LANDMARKS.hospital.x, LANDMARKS.hospital.z, 36, 20, 26, 0xf2f2f2, null);
  const cross1 = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xd82a2a }));
  cross1.scale.set(10, 3, 1); cross1.position.set(LANDMARKS.hospital.x, 22, LANDMARKS.hospital.z - 13.5); scene.add(cross1);
  const cross2 = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xd82a2a }));
  cross2.scale.set(3, 10, 1); cross2.position.set(LANDMARKS.hospital.x, 22, LANDMARKS.hospital.z - 13.5); scene.add(cross2);
  landmarkBox(LANDMARKS.precinct.x, LANDMARKS.precinct.z, 30, 16, 24, 0x5a6a8a, neonCyanMat);
  // Hideout, safe house and Mara's place — small houses with porches.
  for (const [spot, color] of [[LANDMARKS.hideout, 0xa88a5a], [LANDMARKS.safehouse, 0x7a8a6a], [LANDMARKS.marasPlace, 0xc48a7a]]) {
    const house = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color }));
    house.scale.set(16, 7, 12); house.position.set(spot.x, 3.5, spot.z); house.castShadow = true; scene.add(house);
    const roofH = new THREE.Mesh(new THREE.ConeGeometry(11, 4, 4), new THREE.MeshLambertMaterial({ color: 0x6a4a3a }));
    roofH.rotation.y = Math.PI / 4; roofH.position.set(spot.x, 9, spot.z); scene.add(roofH);
    addCollider(spot.x, spot.z, 8.5, 6.5);
  }
  // Billboards.
  const bb1 = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshBasicMaterial({ map: billboardTexture(THREE, 'SOLMAR', 'sun • sea • speed', '#0d4a68', '#ffffff') }));
  bb1.position.set(-180, 16, -238); scene.add(bb1);
  const bb2 = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshBasicMaterial({ map: billboardTexture(THREE, 'VISIT THE PIER', 'fish • fries • fireworks', '#7a2a3a', '#ffe9a8') }));
  bb2.position.set(120, 16, 238); bb2.rotation.y = Math.PI; scene.add(bb2);

  // ---- palms and streetlights -------------------------------------------
  const palms = [];
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat);
    trunk.position.y = 3.5; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 5; i += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 4), leafMat);
      const a = (i / 5) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6, 7.4, Math.sin(a) * 1.6);
      leaf.rotation.z = Math.cos(a) * 1.1; leaf.rotation.x = -Math.sin(a) * 1.1;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    palms.push(g);
  }
  for (let x = -280; x <= 280; x += 28) { palm(x, 256); if (random() < 0.5) palm(x + 14, 244); }
  // Random palms, kept off the roads so they never block an avenue.
  const nearRoad = (v) => { const r = ((v % 60) + 60) % 60; return r < 11 || r > 49; };
  for (let i = 0; i < 18; i += 1) {
    const px = range(random, -280, 280); const pz = range(random, -240, 200);
    if (!nearRoad(px) && !nearRoad(pz)) palm(px, pz);
  }
  const lamps = [];
  function streetlight(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 7, 6), poleMat);
    pole.position.y = 3.5; g.add(pole);
    const arm = new THREE.Mesh(boxGeo, poleMat);
    arm.scale.set(2.2, 0.25, 0.25); arm.position.set(1, 6.9, 0); g.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), lampMat.clone());
    bulb.position.set(2, 6.8, 0); g.add(bulb);
    g.position.set(x, 0, z);
    scene.add(g);
    lamps.push(bulb);
  }
  for (const v of ROADS) {
    for (let u = -210; u <= 210; u += 60) { streetlight(v + 8, u + 8); streetlight(v - 8, u - 8); }
  }

  // ---- traffic lights ----------------------------------------------------
  const trafficLights = [];
  for (const [x, z] of [[-60, -60], [60, 60], [-120, 120], [120, -120], [0, 180], [-180, 0]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6, 6), poleMat);
    pole.position.set(x + 7, 3, z + 7); scene.add(pole);
    const head = new THREE.Mesh(boxGeo, poleMat);
    head.scale.set(1, 2.6, 1); head.position.set(x + 7, 6.4, z + 7); scene.add(head);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshBasicMaterial({ color: 0x33cc44 }));
    lamp.position.set(x + 7, 7.2, z + 6.4); scene.add(lamp);
    trafficLights.push(lamp);
  }

  // ---- beacon, hold zone, land zone --------------------------------------
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 60, 16, 1, true), beaconMat);
  beacon.position.set(0, 30, 200); beacon.visible = false; scene.add(beacon);
  const beaconRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.35, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffc93c }));
  beaconRing.rotation.x = Math.PI / 2; beaconRing.position.set(0, 0.4, 200); beaconRing.visible = false; scene.add(beaconRing);
  const zoneMat = new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const zoneDisc = new THREE.Mesh(new THREE.CircleGeometry(6, 24), zoneMat);
  zoneDisc.rotation.x = -Math.PI / 2; zoneDisc.position.set(0, 0.25, 0); zoneDisc.visible = false; scene.add(zoneDisc);
  const landDisc = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshBasicMaterial({ color: 0x7dff5a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  landDisc.rotation.x = -Math.PI / 2; landDisc.position.set(0, 0.25, 0); landDisc.visible = false; scene.add(landDisc);

  // ---- collectibles and stunt ramps --------------------------------------
  const collectibleMeshes = COLLECTIBLES.map((c) => {
    const g = new THREE.Group();
    const box = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xffc93c, emissive: 0xaa7711, emissiveIntensity: 0.6 }));
    box.scale.set(1.6, 1.1, 1.1); box.position.y = 1.1; g.add(box);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.25 }));
    glow.position.y = 1.1; g.add(glow);
    g.position.set(c.x, 0, c.z);
    scene.add(g);
    return g;
  });
  const ramps = [];
  function stuntRamp(x, z, angle) {
    const g = new THREE.Group();
    const slope = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xd84f2a }));
    slope.scale.set(8, 0.8, 12); slope.position.set(0, 2.2, 0); slope.rotation.x = -0.5; slope.castShadow = true; g.add(slope);
    const base = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f45 }));
    base.scale.set(8, 1, 6); base.position.set(0, 0.5, 6); g.add(base);
    const chevron = new THREE.Mesh(new THREE.PlaneGeometry(7, 2), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    chevron.position.set(0, 3.4, -3.4); chevron.rotation.x = -0.5; g.add(chevron);
    g.position.set(x, 0, z); g.rotation.y = angle;
    scene.add(g);
    ramps.push({ x, z, angle, mesh: g });
  }
  stuntRamp(LANDMARKS.rampPier.x, LANDMARKS.rampPier.z, 0);
  stuntRamp(LANDMARKS.rampStadium.x, LANDMARKS.rampStadium.z, Math.PI / 2);
  stuntRamp(LANDMARKS.rampBeach.x, LANDMARKS.rampBeach.z, 0);

  // ---- vehicles ----------------------------------------------------------
  const carColors = [0xc43a3a, 0x3a6ac4, 0x3ac46a, 0xd8d8d8, 0x2a2a2a, 0xe8a83a, 0x7a3ac4, 0x3ac4c4, 0xc46a3a, 0x8a8a8a];
  const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  function makeCarMesh(color, isPolice) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? PALETTE.copWhite : color });
    const body = new THREE.Mesh(boxGeo, bodyMat);
    body.scale.set(2.1, 0.85, 4.6); body.position.y = 0.75; body.castShadow = true; g.add(body);
    const cabinMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1c2a44 : 0x222a33 });
    const cabin = new THREE.Mesh(boxGeo, cabinMat);
    cabin.scale.set(1.8, 0.7, 2.2); cabin.position.set(0, 1.45, -0.2); cabin.castShadow = true; g.add(cabin);
    if (isPolice) {
      const door = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x1c2a44 }));
      door.scale.set(2.14, 0.5, 1.6); door.position.set(0, 0.8, 0.4); g.add(door);
    }
    const wheels = [];
    for (const [wx, wz] of [[-1, 1.5], [1, 1.5], [-1, -1.5], [1, -1.5]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2; w.position.set(wx, 0.55, wz); g.add(w); wheels.push(w);
    }
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    for (const hx of [-0.7, 0.7]) {
      const h = new THREE.Mesh(boxGeo, headMat);
      h.scale.set(0.5, 0.25, 0.15); h.position.set(hx, 0.85, 2.32); g.add(h);
    }
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xdd2222 });
    for (const hx of [-0.7, 0.7]) {
      const t = new THREE.Mesh(boxGeo, tailMat);
      t.scale.set(0.5, 0.25, 0.15); t.position.set(hx, 0.85, -2.32); g.add(t);
    }
    let lightBar = null;
    if (isPolice) {
      lightBar = new THREE.Group();
      const red = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      red.scale.set(0.7, 0.3, 0.5); red.position.x = -0.45; lightBar.add(red);
      const blue = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0x2255ff }));
      blue.scale.set(0.7, 0.3, 0.5); blue.position.x = 0.45; lightBar.add(blue);
      lightBar.position.set(0, 1.95, -0.2);
      g.add(lightBar);
      lightBar.userData = { red, blue };
    }
    return { group: g, wheels, lightBar };
  }

  function makeBoatMesh(color) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color }));
    hull.scale.set(2.4, 1, 6.5); hull.position.y = 0.6; hull.castShadow = true; g.add(hull);
    const deck = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    deck.scale.set(2, 0.7, 3); deck.position.set(0, 1.3, -0.5); g.add(deck);
    const motor = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x222222 }));
    motor.scale.set(0.8, 1, 0.6); motor.position.set(0, 0.9, -3.4); g.add(motor);
    return g;
  }

  function makePersonMesh(shirt, pants, skin, hat) {
    const g = new THREE.Group();
    const legMat = new THREE.MeshLambertMaterial({ color: pants });
    const legL = new THREE.Mesh(boxGeo, legMat);
    legL.scale.set(0.32, 0.85, 0.32); legL.position.set(-0.2, 0.42, 0); g.add(legL);
    const legR = new THREE.Mesh(boxGeo, legMat);
    legR.scale.set(0.32, 0.85, 0.32); legR.position.set(0.2, 0.42, 0); g.add(legR);
    const torso = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: shirt }));
    torso.scale.set(0.85, 0.85, 0.45); torso.position.y = 1.28; torso.castShadow = true; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), new THREE.MeshLambertMaterial({ color: skin }));
    head.position.y = 1.95; head.castShadow = true; g.add(head);
    const armL = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: shirt }));
    armL.scale.set(0.22, 0.7, 0.22); armL.position.set(-0.55, 1.3, 0); g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.55; g.add(armR);
    if (hat) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.18, 10), new THREE.MeshLambertMaterial({ color: hat }));
      h.position.y = 2.2; g.add(h);
    }
    g.userData = { legL, legR, armL, armR, torso };
    return g;
  }

  // ---- state --------------------------------------------------------------
  const state = {
    cash: 250,
    health: PLAYER.health,
    wanted: 0,
    wantedTimer: 0,
    timeHours: 17.4,
    clock: 0,
    missionIndex: 0,
    missionsDone: 0,
    freeRoam: false,
    collectibles: COLLECTIBLES.map(() => false),
    collectiblesFound: 0,
    stuntBest: 0,
    stuntPaid: 0,
    kills: 0,
    carsStolen: 0,
    bustedCount: 0,
    wastedCount: 0,
    night: false,
  };
  const player = {
    x: LANDMARKS.spawn.x, z: LANDMARKS.spawn.z, y: 0, vy: 0,
    angle: Math.PI, speed: 0, onFoot: true, vehicle: null, boat: false,
    weapon: 0, ammo: WEAPONS.map((w) => w.mag), reloading: 0, reloadTimer: 0,
    shootCd: 0, punchCd: 0, invuln: 0, airborne: false, walkPhase: 0,
  };
  const events = [];
  const messages = [];
  function pushEvent(type, data) { events.push({ type, ...(data || {}) }); }
  function say(text) { messages.push(text); hooks.onMessage && hooks.onMessage(text); }

  const playerMesh = makePersonMesh(0xe8642a, 0x2a3a5a, 0xd8a878, 0x2a2a2a);
  playerMesh.position.set(player.x, 0, player.z);
  scene.add(playerMesh);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  muzzle.visible = false; scene.add(muzzle);
  const playerHeadlight = new THREE.SpotLight(0xfff2b0, 0, 60, 0.5, 0.5);
  scene.add(playerHeadlight);
  scene.add(playerHeadlight.target);

  // Parked (stealable) cars along the avenues.
  const vehicles = [];
  const parkedSpots = [];
  for (let i = 0; i < 14; i += 1) {
    const road = pick(random, ROADS);
    const along = range(random, -230, 230);
    const side = random() < 0.5 ? 1 : -1;
    const horizontal = random() < 0.5;
    parkedSpots.push(horizontal ? { x: along, z: road + side * 9, angle: side > 0 ? 0 : Math.PI } : { x: road + side * 9, z: along, angle: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
  }
  for (const spot of parkedSpots) {
    const { group, wheels, lightBar } = makeCarMesh(pick(random, carColors), false);
    group.position.set(spot.x, 0, spot.z);
    group.rotation.y = spot.angle;
    scene.add(group);
    vehicles.push({ mesh: group, wheels, lightBar, x: spot.x, z: spot.z, angle: spot.angle, speed: 0, kind: 'parked', color: 0, health: 100, smoke: null, stolen: false, headOn: false });
  }
  // Traffic cars on rectangular loops around blocks.
  const trafficLoops = [];
  for (let i = 0; i < 10; i += 1) {
    const cx = pick(random, BLOCKS); const cz = pick(random, BLOCKS);
    const hw = 30 + Math.floor(random() * 3) * 60; const hd = 30 + Math.floor(random() * 3) * 60;
    trafficLoops.push([
      { x: cx - hw, z: cz - hd }, { x: cx + hw, z: cz - hd }, { x: cx + hw, z: cz + hd }, { x: cx - hw, z: cz + hd },
    ]);
  }
  for (let i = 0; i < trafficLoops.length; i += 1) {
    const loop = trafficLoops[i];
    const start = loop[i % 4];
    const { group, wheels, lightBar } = makeCarMesh(pick(random, carColors), false);
    group.position.set(start.x, 0, start.z);
    scene.add(group);
    vehicles.push({ mesh: group, wheels, lightBar, x: start.x, z: start.z, angle: 0, speed: range(random, 8, 12), kind: 'traffic', color: 0, health: 100, smoke: null, loop, loopIndex: (i + 1) % 4, cruise: range(random, 8, 12), stolen: false, headOn: false });
  }
  const policeCars = [];
  const cops = [];
  function spawnPoliceCar() {
    const a = random() * Math.PI * 2;
    const x = clamp(player.x + Math.cos(a) * 55, -280, 280);
    // Never spawn in the sea: pull a beach-side spawn back onto land.
    const z = clamp(player.z + Math.sin(a) * 55, -280, 282);
    const { group, wheels, lightBar } = makeCarMesh(0, true);
    group.position.set(x, 0, z);
    scene.add(group);
    const v = { mesh: group, wheels, lightBar, x, z, angle: 0, speed: 0, kind: 'police', color: 0, health: 100, smoke: null, stolen: false, headOn: false };
    vehicles.push(v);
    policeCars.push(v);
    return v;
  }
  function spawnCop() {
    const a = random() * Math.PI * 2;
    const x = clamp(player.x + Math.cos(a) * 32, -280, 280);
    const z = clamp(player.z + Math.sin(a) * 32, -280, 280);
    const mesh = makePersonMesh(0x1c2a44, 0x1c2a44, 0xc89068, 0x1c2a44);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const cop = { mesh, x, z, angle: 0, health: 100, speed: 8.6, phase: random() * 6, bustedHold: 0, dead: false, deadTimer: 0 };
    cops.push(cop);
    return cop;
  }
  // Helicopter (hidden until 4 stars).
  const heli = new THREE.Group();
  const heliBody = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x1c2a44 }));
  heliBody.scale.set(3, 1.6, 6); heli.add(heliBody);
  const heliTail = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x1c2a44 }));
  heliTail.scale.set(0.8, 0.8, 5); heliTail.position.set(0, 0.3, -5); heli.add(heliTail);
  const rotor = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x222222 }));
  rotor.scale.set(11, 0.15, 0.8); rotor.position.y = 1.2; heli.add(rotor);
  const heliLight = new THREE.Mesh(new THREE.ConeGeometry(6, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
  heliLight.rotation.x = Math.PI; heliLight.position.y = -20; heli.add(heliLight);
  heli.visible = false;
  heli.position.set(0, 70, 0);
  scene.add(heli);
  let heliAngle = 0;

  // Roadblocks: two police cars + barriers, placed ahead of the player at 4+ stars.
  const roadblocks = [];
  for (let i = 0; i < 2; i += 1) {
    const g = new THREE.Group();
    const barrier = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }));
    barrier.scale.set(12, 1, 0.6); barrier.position.y = 0.8; g.add(barrier);
    const stripe = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xd82a2a }));
    stripe.scale.set(12, 0.35, 0.62); stripe.position.y = 1.1; g.add(stripe);
    for (const cx of [-5, 0, 5]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 8), new THREE.MeshLambertMaterial({ color: 0xe8642a }));
      cone.position.set(cx, 0.6, 2); g.add(cone);
    }
    g.visible = false;
    scene.add(g);
    roadblocks.push({ mesh: g, x: 0, z: 0, active: false, retarget: 0 });
  }

  // Pedestrians: wander the sidewalks, scatter when shots are fired.
  const peds = [];
  const pedShirts = [0xc43a6a, 0x3a8ac4, 0x6ac43a, 0xe8d83a, 0x8a5ac4, 0xc47a3a, 0x3ac4a8, 0xd8d8d8];
  const pedSkins = [0xd8a878, 0xb07850, 0xe8c8a0, 0x8a5a38];
  for (let i = 0; i < 24; i += 1) {
    const x = range(random, -260, 260);
    const z = range(random, -240, 240);
    const mesh = makePersonMesh(pick(random, pedShirts), pick(random, [0x2a3a5a, 0x3a2a2a, 0x5a5a5a]), pick(random, pedSkins), random() < 0.3 ? pick(random, [0xc43a3a, 0x3a6ac4, 0xe8d83a]) : null);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      mesh, x, z, angle: random() * Math.PI * 2, health: 50, speed: range(random, 1.2, 2),
      tx: x, tz: z, idle: 0, phase: random() * 6, dead: false, deadTimer: 0, fleeing: 0,
    });
  }

  // Boats: the player's speedboat at the marina, the smuggler's red boat.
  const playerBoatMesh = makeBoatMesh(0x2a7ac4);
  playerBoatMesh.position.set(LANDMARKS.marinaDock.x, 0.2, LANDMARKS.marinaDock.z + 8);
  scene.add(playerBoatMesh);
  const playerBoat = { mesh: playerBoatMesh, x: LANDMARKS.marinaDock.x, z: LANDMARKS.marinaDock.z + 8, angle: Math.PI / 2, speed: 0, kind: 'boat' };
  const targetBoatMesh = makeBoatMesh(0xc43a3a);
  targetBoatMesh.visible = false;
  scene.add(targetBoatMesh);
  const targetBoat = { mesh: targetBoatMesh, x: LANDMARKS.smugglerStart.x, z: LANDMARKS.smugglerStart.z, angle: 0, speed: 0, active: false, pathT: 0 };

  // ---- camera and lighting ------------------------------------------------
  let camYaw = Math.PI;
  let camPitch = 0.32;
  let camDist = 10;
  let chaseCam = false;
  const camTarget = new THREE.Vector3();
  const tmpV = new THREE.Vector3();

  function lerpColor(a, b, t) {
    const ca = new THREE.Color(a); const cb = new THREE.Color(b);
    ca.lerp(cb, clamp(t, 0, 1));
    return ca;
  }
  function updateLighting() {
    const h = state.timeHours;
    // Golden hour stays bright: the sun only really sets after 19:00, and the
    // streetlights only come on once it is properly dark (19:30+).
    const sunElev = Math.sin(((h - 6) / 12) * Math.PI); // 1 at noon, 0 at 6/18
    let sky;
    if (h >= 5 && h < 7.5) sky = lerpColor(PALETTE.skyDawn, PALETTE.skyNoon, (h - 5) / 2.5);
    else if (h >= 7.5 && h < 16) sky = new THREE.Color(PALETTE.skyNoon);
    else if (h >= 16 && h < 19) sky = lerpColor(PALETTE.skyNoon, PALETTE.skyGolden, (h - 16) / 3);
    else if (h >= 19 && h < 20.5) sky = lerpColor(PALETTE.skyGolden, PALETTE.skyDusk, (h - 19) / 1.5);
    else sky = new THREE.Color(PALETTE.skyNight);
    scene.background = sky;
    scene.fog.color.copy(sky);
    let sunI;
    if (h >= 6 && h < 19) sunI = 1.0 + 0.7 * clamp(sunElev, 0, 1);
    else if (h >= 19 && h < 20.5) sunI = 1.0 - ((h - 19) / 1.5) * 0.85;
    else if (h >= 5 && h < 6) sunI = 0.15 + ((h - 5) / 1) * 0.85;
    else sunI = 0.12;
    sun.intensity = sunI;
    sun.color.copy(h >= 16 && h < 19.5 ? new THREE.Color(PALETTE.sunGolden) : new THREE.Color(PALETTE.sunNoon));
    const sunA = ((h - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(sunA) * 320, Math.max(40, Math.sin(sunA) * 320 + (h >= 18 ? 60 : 0)), 140);
    sun.target.position.set(player.x, 0, player.z);
    moon.intensity = h >= 20 || h < 5.5 ? 0.4 : 0;
    hemi.intensity = 0.55 + 0.4 * clamp(sunElev, 0, 1);
    let nightF;
    if (h >= 19.5 || h < 5.5) nightF = 1;
    else if (h >= 18.5 && h < 19.5) nightF = (h - 18.5);
    else if (h >= 5.5 && h < 6.5) nightF = 1 - (h - 5.5);
    else nightF = 0;
    const glow = clamp(nightF, 0, 1);
    for (const m of buildingMats) m.emissiveIntensity = glow * 0.85;
    for (const l of lamps) l.material.color.setHex(glow > 0.5 ? 0xffe9a8 : 0x8a8a7a);
    state.night = glow > 0.5;
    sea.position.y = 0.15 + Math.sin(state.clock * 0.5) * 0.12;
  }

  function updateCamera(dt, orbit) {
    camYaw -= orbit.dx * 0.005;
    camPitch = clamp(camPitch + orbit.dy * 0.004, 0.08, 1.1);
    const inCar = player.vehicle || player.boat;
    if (inCar) {
      const veh = player.vehicle || playerBoat;
      const wantYaw = veh.angle + Math.PI;
      camYaw = angleLerp(camYaw, wantYaw, chaseCam ? 1 : Math.min(1, dt * 1.2));
      camDist += ((chaseCam ? 11 : 15) - camDist) * Math.min(1, dt * 3);
    } else {
      camDist += (10 - camDist) * Math.min(1, dt * 3);
    }
    const px = player.vehicle ? player.vehicle.x : player.boat ? playerBoat.x : player.x;
    const pz = player.vehicle ? player.vehicle.z : player.boat ? playerBoat.z : player.z;
    const py = player.vehicle || player.boat ? 1.5 : 1.8;
    camTarget.set(px, py + player.y, pz);
    const off = new THREE.Vector3(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch)).multiplyScalar(camDist);
    camera.position.copy(camTarget).add(off);
    camera.lookAt(camTarget);
    if (player.vehicle || player.boat) {
      const veh = player.vehicle || playerBoat;
      playerHeadlight.position.set(veh.x, 2, veh.z);
      tmpV.set(Math.sin(veh.angle), -0.15, Math.cos(veh.angle));
      playerHeadlight.target.position.set(veh.x + tmpV.x * 20, 0, veh.z + tmpV.z * 20);
      playerHeadlight.intensity = state.night ? 90 : 0;
    } else {
      playerHeadlight.intensity = 0;
    }
  }

  // ---- beacons and zones ---------------------------------------------------
  function setBeacon(x, z, visible) {
    beacon.visible = visible; beaconRing.visible = visible;
    beacon.position.set(x, 30, z); beaconRing.position.set(x, 0.4, z);
  }
  function setZone(x, z, visible) {
    zoneDisc.visible = visible; zoneDisc.position.set(x, 0.25, z);
  }
  function setLandZone(x, z, visible) {
    landDisc.visible = visible; landDisc.position.set(x, 0.25, z);
  }

  // ---- wanted ---------------------------------------------------------------
  function addWanted(n, reason) {
    if (state.wanted >= WANTED.max) return;
    state.wanted = Math.min(WANTED.max, state.wanted + n);
    state.wantedTimer = 0;
    if (reason) say(reason);
  }
  function setWanted(n) { state.wanted = clamp(n, 0, WANTED.max); state.wantedTimer = 0; }

  function smokeFor(v) {
    if (v.smoke) return v.smoke;
    const s = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 8), new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.55 }));
    s.position.set(0, 2, 1.5);
    v.mesh.add(s);
    v.smoke = s;
    return s;
  }

  // ---- entering / exiting ----------------------------------------------------
  function nearestVehicle(maxDist) {
    let best = null; let bestD = maxDist * maxDist;
    for (const v of vehicles) {
      if (v.kind === 'traffic' || v.kind === 'police' || v.health <= 0) continue;
      const d = dist2(player.x, player.z, v.x, v.z);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }
  function enterNearestVehicle() {
    if (!player.onFoot) return false;
    const v = nearestVehicle(CAR.enterRange);
    if (!v) return false;
    player.vehicle = v;
    player.onFoot = false;
    v.stolen = true;
    state.carsStolen += 1;
    addWanted(WANTED.stealCar, 'Car stolen — the law noticed.');
    audio.ensure();
    pushEvent('steal', { vehicle: v });
    return true;
  }
  function exitVehicle() {
    if (!player.vehicle && !player.boat) return false;
    const veh = player.vehicle || playerBoat;
    player.x = veh.x - Math.sin(veh.angle + Math.PI / 2) * 3;
    player.z = veh.z - Math.cos(veh.angle + Math.PI / 2) * 3;
    player.y = 0; player.vy = 0;
    player.onFoot = true;
    player.vehicle = null;
    player.boat = false;
    player.angle = veh.angle;
    return true;
  }
  function enterBoat() {
    if (!player.onFoot) return false;
    if (Math.hypot(player.x - playerBoat.x, player.z - playerBoat.z) > 6) return false;
    player.boat = true;
    player.onFoot = false;
    audio.ensure();
    return true;
  }

  // ---- combat ---------------------------------------------------------------
  function shootDir() {
    return { x: -Math.sin(camYaw), z: -Math.cos(camYaw) };
  }
  function shoot() {
    if (!player.onFoot || player.reloading > 0 || player.shootCd > 0) return false;
    const w = WEAPONS[player.weapon];
    if (player.ammo[player.weapon] <= 0) { reloadWeapon(); return false; }
    player.shootCd = w.rate;
    player.ammo[player.weapon] -= 1;
    audio.ensure(); audio.shot(player.weapon);
    muzzle.visible = true;
    muzzle.position.set(player.x - Math.sin(camYaw) * 1.4, 1.6, player.z - Math.cos(camYaw) * 1.4);
    setTimeout(() => { muzzle.visible = false; }, 60);
    const dir = shootDir();
    const pellets = w.pellets || 1;
    let hitAnything = false;
    for (let p = 0; p < pellets; p += 1) {
      const spread = (random() - 0.5) * w.spread * 4;
      const dx = dir.x + Math.cos(camYaw) * spread;
      const dz = dir.z - Math.sin(camYaw) * spread;
      let best = null; let bestD = w.range;
      const consider = (tx, tz, obj) => {
        const vx = tx - player.x; const vz = tz - player.z;
        const d = Math.hypot(vx, vz);
        if (d > w.range || d < 0.5) return;
        const dot = (vx * dx + vz * dz) / d;
        if (dot > 0.985 && d < bestD) { bestD = d; best = obj; }
      };
      for (const ped of peds) if (!ped.dead) consider(ped.x, ped.z, { kind: 'ped', obj: ped });
      for (const cop of cops) if (!cop.dead) consider(cop.x, cop.z, { kind: 'cop', obj: cop });
      for (const v of vehicles) {
        if (v.health <= 0 || v === player.vehicle) continue;
        consider(v.x, v.z, { kind: 'car', obj: v });
      }
      if (best) {
        hitAnything = true;
        if (best.kind === 'ped') {
          best.obj.health -= w.damage;
          if (best.obj.health <= 0 && !best.obj.dead) {
            best.obj.dead = true; best.obj.deadTimer = 0;
            best.obj.mesh.rotation.x = -Math.PI / 2; best.obj.mesh.position.y = 0.4;
            state.kills += 1;
            addWanted(WANTED.killPedestrian, 'Pedestrian down — witnesses called it in.');
          }
        } else if (best.kind === 'cop') {
          best.obj.health -= w.damage;
          if (best.obj.health <= 0 && !best.obj.dead) {
            best.obj.dead = true; best.obj.deadTimer = 0;
            best.obj.mesh.rotation.x = -Math.PI / 2; best.obj.mesh.position.y = 0.4;
            state.kills += 1;
            addWanted(WANTED.killCop, 'Officer down — every unit in Solmar is coming.');
          }
        } else {
          best.obj.health -= w.damage;
          if (best.obj.health < 50) smokeFor(best.obj);
          if (best.obj.health <= 0) {
            best.obj.mesh.rotation.z = 0.2;
            if (best.obj.kind === 'police') addWanted(1, 'Police cruiser wrecked.');
            audio.crash();
          }
        }
      }
    }
    if (!hitAnything && state.wanted === 0) addWanted(WANTED.shootPublic, 'Shots fired in public — someone called the police.');
    else if (hitAnything && state.wanted === 0) addWanted(1, 'Violence in the streets — the police are coming.');
    pushEvent('shoot', { weapon: player.weapon });
    return true;
  }
  function punch() {
    if (!player.onFoot || player.punchCd > 0) return false;
    player.punchCd = PLAYER.punchCooldown;
    audio.ensure(); audio.punch();
    const fx = -Math.sin(player.angle); const fz = -Math.cos(player.angle);
    for (const ped of peds) {
      if (ped.dead) continue;
      const dx = ped.x - player.x; const dz = ped.z - player.z;
      if (Math.hypot(dx, dz) < PLAYER.punchRange && (dx * fx + dz * fz) > 0) {
        ped.health -= PLAYER.punchDamage;
        ped.x += dx * 0.4; ped.z += dz * 0.4;
        ped.fleeing = 4;
        if (ped.health <= 0 && !ped.dead) {
          ped.dead = true; ped.deadTimer = 0;
          ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.4;
          state.kills += 1;
          addWanted(WANTED.killPedestrian, 'Pedestrian down — witnesses called it in.');
        } else {
          addWanted(WANTED.hitPedestrian, 'You hit a pedestrian — witnesses called it in.');
        }
        return true;
      }
    }
    for (const cop of cops) {
      if (cop.dead) continue;
      const dx = cop.x - player.x; const dz = cop.z - player.z;
      if (Math.hypot(dx, dz) < PLAYER.punchRange && (dx * fx + dz * fz) > 0) {
        cop.health -= PLAYER.punchDamage;
        addWanted(1, 'You struck an officer.');
        return true;
      }
    }
    return true;
  }
  function reloadWeapon() {
    const w = WEAPONS[player.weapon];
    if (player.ammo[player.weapon] === w.mag || player.reloading > 0) return;
    player.reloading = w.reload; player.reloadTimer = w.reload;
    audio.ensure(); audio.reload();
  }
  function damagePlayer(n) {
    if (player.invuln > 0) return;
    state.health = Math.max(0, state.health - n);
    player.invuln = 0.6;
    if (state.health <= 0) pushEvent('wasted', {});
  }
  function respawn(afterBusted) {
    const spot = afterBusted ? LANDMARKS.precinct : LANDMARKS.hospital;
    const lost = Math.floor(state.cash * 0.1);
    state.cash -= lost;
    state.health = PLAYER.health;
    state.wanted = 0;
    state.wantedTimer = 0;
    if (player.vehicle) { player.vehicle.speed = 0; player.vehicle = null; }
    player.boat = false;
    player.onFoot = true;
    player.x = spot.x; player.z = spot.z + 30;
    player.y = 0; player.vy = 0;
    player.ammo = WEAPONS.map((w) => w.mag);
    for (const cop of cops) { scene.remove(cop.mesh); }
    cops.length = 0;
    for (const pc of policeCars) { scene.remove(pc.mesh); const i = vehicles.indexOf(pc); if (i >= 0) vehicles.splice(i, 1); }
    policeCars.length = 0;
    heli.visible = false;
    for (const rb of roadblocks) { rb.active = false; rb.mesh.visible = false; }
    if (afterBusted) state.bustedCount += 1; else state.wastedCount += 1;
    say(afterBusted ? `Busted. You lost $${lost} in fines and impound fees.` : `Wasted. The hospital patched you up — $${lost} lighter.`);
    pushEvent('respawn', { lost, busted: afterBusted });
  }
  function setTimeOfDay(h) { state.timeHours = h; updateLighting(); }
  function setCamera(yaw, pitch, dist) { camYaw = yaw; camPitch = pitch; camDist = dist; }
  function refreshCamera() { updateCamera(1 / 60, { dx: 0, dy: 0 }); }
  function toggleChaseCam() { chaseCam = !chaseCam; return chaseCam; }

  function reset() {
    state.cash = 250; state.health = PLAYER.health; state.wanted = 0; state.wantedTimer = 0;
    state.timeHours = 17.4; state.missionIndex = 0; state.missionsDone = 0; state.freeRoam = false;
    state.collectibles = COLLECTIBLES.map(() => false); state.collectiblesFound = 0;
    state.stuntBest = 0; state.stuntPaid = 0; state.kills = 0; state.carsStolen = 0;
    state.bustedCount = 0; state.wastedCount = 0;
    player.x = LANDMARKS.spawn.x; player.z = LANDMARKS.spawn.z; player.y = 0; player.vy = 0;
    player.angle = Math.PI; player.speed = 0; player.onFoot = true; player.vehicle = null; player.boat = false;
    player.weapon = 0; player.ammo = WEAPONS.map((w) => w.mag); player.reloading = 0; player.shootCd = 0; player.punchCd = 0;
    for (const v of vehicles) { if (v.kind === 'parked' || v.kind === 'traffic') { v.health = 100; v.speed = 0; if (v.smoke) v.smoke.visible = false; } }
    for (const ped of peds) { ped.dead = false; ped.health = 50; ped.mesh.rotation.x = 0; ped.mesh.position.y = 0; }
    for (const c of COLLECTIBLES) collectibleMeshes[COLLECTIBLES.indexOf(c)].visible = true;
    setBeacon(0, 0, false); setZone(0, 0, false); setLandZone(0, 0, false);
    targetBoat.active = false; targetBoat.mesh.visible = false;
    updateLighting();
  }
  function getSave() {
    return {
      cash: state.cash, missionIndex: state.missionIndex, missionsDone: state.missionsDone,
      collectibles: state.collectibles, collectiblesFound: state.collectiblesFound,
      stuntBest: state.stuntBest, timeHours: state.timeHours, kills: state.kills,
      x: player.x, z: player.z, freeRoam: state.freeRoam,
    };
  }
  function applySave(s) {
    if (!s) return;
    state.cash = s.cash ?? 250;
    state.missionIndex = s.missionIndex ?? 0;
    state.missionsDone = s.missionsDone ?? 0;
    state.freeRoam = !!s.freeRoam;
    state.collectibles = (s.collectibles || []).map(Boolean);
    state.collectiblesFound = s.collectiblesFound ?? 0;
    state.stuntBest = s.stuntBest ?? 0;
    state.timeHours = s.timeHours ?? 17.4;
    state.kills = s.kills ?? 0;
    player.x = s.x ?? LANDMARKS.spawn.x;
    player.z = s.z ?? LANDMARKS.spawn.z;
    for (let i = 0; i < COLLECTIBLES.length; i += 1) collectibleMeshes[i].visible = !state.collectibles[i];
    updateLighting();
  }
  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function render() { renderer.render(scene, camera); }

  // ---- the simulation step --------------------------------------------------
  let copSpawnTimer = 0;
  let policeSpawnTimer = 0;
  let roadblockTimer = 0;
  let lightTimer = 0;
  function step(dt, input, orbit) {
    state.clock += dt;
    state.timeHours = (state.timeHours + dt / 40) % 24;
    const axes = input.moveAxes();
    const forward = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) };
    const right = { x: Math.cos(camYaw), z: -Math.sin(camYaw) };
    if (player.shootCd > 0) player.shootCd -= dt;
    if (player.punchCd > 0) player.punchCd -= dt;
    if (player.invuln > 0) player.invuln -= dt;
    if (player.reloading > 0) {
      player.reloadTimer -= dt;
      if (player.reloadTimer <= 0) { player.reloading = 0; player.ammo[player.weapon] = WEAPONS[player.weapon].mag; }
    }
    // --- player ------------------------------------------------------------
    if (player.boat) {
      const boat = playerBoat;
      boat.speed += axes.f * 14 * dt;
      boat.speed = clamp(boat.speed, -8, 34);
      boat.speed *= Math.max(0, 1 - 0.4 * dt);
      if (Math.abs(boat.speed) > 0.5) boat.angle += axes.s * 0.9 * dt * Math.sign(boat.speed);
      boat.x += Math.sin(boat.angle) * boat.speed * dt;
      boat.z += Math.cos(boat.angle) * boat.speed * dt;
      boat.x = clamp(boat.x, -300, 300);
      boat.z = clamp(boat.z, 292, 380);
      boat.mesh.position.set(boat.x, 0.3 + Math.sin(state.clock * 2) * 0.15, boat.z);
      boat.mesh.rotation.y = boat.angle;
      boat.mesh.rotation.z = Math.sin(state.clock * 1.4) * 0.03;
      player.x = boat.x; player.z = boat.z;
    } else if (player.vehicle) {
      const v = player.vehicle;
      const steering = axes.s;
      if (axes.f > 0) v.speed += CAR.accel * dt;
      else if (axes.f < 0) v.speed -= (v.speed > 0.5 ? CAR.brake : CAR.accel * 0.6) * dt;
      else v.speed *= Math.max(0, 1 - 0.8 * dt);
      if (input.held.handbrake) { v.speed *= Math.max(0, 1 - 2.2 * dt); if (Math.abs(v.speed) > 12 && random() < dt * 8) audio.skid(); }
      v.speed = clamp(v.speed, -CAR.reverseMax, CAR.maxSpeed);
      const steerAmount = steering * CAR.steer * clamp(Math.abs(v.speed) / 12, 0, 1) * (input.held.handbrake ? 1.6 : 1);
      v.angle += steerAmount * dt * Math.sign(v.speed) * (v.speed >= 0 ? 1 : -1) * 2.2;
      const nx = v.x + Math.sin(v.angle) * v.speed * dt;
      const nz = v.z + Math.cos(v.angle) * v.speed * dt;
      const test = { x: nx, z: nz };
      const hitWall = collideCircle(test, CAR.radius);
      if (hitWall && Math.abs(v.speed) > 9) { audio.crash(); damagePlayer(6); }
      if (hitWall) v.speed *= 0.45;
      v.x = clamp(test.x, -292, 292);
      v.z = clamp(test.z, -292, 290);
      // Ramp launch.
      if (!player.airborne) {
        for (const r of ramps) {
          if (dist2(v.x, v.z, r.x, r.z) < 20 && Math.abs(v.speed) > 16) {
            player.airborne = true; player.vy = 9 + Math.abs(v.speed) * 0.22; player.y = 0.5;
            pushEvent('jump', { speed: v.speed });
            break;
          }
        }
      }
      v.mesh.position.set(v.x, player.y, v.z);
      v.mesh.rotation.y = v.angle;
      for (const w of v.wheels) w.rotation.x += v.speed * dt * 1.8;
      if (v.smoke) { v.smoke.visible = v.health < 50; v.smoke.scale.setScalar(1 + Math.sin(state.clock * 9) * 0.2); }
      if (v.health <= 0 && v.speed !== 0) v.speed = 0;
      player.x = v.x; player.z = v.z;
      if (v.health <= 0) { exitVehicle(); damagePlayer(25); say('Your car is wrecked.'); }
    } else {
      const run = input.held.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const mx = forward.x * axes.f + right.x * axes.s;
      const mz = forward.z * axes.f + right.z * axes.s;
      const len = Math.hypot(mx, mz);
      if (len > 0.01) {
        const nx = player.x + (mx / len) * run * dt;
        const nz = player.z + (mz / len) * run * dt;
        const test = { x: nx, z: nz };
        const onPier = Math.abs(test.x) < 5.5 && test.z > 246 && test.z < 342;
        collideCircle(test, PLAYER.radius);
        test.x = clamp(test.x, -292, 292);
        test.z = clamp(test.z, -292, onPier ? 340 : 291);
        player.x = test.x; player.z = test.z;
        // Face the direction of travel: the mesh's forward is +z after rotation.
        player.angle = Math.atan2(mx / len, mz / len);
        player.walkPhase += dt * run * 1.4;
        player.speed = run;
      } else {
        player.speed = 0;
      }
      playerMesh.position.set(player.x, player.y, player.z);
      playerMesh.rotation.y = player.angle;
      const swing = player.speed > 0 ? Math.sin(player.walkPhase) * 0.5 : 0;
      playerMesh.userData.legL.rotation.x = swing;
      playerMesh.userData.legR.rotation.x = -swing;
      playerMesh.userData.armL.rotation.x = -swing * 0.7;
      playerMesh.userData.armR.rotation.x = swing * 0.7;
    }
    // Airborne arc (car jump).
    if (player.airborne) {
      player.vy -= 24 * dt;
      player.y += player.vy * dt;
      if (player.vehicle) player.vehicle.mesh.position.y = player.y;
      if (player.y <= 0) {
        player.y = 0; player.airborne = false;
        const inZone = state.landZoneActive && dist2(player.x, player.z, state.landZoneX || 0, state.landZoneZ || 0) < 49;
        pushEvent('land', { inZone, speed: player.vehicle ? player.vehicle.speed : 0 });
        if (inZone) {
          const bonus = 600;
          state.cash += bonus; state.stuntPaid += 1;
          state.stuntBest = Math.max(state.stuntBest, 1);
          say(`Clean landing! Stunt bonus +$${bonus}.`);
          audio.jingle();
        } else if (player.vehicle) {
          player.vehicle.speed *= 0.6;
        }
      }
    }
    // --- traffic ------------------------------------------------------------
    for (const v of vehicles) {
      if (v.kind !== 'traffic' || v.health <= 0) continue;
      const target = v.loop[v.loopIndex];
      const dx = target.x - v.x; const dz = target.z - v.z;
      const d = Math.hypot(dx, dz);
      if (d < 4) { v.loopIndex = (v.loopIndex + 1) % v.loop.length; continue; }
      const want = Math.atan2(dx, dz);
      v.angle = angleLerp(v.angle, want, Math.min(1, dt * 2));
      let speed = v.cruise;
      if (player.vehicle && dist2(v.x, v.z, player.x, player.z) < 100) speed *= 0.6;
      v.x += Math.sin(v.angle) * speed * dt;
      v.z += Math.cos(v.angle) * speed * dt;
      v.mesh.position.set(v.x, 0, v.z);
      v.mesh.rotation.y = v.angle;
      for (const w of v.wheels) w.rotation.x += speed * dt * 1.8;
    }
    // Car-vs-car shoves (player car vs traffic/parked).
    // No vehicle ever belongs in the sea: clamp every car back onto land.
    for (const v of vehicles) {
      v.x = clamp(v.x, -292, 292);
      v.z = clamp(v.z, -292, 290);
      v.mesh.position.x = v.x;
      v.mesh.position.z = v.z;
    }
    if (player.vehicle) {
      for (const v of vehicles) {
        if (v === player.vehicle || v.health <= 0) continue;
        const d2 = dist2(v.x, v.z, player.vehicle.x, player.vehicle.z);
        if (d2 < 20) {
          const d = Math.sqrt(d2) || 1;
          const push = (4.6 - d) * 0.5;
          const nx = (v.x - player.vehicle.x) / d; const nz = (v.z - player.vehicle.z) / d;
          v.x += nx * push; v.z += nz * push;
          v.mesh.position.set(v.x, 0, v.z);
          if (Math.abs(player.vehicle.speed) > 8) { v.health -= 8; if (v.health < 50) smokeFor(v); audio.crash(); }
        }
      }
    }
    // --- pedestrians ---------------------------------------------------------
    for (const ped of peds) {
      if (ped.dead) { ped.deadTimer += dt; if (ped.deadTimer > 14) { ped.mesh.visible = false; } continue; }
      if (ped.fleeing > 0) {
        ped.fleeing -= dt;
        const dx = ped.x - player.x; const dz = ped.z - player.z;
        const d = Math.hypot(dx, dz) || 1;
        ped.x += (dx / d) * 6 * dt; ped.z += (dz / d) * 6 * dt;
        ped.angle = Math.atan2(dx / d, dz / d);
      } else if (ped.idle > 0) {
        ped.idle -= dt;
      } else {
        const dx = ped.tx - ped.x; const dz = ped.tz - ped.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.5) {
          if (random() < 0.3) ped.idle = range(random, 1, 4);
          ped.tx = clamp(ped.x + range(random, -70, 70), -280, 280);
          ped.tz = clamp(ped.z + range(random, -70, 70), -240, 240);
        } else {
          ped.angle = angleLerp(ped.angle, Math.atan2(dx, dz), Math.min(1, dt * 4));
          ped.x += Math.sin(ped.angle) * ped.speed * dt;
          ped.z += Math.cos(ped.angle) * ped.speed * dt;
          ped.phase += dt * ped.speed * 2.4;
        }
      }
      ped.x = clamp(ped.x, -285, 285); ped.z = clamp(ped.z, -245, 285);
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.angle;
      const swing = ped.fleeing > 0 ? Math.sin(ped.phase * 2) * 0.7 : Math.sin(ped.phase) * 0.4;
      ped.mesh.userData.legL.rotation.x = swing;
      ped.mesh.userData.legR.rotation.x = -swing;
      // Player car hitting a pedestrian.
      if (player.vehicle && dist2(ped.x, ped.z, player.x, player.z) < 6) {
        ped.dead = true; ped.deadTimer = 0;
        ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.4;
        state.kills += 1;
        addWanted(WANTED.killPedestrian, 'You ran someone over — witnesses called it in.');
        player.vehicle.speed *= 0.7;
        audio.crash();
      }
    }
    // --- police ---------------------------------------------------------------
    const wantCops = state.wanted >= 1 ? Math.min(2 + state.wanted, 5) : 0;
    const liveCops = cops.filter((c) => !c.dead).length;
    copSpawnTimer -= dt;
    if (liveCops < wantCops && copSpawnTimer <= 0) { spawnCop(); copSpawnTimer = 2.5; }
    const wantPoliceCars = state.wanted >= 2 ? Math.min(state.wanted - 1, 3) : 0;
    policeSpawnTimer -= dt;
    if (policeCars.length < wantPoliceCars && policeSpawnTimer <= 0) { spawnPoliceCar(); policeSpawnTimer = 3; }
    if (state.wanted === 0) {
      for (const cop of cops) { if (!cop.dead) { cop.bustedHold = 0; } }
    }
    let bustedPressure = 0;
    for (const cop of cops) {
      if (cop.dead) continue;
      const dx = player.x - cop.x; const dz = player.z - cop.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.5) {
        cop.angle = angleLerp(cop.angle, Math.atan2(dx, dz), Math.min(1, dt * 5));
        cop.x += Math.sin(cop.angle) * cop.speed * dt;
        cop.z += Math.cos(cop.angle) * cop.speed * dt;
        cop.phase += dt * cop.speed * 2;
      }
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.angle;
      cop.mesh.userData.legL.rotation.x = Math.sin(cop.phase) * 0.6;
      cop.mesh.userData.legR.rotation.x = -Math.sin(cop.phase) * 0.6;
      if (player.onFoot && d < 2.4) bustedPressure += dt;
    }
    for (const pc of policeCars) {
      if (pc.health <= 0) continue;
      const dx = player.x - pc.x; const dz = player.z - pc.z;
      const d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      pc.angle = angleLerp(pc.angle, want, Math.min(1, dt * 2.4));
      pc.speed = clamp(pc.speed + (d > 12 ? 26 * dt : -10 * dt), 0, 47);
      pc.x += Math.sin(pc.angle) * pc.speed * dt;
      pc.z += Math.cos(pc.angle) * pc.speed * dt;
      const test = { x: pc.x, z: pc.z };
      if (collideCircle(test, CAR.radius)) { pc.x = test.x; pc.z = test.z; pc.speed *= 0.5; }
      pc.mesh.position.set(pc.x, 0, pc.z);
      pc.mesh.rotation.y = pc.angle;
      for (const w of pc.wheels) w.rotation.x += pc.speed * dt * 1.8;
      if (pc.lightBar) {
        const flash = Math.floor(state.clock * 6) % 2 === 0;
        pc.lightBar.userData.red.material.color.setHex(flash ? 0xff2222 : 0x550000);
        pc.lightBar.userData.blue.material.color.setHex(flash ? 0x000055 : 0x2255ff);
      }
      if (player.vehicle && d < 5) {
        player.vehicle.speed *= Math.max(0, 1 - 1.5 * dt);
        if (pc.speed > 10) { damagePlayer(4); audio.crash(); pc.speed *= 0.4; }
      }
      if (player.onFoot && d < 3.5 && pc.speed < 6) bustedPressure += dt;
    }
    if (bustedPressure > 0 && state.wanted > 0) {
      state.bustedTimer = (state.bustedTimer || 0) + bustedPressure;
      if (state.bustedTimer > 1.4) { state.bustedTimer = 0; pushEvent('busted', {}); }
    } else {
      state.bustedTimer = 0;
    }
    // Helicopter at 4+ stars.
    heli.visible = state.wanted >= 4;
    if (heli.visible) {
      heliAngle += dt * 0.5;
      heli.position.set(player.x + Math.cos(heliAngle) * 26, 62 + Math.sin(state.clock * 0.8) * 3, player.z + Math.sin(heliAngle) * 26);
      heli.rotation.y = Math.atan2(player.x - heli.position.x, player.z - heli.position.z);
      rotor.rotation.y += dt * 22;
      heliLight.lookAt(player.x, 0, player.z);
    }
    // Roadblocks at 4+ stars.
    if (state.wanted >= 4) {
      roadblockTimer -= dt;
      if (roadblockTimer <= 0) {
        roadblockTimer = 18;
        const spots = roadblocks;
        for (let i = 0; i < spots.length; i += 1) {
          const rb = spots[i];
          const ahead = i === 0 ? 70 : -70;
          const roadX = ROADS[Math.floor(random() * ROADS.length)];
          rb.x = clamp(player.x + ahead, -280, 280);
          rb.z = roadX;
          rb.mesh.position.set(rb.x, 0, rb.z);
          rb.mesh.rotation.y = 0;
          rb.mesh.visible = true;
          rb.active = true;
        }
        say('Police roadblocks ahead — find another route.');
      }
      for (const rb of roadblocks) {
        if (!rb.active) continue;
        if (player.vehicle && dist2(player.x, player.z, rb.x, rb.z) < 16) {
          player.vehicle.speed *= 0.3;
          damagePlayer(8);
          audio.crash();
          rb.active = false; rb.mesh.visible = false;
          say('You smashed through a roadblock.');
        }
      }
    } else {
      for (const rb of roadblocks) { rb.active = false; rb.mesh.visible = false; }
    }
    // Wanted decay: quiet for a while and the heat cools off.
    if (state.wanted > 0) {
      const nearestCop = Math.min(
        ...cops.filter((c) => !c.dead).map((c) => Math.hypot(c.x - player.x, c.z - player.z)),
        ...policeCars.map((pc) => Math.hypot(pc.x - player.x, pc.z - player.z)),
        999,
      );
      if (nearestCop > 45) {
        state.wantedTimer += dt;
        if (state.wantedTimer > WANTED.decaySeconds) {
          state.wanted -= 1;
          state.wantedTimer = 0;
          say(state.wanted === 0 ? 'You lost them. The heat is off.' : `Wanted level down — ${state.wanted} star${state.wanted === 1 ? '' : 's'} left.`);
        }
      } else {
        state.wantedTimer = 0;
      }
    }
    // Health regen when calm.
    if (state.wanted === 0 && state.health < PLAYER.health && state.health > 0) {
      state.health = Math.min(PLAYER.health, state.health + 3 * dt);
    }
    // Collectibles.
    for (let i = 0; i < COLLECTIBLES.length; i += 1) {
      if (state.collectibles[i]) continue;
      const c = COLLECTIBLES[i];
      const mesh = collectibleMeshes[i];
      mesh.rotation.y += dt * 1.5;
      mesh.position.y = Math.sin(state.clock * 2 + i) * 0.25;
      if (dist2(player.x, player.z, c.x, c.z) < 9) {
        state.collectibles[i] = true;
        state.collectiblesFound += 1;
        state.cash += 250;
        mesh.visible = false;
        say(`Gold briefcase found (${c.note}) — +$250. ${state.collectiblesFound}/10 collected.`);
        audio.coin();
        pushEvent('collect', { index: i });
      }
    }
    // Target boat (mission 4): runs the coast eastward, loops back.
    if (targetBoat.active) {
      targetBoat.pathT += dt * 0.045;
      const t = targetBoat.pathT % 1;
      targetBoat.x = -260 + t * 520;
      targetBoat.z = 330 + Math.sin(t * Math.PI * 3) * 18;
      const nextT = (targetBoat.pathT + 0.01) % 1;
      const nx = -260 + nextT * 520;
      targetBoat.angle = Math.atan2(nx - targetBoat.x, 0.1);
      targetBoat.mesh.position.set(targetBoat.x, 0.3, targetBoat.z);
      targetBoat.mesh.rotation.y = targetBoat.angle;
    }
    // Beacon pulse, traffic lights, lighthouse beam, sea.
    beaconMat.opacity = 0.28 + Math.sin(state.clock * 4) * 0.12;
    beaconRing.scale.setScalar(1 + Math.sin(state.clock * 4) * 0.08);
    lightTimer -= dt;
    if (lightTimer <= 0) {
      lightTimer = 4;
      const green = random() < 0.5;
      for (const l of trafficLights) l.material.color.setHex(green ? 0x33cc44 : 0xcc3333);
    }
    lightBeam.rotation.y += dt * 0.7;
    towerBeacon.material.color.setHex(Math.floor(state.clock * 2) % 2 === 0 ? 0xff4444 : 0x881111);
    updateLighting();
    updateCamera(dt, orbit);
    audio.update(dt, player.vehicle ? Math.abs(player.vehicle.speed) : player.boat ? Math.abs(playerBoat.speed) : player.speed, state.wanted);
    if (state.health <= 0) pushEvent('wasted', {});
  }

  function takeEvents() {
    const out = events.splice(0, events.length);
    return out;
  }
  function takeMessages() {
    const out = messages.splice(0, messages.length);
    return out;
  }

  updateLighting();
  return {
    state, player, vehicles, peds, cops, policeCars, heli, playerBoat, targetBoat,
    roadblocks, ramps, collectibleMeshes, scene, camera, renderer, buildingCount,
    step, render, resize, setBeacon, setZone, setLandZone, addWanted, setWanted,
    enterNearestVehicle, exitVehicle, enterBoat, shoot, punch, reloadWeapon,
    damagePlayer, respawn, setTimeOfDay, setCamera, refreshCamera, toggleChaseCam, reset, getSave, applySave,
    takeEvents, takeMessages, updateLighting,
    get beaconPos() { return { x: beacon.position.x, z: beacon.position.z, visible: beacon.visible }; },
    get camYaw() { return camYaw; },
    set landZoneActive(v) { state.landZoneActive = v; },
    set landZonePos(p) { state.landZoneX = p.x; state.landZoneZ = p.z; },
  };
}
