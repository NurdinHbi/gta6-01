// Solmar City — procedural coastal city: streets, buildings, beach, pier,
// landmarks (tower, stadium, marina, lighthouse), palms, streetlights,
// stunt ramps and collectible spots. Plus the day/night cycle.
// Authored fresh for round 4 from the design spec.
const THREE = window.THREE;
import { makeRng, clamp, lerp } from './util.js';

export const PITCH = 56;          // street spacing; 10x10 blocks
export const CITY_HALF = 280;     // city spans -280..280 on both axes
export const STREET_AT = [-280, -224, -168, -112, -56, 0, 56, 112, 168, 224, 280];

const BUILDING_COLORS = [0x9aa7b8, 0xb8a58e, 0x8e9fb0, 0xc2b49a, 0x7f8ea0, 0xa89a8c, 0x93a88f, 0xb09890];
const ROOF_COLORS = [0x4a4f57, 0x5b5148, 0x3f4a55, 0x6b5d4f];

function facadeTexture(base, windows, floors, cols) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, 128, 10);
  for (let f = 0; f < floors; f += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lit = Math.random() < 0.35;
      g.fillStyle = lit ? '#ffd98a' : windows;
      g.fillRect(12 + col * ((128 - 24) / cols), 22 + f * ((256 - 34) / floors), 14, 18);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(w, h, d, color, x, y, z, opts) {
  const mat = new THREE.MeshLambertMaterial({ color, ...(opts || {}) });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const city = {
    colliders: [], lamps: [], ramps: [], collectibleSpots: [],
    streetX: STREET_AT.slice(), streetZ: STREET_AT.slice(),
    landmarks: {}, trafficRoutes: [],
  };

  // --- ground: grass base, concrete city slab, sand beach, sea ---
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(900, 1100),
    new THREE.MeshLambertMaterial({ color: 0x5d8a4a }));
  grass.rotation.x = -Math.PI / 2; grass.position.set(100, -0.08, 0); grass.receiveShadow = true;
  scene.add(grass);

  const slab = new THREE.Mesh(new THREE.PlaneGeometry(576, 576),
    new THREE.MeshLambertMaterial({ color: 0x8f8f88 }));
  slab.rotation.x = -Math.PI / 2; slab.position.y = 0; slab.receiveShadow = true;
  scene.add(slab);

  const sand = new THREE.Mesh(new THREE.PlaneGeometry(72, 640),
    new THREE.MeshLambertMaterial({ color: 0xdcc28a }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(-316, 0.01, 0); sand.receiveShadow = true;
  scene.add(sand);

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(420, 900),
    new THREE.MeshLambertMaterial({ color: 0x1e6f9e }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(-560, -0.6, 0);
  scene.add(sea);
  city.sea = sea;

  // --- streets: asphalt strips + pale sidewalks ---
  for (const s of STREET_AT) {
    const roadX = new THREE.Mesh(new THREE.PlaneGeometry(14, 566),
      new THREE.MeshLambertMaterial({ color: 0x3a3d42 }));
    roadX.rotation.x = -Math.PI / 2; roadX.position.set(s, 0.02, 0); roadX.receiveShadow = true;
    scene.add(roadX);
    const roadZ = new THREE.Mesh(new THREE.PlaneGeometry(566, 14),
      new THREE.MeshLambertMaterial({ color: 0x3a3d42 }));
    roadZ.rotation.x = -Math.PI / 2; roadZ.position.set(0, 0.03, s); roadZ.receiveShadow = true;
    scene.add(roadZ);
    const walkX = new THREE.Mesh(new THREE.PlaneGeometry(20, 566),
      new THREE.MeshLambertMaterial({ color: 0x9a9a92 }));
    walkX.rotation.x = -Math.PI / 2; walkX.position.set(s, 0.015, 0);
    scene.add(walkX);
    const walkZ = new THREE.Mesh(new THREE.PlaneGeometry(566, 20),
      new THREE.MeshLambertMaterial({ color: 0x9a9a92 }));
    walkZ.rotation.x = -Math.PI / 2; walkZ.position.set(0, 0.016, s);
    scene.add(walkZ);
  }
  // centre dashes on the two main avenues
  for (let i = -270; i <= 270; i += 18) {
    for (const s of [0]) {
      const d1 = box(1.2, 0.1, 5, 0xd8d8c8, s, 0.04, i);
      const d2 = box(5, 0.1, 1.2, 0xd8d8c8, i, 0.04, s);
      scene.add(d1); scene.add(d2);
    }
  }

  // --- landmarks: which blocks they occupy (block coords 0..9) ---
  const blockCentre = (i) => -252 + i * PITCH;
  const landmarkBlocks = {
    tower: [8, 2], stadium: [1, 7], plaza: [4, 4], park: [7, 7],
    bank: [5, 5], safehouse: [1, 1], garage: [8, 8],
  };
  const isLandmark = (bi, bj) => Object.values(landmarkBlocks).some(([a, b]) => a === bi && b === bj);

  // --- buildings: 1-3 per ordinary block, ~150 total ---
  const facades = [];
  for (let k = 0; k < 4; k += 1) {
    facades.push(facadeTexture(
      '#' + BUILDING_COLORS[k * 2].toString(16).padStart(6, '0'),
      '#2c3a4a', 8 + k * 2, 4 + k));
  }
  const roofMats = ROOF_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  let buildingCount = 0;
  for (let bi = 0; bi < 10; bi += 1) {
    for (let bj = 0; bj < 10; bj += 1) {
      if (isLandmark(bi, bj)) continue;
      const cx = blockCentre(bi);
      const cz = blockCentre(bj);
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k += 1) {
        const w = rng.range(16, 26);
        const d = rng.range(16, 26);
        const h = rng.range(9, 42);
        const ox = rng.range(-8, 8);
        const oz = rng.range(-8, 8);
        const x = cx + ox;
        const z = cz + oz;
        const side = new THREE.MeshLambertMaterial({ map: facades[rng.int(0, facades.length - 1)] });
        const mats = [side, side, roofMats[rng.int(0, roofMats.length - 1)],
          roofMats[0], side, side];
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
        m.position.set(x, h / 2, z);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        city.colliders.push({ x, z, hx: w / 2 + 0.4, hz: d / 2 + 0.4 });
        buildingCount += 1;
      }
    }
  }
  city.buildingCount = buildingCount;

  // --- Solmar Tower (tall landmark, east side) ---
  const tx = blockCentre(landmarkBlocks.tower[0]);
  const tz = blockCentre(landmarkBlocks.tower[1]);
  const towerSide = new THREE.MeshLambertMaterial({ map: facades[3] });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(30, 96, 30),
    [towerSide, towerSide, roofMats[1], roofMats[1], towerSide, towerSide]);
  tower.position.set(tx, 48, tz); tower.castShadow = true;
  scene.add(tower);
  const antenna = box(2, 22, 2, 0x333333, tx, 107, tz);
  scene.add(antenna);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), beaconMat);
  beacon.position.set(tx, 119, tz);
  scene.add(beacon);
  city.beacon = beacon;
  city.colliders.push({ x: tx, z: tz, hx: 16, hz: 16 });
  city.landmarks.tower = { x: tx, z: tz };

  // --- Stadium / arena (south-west) ---
  const sx = blockCentre(landmarkBlocks.stadium[0]);
  const sz = blockCentre(landmarkBlocks.stadium[1]);
  const arena = new THREE.Mesh(new THREE.CylinderGeometry(34, 36, 17, 24),
    new THREE.MeshLambertMaterial({ color: 0xb8452e }));
  arena.position.set(sx, 8.5, sz); arena.castShadow = true;
  scene.add(arena);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 2, 24),
    new THREE.MeshLambertMaterial({ color: 0x3f7a35 }));
  bowl.position.set(sx, 17.5, sz);
  scene.add(bowl);
  city.colliders.push({ x: sx, z: sz, hx: 34, hz: 34 });
  city.landmarks.stadium = { x: sx, z: sz };

  // --- Plaza with fountain (centre) ---
  const px = blockCentre(landmarkBlocks.plaza[0]);
  const pz = blockCentre(landmarkBlocks.plaza[1]);
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 2.4, 20),
    new THREE.MeshLambertMaterial({ color: 0x9db8c4 }));
  fountain.position.set(px, 1.2, pz);
  scene.add(fountain);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 0.6, 20),
    new THREE.MeshLambertMaterial({ color: 0x3d9ec4 }));
  water.position.set(px, 2.4, pz);
  scene.add(water);
  city.colliders.push({ x: px, z: pz, hx: 9, hz: 9 });
  city.landmarks.plaza = { x: px, z: pz };

  // --- Park (trees) ---
  const parkX = blockCentre(landmarkBlocks.park[0]);
  const parkZ = blockCentre(landmarkBlocks.park[1]);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(44, 44),
    new THREE.MeshLambertMaterial({ color: 0x4d7a3c }));
  lawn.rotation.x = -Math.PI / 2; lawn.position.set(parkX, 0.05, parkZ);
  scene.add(lawn);
  for (let i = 0; i < 10; i += 1) {
    const t = makeTree(rng.range(parkX - 18, parkX + 18), rng.range(parkZ - 18, parkZ + 18), rng);
    scene.add(t);
  }
  city.landmarks.park = { x: parkX, z: parkZ };

  // --- Bank (mission site, near centre) ---
  const bx = blockCentre(landmarkBlocks.bank[0]);
  const bz = blockCentre(landmarkBlocks.bank[1]);
  const bank = box(34, 20, 24, 0xd8cba8, bx, 10, bz);
  bank.castShadow = true;
  scene.add(bank);
  const bankSign = box(30, 3, 1, 0x1e4d8c, bx, 21, bz - 12.5);
  scene.add(bankSign);
  const bankDoor = box(6, 8, 1, 0x2a2a2a, bx, 4, bz - 12.5);
  scene.add(bankDoor);
  city.colliders.push({ x: bx, z: bz, hx: 18, hz: 13 });
  city.landmarks.bank = { x: bx, z: bz };

  // --- Safehouse (Mara's crew house) ---
  const hx = blockCentre(landmarkBlocks.safehouse[0]);
  const hz = blockCentre(landmarkBlocks.safehouse[1]);
  const house = box(20, 10, 16, 0xc48a5a, hx, 5, hz);
  house.castShadow = true;
  scene.add(house);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(15, 6, 4),
    new THREE.MeshLambertMaterial({ color: 0x7a3b2e }));
  roof.position.set(hx, 13, hz); roof.rotation.y = Math.PI / 4;
  scene.add(roof);
  city.colliders.push({ x: hx, z: hz, hx: 11, hz: 9 });
  city.landmarks.safehouse = { x: hx, z: hz };

  // --- Pier + lighthouse (west, over the sea) ---
  const pier = box(100, 2, 14, 0x8a6b48, -330, 1, 0);
  pier.castShadow = true;
  scene.add(pier);
  for (let i = 0; i < 6; i += 1) {
    const post = box(1.5, 4, 1.5, 0x5a4630, -296 - i * 16, 0, -6);
    const post2 = box(1.5, 4, 1.5, 0x5a4630, -296 - i * 16, 0, 6);
    scene.add(post); scene.add(post2);
  }
  const lhBase = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 26, 14),
    new THREE.MeshLambertMaterial({ color: 0xf2ede2 }));
  lhBase.position.set(-382, 14, 0); lhBase.castShadow = true;
  scene.add(lhBase);
  const lhBand = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 5, 14),
    new THREE.MeshLambertMaterial({ color: 0xc23b2e }));
  lhBand.position.set(-382, 20, 0);
  scene.add(lhBand);
  const lhLampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const lhLamp = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 10), lhLampMat);
  lhLamp.position.set(-382, 29, 0);
  scene.add(lhLamp);
  city.lighthouseLamp = lhLamp;
  city.colliders.push({ x: -382, z: 0, hx: 7, hz: 7 });
  city.landmarks.pierEnd = { x: -378, z: 0 };
  city.landmarks.lighthouse = { x: -382, z: 0 };

  // --- Marina (south end of the beach) ---
  const marinaX = -306;
  const marinaZ = 150;
  const dock = box(10, 1.5, 70, 0x8a6b48, marinaX, 0.8, marinaZ);
  scene.add(dock);
  city.landmarks.marina = { x: marinaX + 6, z: marinaZ };
  city.landmarks.marinaDock = { x: marinaX, z: marinaZ };

  // --- Palms along the beach and plaza ---
  for (let i = 0; i < 26; i += 1) {
    const z = -300 + i * 24 + rng.range(-6, 6);
    scene.add(makePalm(-288 + rng.range(-4, 4), z, rng));
  }
  for (let i = 0; i < 8; i += 1) {
    scene.add(makePalm(px + rng.range(-22, 22), pz + rng.range(-22, 22), rng));
  }

  // --- Streetlights on every other intersection ---
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx2 of STREET_AT) {
    for (const sz2 of STREET_AT) {
      if (((sx2 + sz2) / PITCH) % 2 !== 0) continue;
      if (Math.abs(sx2) > 280 || Math.abs(sz2) > 280) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 7, 6),
        new THREE.MeshLambertMaterial({ color: 0x2e2e2e }));
      pole.position.set(sx2 + 8, 3.5, sz2 + 8);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), lampMat.clone());
      lamp.position.set(sx2 + 8, 7.2, sz2 + 8);
      scene.add(lamp);
      city.lamps.push(lamp);
    }
  }

  // --- Stunt jump ramps on three avenues ---
  const rampSpots = [
    { x: 0, z: -140, angle: 0 },
    { x: 112, z: 84, angle: Math.PI / 2 },
    { x: -112, z: 168, angle: -Math.PI / 2 },
  ];
  for (const r of rampSpots) {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 14),
      new THREE.MeshLambertMaterial({ color: 0xe8a13a }));
    ramp.position.set(r.x, 1.2, r.z);
    ramp.rotation.y = r.angle;
    ramp.rotation.x = -0.32;
    ramp.castShadow = true;
    scene.add(ramp);
    const chevron = box(9, 0.2, 2, 0x222222, r.x, 2.4, r.z);
    chevron.rotation.y = r.angle;
    scene.add(chevron);
    city.ramps.push({ x: r.x, z: r.z, angle: r.angle });
  }

  // --- Collectible package spots (12, spread over the city) ---
  const spots = [
    [-252, -252], [252, -252], [-252, 252], [252, 252], [0, -196], [-196, 0],
    [196, 56], [56, 196], [-140, 140], [140, -140], [-280, 84], [224, -196],
  ];
  for (const [x, z] of spots) city.collectibleSpots.push({ x, z });

  // --- Traffic loops: rectangular loops around blocks ---
  for (let i = 0; i < 10; i += 1) {
    const bi = rng.int(0, 8);
    const bj = rng.int(0, 8);
    const x0 = blockCentre(bi) - PITCH / 2;
    const x1 = blockCentre(bi) + PITCH / 2;
    const z0 = blockCentre(bj) - PITCH / 2;
    const z1 = blockCentre(bj) + PITCH / 2;
    city.trafficRoutes.push([
      { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
    ]);
  }

  // --- Lights ---
  city.sun = new THREE.DirectionalLight(0xffffff, 1.0);
  city.sun.position.set(120, 180, 60);
  city.sun.castShadow = true;
  city.sun.shadow.mapSize.set(1024, 1024);
  city.sun.shadow.camera.left = -320;
  city.sun.shadow.camera.right = 320;
  city.sun.shadow.camera.top = 320;
  city.sun.shadow.camera.bottom = -320;
  city.sun.shadow.camera.far = 700;
  scene.add(city.sun);
  city.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x5a6b4a, 0.6);
  scene.add(city.hemi);
  scene.fog = new THREE.Fog(0x87b5e0, 320, 900);
  city.scene = scene;
  applyTimeOfDay(city, 10.5);
  return city;
}

