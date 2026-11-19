// Solmar City: procedural coastal city built from a fixed seed so every load
// (and every screenshot) sees the same streets. ~10x10 blocks, ~150 buildings,
// beach, pier, palms, streetlights. No external assets.
const CITY = {
  MIN: -150, MAX: 150, PITCH: 30, BLOCK: 20, GRID: 10,
  ROAD_CENTERS: [-125, -95, -65, -35, -5, 25, 55, 85, 115, 145],
  SPAWN: { x: -2, z: 136, heading: Math.PI },
  HOSPITAL: { x: -110, z: -110 },
  BANK: { x: 100, z: -20 },
  HIDEOUT: { x: -95, z: -135 },
  DROPOFF: { x: 145, z: 125 },
  PIZZA_SPOTS: [{ x: 115, z: 95 }, { x: -95, z: 45 }, { x: 25, z: -105 }],
};

function makeGroundTexture() {
  const S = 2048, WORLD = 640, scale = S / WORLD; // world [-320,320] -> canvas
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  const X = (x) => (x + 320) * scale;
  const Z = (z) => (z + 320) * scale;
  // Base urban ground.
  g.fillStyle = '#2c2f2c'; g.fillRect(0, 0, S, S);
  // Beach sand (south strip, z 150..192).
  g.fillStyle = '#d3b67e'; g.fillRect(0, Z(150), S, Z(192) - Z(150));
  // Wet sand band at the waterline.
  g.fillStyle = '#b89a62'; g.fillRect(0, Z(186), S, Z(192) - Z(186));
  // Sidewalk blocks.
  g.fillStyle = '#5d6058';
  for (let i = 0; i < CITY.GRID; i++) {
    for (let j = 0; j < CITY.GRID; j++) {
      const x0 = CITY.MIN + i * CITY.PITCH, z0 = CITY.MIN + j * CITY.PITCH;
      g.fillRect(X(x0), Z(z0), CITY.BLOCK * scale, CITY.BLOCK * scale);
    }
  }
  // Roads: dark asphalt over the gaps between blocks, plus a ring road.
  g.fillStyle = '#232527';
  for (const c of CITY.ROAD_CENTERS) {
    g.fillRect(X(c - 5), Z(CITY.MIN - 10), 10 * scale, (CITY.MAX - CITY.MIN + 20) * scale);
    g.fillRect(X(CITY.MIN - 10), Z(c - 5), (CITY.MAX - CITY.MIN + 20) * scale, 10 * scale);
  }
  // Lane dashes.
  g.fillStyle = '#c9c9a8';
  for (const c of CITY.ROAD_CENTERS) {
    for (let t = CITY.MIN; t < CITY.MAX; t += 12) {
      g.fillRect(X(c - 0.25), Z(t), 0.5 * scale, 4 * scale);
      g.fillRect(X(t), Z(c - 0.25), 4 * scale, 0.5 * scale);
    }
  }
  // Crosswalks at intersections.
  g.fillStyle = '#d9d9d2';
  for (const cx of CITY.ROAD_CENTERS) {
    for (const cz of CITY.ROAD_CENTERS) {
      for (let k = -2; k <= 2; k++) {
        g.fillRect(X(cx + k * 1.6 - 0.5), Z(cz - 5), 1 * scale, 2.4 * scale);
        g.fillRect(X(cx + k * 1.6 - 0.5), Z(cz + 2.6), 1 * scale, 2.4 * scale);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}

function makeFacadeTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 128, 256);
  const rng = mulberry32(777);
  for (let r = 0; r < 14; r++) {
    for (let c = 0; c < 6; c++) {
      const lit = rng() < 0.28;
      g.fillStyle = lit ? '#ffd98a' : '#232a33';
      g.fillRect(8 + c * 20, 10 + r * 17, 13, 11);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

function buildCity(scene) {
  const rng = mulberry32(1337);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // Ground + water.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 640),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  group.add(ground);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 140),
    new THREE.MeshLambertMaterial({ color: 0x2f8fb8, transparent: true, opacity: 0.92 })
  );
  water.rotation.x = -Math.PI / 2;
  // Above the ground plane (y=0): the sea sits past the sand strip, and the
  // ground's dark base color would otherwise hide it from above.
  water.position.set(0, 0.05, 262);
  group.add(water);

  // ---- Buildings (instanced) ----
  const facadeTex = makeFacadeTexture();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const boxMat = new THREE.MeshLambertMaterial({ map: facadeTex });
  const placements = [];
  const palette = [0xc9b8a3, 0xa88f7a, 0x8fa3b8, 0xb8b0a0, 0x9a8f8a, 0x7d94a6, 0xc4a882, 0x8a97a3, 0xb59a90, 0x6f7f92];
  for (let i = 0; i < CITY.GRID; i++) {
    for (let j = 0; j < CITY.GRID; j++) {
      const bx = CITY.MIN + i * CITY.PITCH, bz = CITY.MIN + j * CITY.PITCH;
      const roll = rng();
      if (roll < 0.14) continue; // park / plaza block: no building
      const count = rng() < 0.62 ? 1 : 2;
      for (let k = 0; k < count; k++) {
        const w = 8 + rng() * 8, d = 8 + rng() * 8;
        const h = 7 + Math.pow(rng(), 1.8) * 34;
        let x, z;
        if (count === 1) { x = bx + 10; z = bz + 10; }
        else { x = bx + (k === 0 ? 6.5 : 13.5); z = bz + (k === 0 ? 6.5 : 13.5); }
        // Keep the footprint inside the block.
        const hw = Math.min(w, 15) / 2, hd = Math.min(d, 15) / 2;
        x = clamp(x, bx + 2 + hw, bx + 18 - hw);
        z = clamp(z, bz + 2 + hd, bz + 18 - hd);
        placements.push({ x, z, w: hw * 2, d: hd * 2, h, color: palette[Math.floor(rng() * palette.length)] });
        colliders.push({ x0: x - hw - 0.3, z0: z - hd - 0.3, x1: x + hw + 0.3, z1: z + hd + 0.3 });
      }
    }
  }
  const buildings = new THREE.InstancedMesh(boxGeo, boxMat, placements.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  placements.forEach((b, idx) => {
    p.set(b.x, 0, b.z); s.set(b.w, b.h, b.d);
    m4.compose(p, q, s);
    buildings.setMatrixAt(idx, m4);
    buildings.setColorAt(idx, col.setHex(b.color));
  });
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  group.add(buildings);

  // Rooftop boxes on the tallest few, for skyline variety.
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x555a60 });
  const roofs = [];
  placements.forEach((b) => { if (b.h > 26 && rng() < 0.5) roofs.push(b); });
  const roofMesh = new THREE.InstancedMesh(roofGeo, roofMat, Math.max(1, roofs.length));
  roofMesh.count = roofs.length;
  roofs.forEach((b, idx) => {
    p.set(b.x, b.h, b.z); s.set(b.w * 0.35, 2.5, b.d * 0.35);
    m4.compose(p, q, s);
    roofMesh.setMatrixAt(idx, m4);
  });
  roofMesh.instanceMatrix.needsUpdate = true;
  group.add(roofMesh);

  // ---- Palms (instanced trunks + canopies) ----
  const palmSpots = [];
  for (let x = -150; x <= 150; x += 13) palmSpots.push({ x: x + (rng() - 0.5) * 5, z: 158 + rng() * 22 });
  for (let i = 0; i < 26; i++) {
    const bx = CITY.MIN + Math.floor(rng() * CITY.GRID) * CITY.PITCH;
    const bz = CITY.MIN + Math.floor(rng() * CITY.GRID) * CITY.PITCH;
    palmSpots.push({ x: bx + 2 + rng() * 16, z: bz + 2 + rng() * 16 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 7, 6);
  trunkGeo.translate(0, 3.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const canopyGeo = new THREE.IcosahedronGeometry(2.6, 0);
  canopyGeo.scale(1, 0.45, 1);
  canopyGeo.translate(0, 7.4, 0);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2f7d3a });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, palmSpots.length);
  palmSpots.forEach((pt, idx) => {
    const lean = (rng() - 0.5) * 0.16;
    q.setFromEuler(new THREE.Euler(lean, rng() * Math.PI * 2, 0));
    p.set(pt.x, 0, pt.z); s.set(1, 0.85 + rng() * 0.4, 1);
    m4.compose(p, q, s);
    trunks.setMatrixAt(idx, m4);
    canopies.setMatrixAt(idx, m4);
    if (pt.z < 150) colliders.push({ x0: pt.x - 0.4, z0: pt.z - 0.4, x1: pt.x + 0.4, z1: pt.z + 0.4 });
  });
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  group.add(trunks); group.add(canopies);

  // ---- Streetlights at intersections ----
  const lampSpots = [];
  for (const cx of CITY.ROAD_CENTERS) {
    for (const cz of CITY.ROAD_CENTERS) {
      if (((cx + cz) / 30) % 2 === 0) lampSpots.push({ x: cx + 6, z: cz + 6 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6);
  poleGeo.translate(0, 2.7, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const bulbGeo = new THREE.SphereGeometry(0.28, 8, 6);
  bulbGeo.translate(0, 5.5, 0);
  const bulbMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffd76a, emissiveIntensity: 0.7 });
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampSpots.length);
  q.identity();
  lampSpots.forEach((pt, idx) => {
    p.set(pt.x, 0, pt.z); s.set(1, 1, 1);
    m4.compose(p, q, s);
    poles.setMatrixAt(idx, m4);
    bulbs.setMatrixAt(idx, m4);
  });
  poles.instanceMatrix.needsUpdate = true;
  bulbs.instanceMatrix.needsUpdate = true;
  group.add(poles); group.add(bulbs);

  // ---- Pier (south, into the water) ----
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 84), woodMat);
  deck.position.set(0, 0.15, 192);
  group.add(deck);
  const platform = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 14), woodMat);
  platform.position.set(0, 0.15, 238);
  group.add(platform);
  const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 2.0, 6);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x5d4630 });
  const posts = new THREE.InstancedMesh(postGeo, postMat, 24);
  let pi = 0;
  for (let z = 156; z <= 236; z += 8) {
    for (const dx of [-4.4, 4.4]) {
      p.set(dx, 0.2, z); s.set(1, 1, 1); q.identity();
      m4.compose(p, q, s);
      posts.setMatrixAt(pi++, m4);
    }
  }
  for (let k = 0; k < 4; k++) {
    p.set(k < 2 ? -8 : 8, 0.2, 238 + (k % 2 ? 5 : -5)); s.set(1, 1, 1);
    m4.compose(p, q, s);
    posts.setMatrixAt(pi++, m4);
  }
  posts.instanceMatrix.needsUpdate = true;
  group.add(posts);
  // No collider on the pier entrance: the walkway is foot-only, cars are
  // clamped to z <= 150 by the driving code instead.

  // ---- Crates / dumpsters (cover + colliders) ----
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x6b5a34 });
  const crateGeo = new THREE.BoxGeometry(2.2, 2.2, 2.2);
  for (let i = 0; i < 18; i++) {
    const bx = CITY.MIN + Math.floor(rng() * CITY.GRID) * CITY.PITCH;
    const bz = CITY.MIN + Math.floor(rng() * CITY.GRID) * CITY.PITCH;
    const x = bx + 3 + rng() * 14, z = bz + 3 + rng() * 14;
    const crate = new THREE.Mesh(crateGeo, crateMat);
    crate.position.set(x, 1.1, z);
    crate.rotation.y = rng() * Math.PI;
    group.add(crate);
    colliders.push({ x0: x - 1.3, z0: z - 1.3, x1: x + 1.3, z1: z + 1.3 });
  }

  // Landmark meshes: hospital (white tower, respawn point) and bank (stone block).
  const hosp = new THREE.Mesh(new THREE.BoxGeometry(16, 26, 12),
    new THREE.MeshLambertMaterial({ color: 0xe8e8e2 }));
  hosp.position.set(CITY.HOSPITAL.x, 13, CITY.HOSPITAL.z);
  group.add(hosp);
  colliders.push({ x0: CITY.HOSPITAL.x - 8.3, z0: CITY.HOSPITAL.z - 6.3, x1: CITY.HOSPITAL.x + 8.3, z1: CITY.HOSPITAL.z + 6.3 });
  const bank = new THREE.Mesh(new THREE.BoxGeometry(18, 12, 14),
    new THREE.MeshLambertMaterial({ color: 0xb8a88a }));
  bank.position.set(CITY.BANK.x, 6, CITY.BANK.z);
  group.add(bank);
  colliders.push({ x0: CITY.BANK.x - 9.3, z0: CITY.BANK.z - 7.3, x1: CITY.BANK.x + 9.3, z1: CITY.BANK.z + 7.3 });

  return {
    group, colliders, buildingCount: placements.length,
    bounds: { minX: -162, maxX: 162, minZ: -162, maxZ: 244 },
  };
}

// Nearest road-center coordinate on one axis.
function nearestRoad(v) {
  let best = CITY.ROAD_CENTERS[0], bd = 1e9;
  for (const c of CITY.ROAD_CENTERS) { const d = Math.abs(v - c); if (d < bd) { bd = d; best = c; } }
  return best;
}