function makeTree(x, z, rng) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
  trunk.position.y = 2;
  g.add(trunk);
  const top = new THREE.Mesh(new THREE.SphereGeometry(rng.range(2.4, 3.4), 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x3f7a35 }));
  top.position.y = 5.5;
  g.add(top);
  g.position.set(x, 0, z);
  return g;
}

function makePalm(x, z, rng) {
  const g = new THREE.Group();
  const lean = rng.range(-0.12, 0.12);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6),
    new THREE.MeshLambertMaterial({ color: 0x7a5a38 }));
  trunk.position.y = 3.5;
  trunk.rotation.z = lean;
  g.add(trunk);
  for (let i = 0; i < 6; i += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.2, 4),
      new THREE.MeshLambertMaterial({ color: 0x2e8a3e }));
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.8, 7.2, Math.sin(a) * 1.8);
    leaf.rotation.z = Math.cos(a) * 1.1;
    leaf.rotation.x = -Math.sin(a) * 1.1;
    g.add(leaf);
  }
  const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0x8a6b3a }));
  nuts.position.y = 6.6;
  g.add(nuts);
  g.position.set(x, 0, z);
  return g;
}

// Time of day in hours (0-24). Drives sun, sky, fog and lamp glow.
export function applyTimeOfDay(city, hours) {
  const h = ((hours % 24) + 24) % 24;
  const dayT = clamp(Math.sin(((h - 6) / 12) * Math.PI), -1, 1); // 1 at noon, -1 at midnight
  const sunUp = dayT > 0;
  const elev = Math.asin(clamp(dayT, -1, 1));
  const azim = ((h - 6) / 12) * Math.PI;
  const R = 420;
  city.sun.position.set(Math.cos(azim) * R * 0.6, Math.sin(elev) * R + 20, 160);
  const golden = sunUp && (h < 8.5 || h > 16.5);
  const daySky = new THREE.Color(0x87b5e0);
  const goldenSky = new THREE.Color(0xf7a85c);
  const nightSky = new THREE.Color(0x0b1026);
  let sky;
  if (!sunUp) sky = nightSky.clone();
  else if (golden) sky = goldenSky.clone().lerp(daySky, clamp((Math.abs(h - 12) - 4.5) / 3, 0, 1));
  else sky = daySky.clone();
  city.scene.background = sky;
  city.scene.fog.color.copy(sky);
  city.sun.intensity = sunUp ? lerp(0.35, 1.15, clamp(dayT, 0, 1)) : 0.06;
  city.sun.color.setHex(golden ? 0xffb36b : 0xfff2dd);
  city.hemi.intensity = sunUp ? lerp(0.35, 0.65, clamp(dayT, 0, 1)) : 0.18;
  const lampGlow = sunUp ? (golden ? 0.7 : 0.15) : 2.4;
  for (const lamp of city.lamps) lamp.material.color.setHex(lampGlow > 1 ? 0xfff2b0 : 0x8a8a7a);
  city.lighthouseLamp.material.color.setHex(sunUp ? 0xd8d8c8 : 0xfff2b0);
  city.isNight = !sunUp;
  city.isGolden = golden;
  city.hours = h;
  return city;
}
