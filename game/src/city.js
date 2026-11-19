// Solmar City itself: a procedural coastal grid built fresh from the seed — ten by ten
// blocks of stucco towers, glass offices and low shops, ringed by streets, with a sand
// beach and a wooden pier on the south shore. Everything is boxes, cylinders and canvas
// textures (no external assets), and every building leaves an axis-aligned collider
// behind for the player, cars and AI to bump into.

import * as THREE from 'three';

export const PITCH = 56;
export const HALF = 280;
export const BEACH_Z = 280;
export const WATER_Z = 322;

/** Warm coastal palette for facades, awnings and trim. */
const FACADE_BASES = ['#e8c9a0', '#d9a06b', '#f2e3c6', '#c98f7a', '#b7c9d6', '#e6d5b8', '#a8b8c8', '#dba878'];
const GLASS_BASES = ['#5f7f96', '#4d6f8a', '#6b8ba0', '#3f5f78'];
const ROOF_COLOR = 0x3a3f4a;
const ROAD_COLOR = 0x2b2f38;
const GROUND_COLOR = 0x9aa0a8;

function facadeTexture(base, glass, rng) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  const cols = 4 + Math.floor(rng.next() * 3);
  const rows = 8 + Math.floor(rng.next() * 6);
  const cw = 128 / cols;
  const ch = 256 / rows;
  for (let x = 0; x < cols; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      const lit = rng.next() < 0.28;
      g.fillStyle = lit ? '#ffd98a' : glass;
      g.fillRect(x * cw + 4, y * ch + 5, cw - 8, ch - 10);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x * cw + 4, y * ch + 5, cw - 8, 3);
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, 128, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function roadTexture(alongU) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#2b2f38';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#e8e4d8';
  if (alongU) g.fillRect(6, 30, 22, 4);
  else g.fillRect(30, 6, 4, 22);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(0, 0, 64, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePalm(rng) {
  const palm = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b4a });
  const leafMat = new THREE.MeshLambertMaterial({ color: rng.pick([0x2f8f4e, 0x3aa655, 0x27803f]) });
  const height = rng.range(4.5, 7);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, height, 6), trunkMat);
  trunk.position.y = height / 2;
  trunk.rotation.z = rng.range(-0.08, 0.08);
  palm.add(trunk);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(rng.range(1.6, 2.2), rng.range(1.4, 2), 7), leafMat);
  crown.position.y = height + 0.6;
  crown.scale.y = 0.7;
  palm.add(crown);
  const coconuts = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
  coconuts.position.y = height - 0.2;
  palm.add(coconuts);
  return palm;
}

function makeLamp() {
  const group = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x22262e });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.4, 6), dark);
  pole.position.y = 3.2;
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), dark);
  arm.position.set(0.7, 6.3, 0);
  group.add(arm);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffdf80, emissiveIntensity: 0.9 }),
  );
  head.position.set(1.4, 6.2, 0);
  group.add(head);
  return group;
}

/**
 * Build the whole city into `scene`. Returns colliders, named landmark spots, parked-car
 * bays, minimap rectangles and a small per-frame updater (water shimmer).
 */
export function buildCity(scene, rng) {
  const colliders = [];
  const buildingRects = [];
  const parkedSpots = [];
  const group = new THREE.Group();
  scene.add(group);

  // Ground: pale concrete that reads as sidewalk between the dark road strips.
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(HALF * 2 + 60, 1, HALF * 2 + 140),
    new THREE.MeshLambertMaterial({ color: GROUND_COLOR }),
  );
  ground.position.set(0, -0.5, 60);
  ground.receiveShadow = true;
  group.add(ground);

  // Beach sand and the sea beyond it.
  const sand = new THREE.Mesh(
    new THREE.BoxGeometry(HALF * 2 + 60, 1, 46),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }),
  );
  sand.position.set(0, -0.4, BEACH_Z + 22);
  sand.receiveShadow = true;
  group.add(sand);
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x1e6f8e, transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 400, 420), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.25, WATER_Z + 210);
  group.add(water);

  // Roads: one strip per grid line, both directions, with a dashed-centre texture.
  const roadTexH = roadTexture(true);
  roadTexH.repeat.set(70, 1);
  const roadTexV = roadTexture(false);
  roadTexV.repeat.set(1, 70);
  const roadMatH = new THREE.MeshLambertMaterial({ map: roadTexH });
  const roadMatV = new THREE.MeshLambertMaterial({ map: roadTexV });
  for (let k = -5; k <= 5; k += 1) {
    const at = k * PITCH;
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 12), roadMatH);
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(0, 0.06, at);
    hRoad.receiveShadow = true;
    group.add(hRoad);
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(12, HALF * 2), roadMatV);
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(at, 0.06, 0);
    vRoad.receiveShadow = true;
    group.add(vRoad);
  }

  // Buildings, block by block. A block either holds 1-4 towers, a palm park, or a lot.
  const facadeTexs = [];
  for (let i = 0; i < 5; i += 1) {
    facadeTexs.push(facadeTexture(FACADE_BASES[i % FACADE_BASES.length], GLASS_BASES[i % GLASS_BASES.length], rng));
  }
  const glassTexs = [];
  for (let i = 0; i < 3; i += 1) {
    glassTexs.push(facadeTexture(GLASS_BASES[i], '#9fc4d8', rng));
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: ROOF_COLOR });
  const shopColors = [0xd95f4b, 0x4b8fd9, 0x53b06a, 0xe0a53c, 0x9b6bd9, 0x3fb8a6];

  let buildingCount = 0;
  for (let bx = -5; bx <= 4; bx += 1) {
    for (let bz = -5; bz <= 4; bz += 1) {
      const cx = bx * PITCH + PITCH / 2;
      const cz = bz * PITCH + PITCH / 2;
      const roll = rng.next();
      if (roll < 0.1) {
        // Palm park: a green square with a few palms and a bench block.
        const lawn = new THREE.Mesh(
          new THREE.BoxGeometry(40, 0.6, 40),
          new THREE.MeshLambertMaterial({ color: 0x4d8f4a }),
        );
        lawn.position.set(cx, 0.3, cz);
        lawn.receiveShadow = true;
        group.add(lawn);
        for (let p = 0; p < 4; p += 1) {
          const palm = makePalm(rng);
          palm.position.set(cx + rng.range(-15, 15), 0.6, cz + rng.range(-15, 15));
          group.add(palm);
        }
        continue;
      }
      if (roll < 0.16) {
        // Open parking lot with painted bays.
        const lot = new THREE.Mesh(
          new THREE.BoxGeometry(42, 0.4, 42),
          new THREE.MeshLambertMaterial({ color: 0x6d727c }),
        );
        lot.position.set(cx, 0.2, cz);
        lot.receiveShadow = true;
        group.add(lot);
        continue;
      }
      const nearCentre = Math.abs(cx) + Math.abs(cz) < 170;
      const count = nearCentre ? rng.int(2, 4) : rng.int(1, 3);
      const slots = [
        [-11, -11], [11, -11], [-11, 11], [11, 11],
      ];
      for (let s = 0; s < count; s += 1) {
        const [ox, oz] = slots[s];
        const w = rng.range(11, 19);
        const d = rng.range(11, 19);
        const tall = nearCentre && rng.chance(0.4);
        const h = tall ? rng.range(26, 46) : rng.range(8, 22);
        const x = cx + ox + rng.range(-2, 2);
        const z = cz + oz + rng.range(-2, 2);
        const tex = tall ? rng.pick(glassTexs) : rng.pick(facadeTexs);
        const sideMat = new THREE.MeshLambertMaterial({ map: tex });
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat],
        );
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        // Roof clutter: a vent box and, on tall towers, a blinking beacon.
        const vent = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.4), roofMat);
        vent.position.set(x + rng.range(-3, 3), h + 0.6, z + rng.range(-3, 3));
        group.add(vent);
        if (tall && rng.chance(0.5)) {
          const beacon = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 8, 6),
            new THREE.MeshLambertMaterial({ color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 1.4 }),
          );
          beacon.position.set(x, h + 1.4, z);
          group.add(beacon);
        }
        // A coloured shop awning on low buildings.
        if (h < 14 && rng.chance(0.55)) {
          const awning = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.9, 0.5, 3),
            new THREE.MeshLambertMaterial({ color: rng.pick(shopColors) }),
          );
          awning.position.set(x, 3.4, z + d / 2 + 1.2);
          group.add(awning);
        }
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        buildingRects.push({ x: x - w / 2, z: z - d / 2, w, d });
        buildingCount += 1;
      }
    }
  }

  // Beach palms in two loose rows, and a few palms in the parks' streets.
  for (let i = 0; i < 34; i += 1) {
    const palm = makePalm(rng);
    palm.position.set(rng.range(-HALF + 8, HALF - 8), 0, BEACH_Z + rng.range(4, 38));
    group.add(palm);
  }
  for (let i = 0; i < 14; i += 1) {
    const palm = makePalm(rng);
    const along = rng.pick([-224, -168, -112, -56, 0, 56, 112, 168, 224]);
    palm.position.set(along + rng.range(-4, 4), 0, rng.range(-HALF + 20, HALF - 20));
    group.add(palm);
  }

  // Streetlights at every other intersection corner.
  for (let gx = -4; gx <= 4; gx += 2) {
    for (let gz = -4; gz <= 4; gz += 2) {
      const lamp = makeLamp();
      lamp.position.set(gx * PITCH + 8, 0, gz * PITCH + 8);
      group.add(lamp);
    }
  }

  // The pier: planks out into the sea, posts, lamps and a bait hut at the end.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9a7a52 });
  for (let z = BEACH_Z + 6; z <= 392; z += 4) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 3.6), pierMat);
    plank.position.set(0, 1.1, z);
    plank.castShadow = true;
    group.add(plank);
  }
  for (const side of [-4.6, 4.6]) {
    for (let z = BEACH_Z + 8; z <= 390; z += 16) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.6, 6), pierMat);
      post.position.set(side, 0.4, z);
      group.add(post);
    }
  }
  const hut = new THREE.Mesh(
    new THREE.BoxGeometry(7, 4, 6),
    new THREE.MeshLambertMaterial({ color: 0x4b8fd9 }),
  );
  hut.position.set(0, 3.1, 388);
  hut.castShadow = true;
  group.add(hut);
  const hutRoof = new THREE.Mesh(
    new THREE.ConeGeometry(5.4, 2.4, 4),
    new THREE.MeshLambertMaterial({ color: 0xd95f4b }),
  );
  hutRoof.position.set(0, 6.3, 388);
  hutRoof.rotation.y = Math.PI / 4;
  group.add(hutRoof);
  colliders.push({ minX: -3.5, maxX: 3.5, minZ: 385, maxZ: 391 });

  // Parked-car bays: tucked against curbs all over the grid.
  for (let i = 0; i < 12; i += 1) {
    const vertical = rng.chance(0.5);
    const line = rng.pick([-224, -168, -112, -56, 0, 56, 112, 168, 224]);
    const along = rng.range(-HALF + 30, HALF - 30);
    const x = vertical ? line + 8.5 : along;
    const z = vertical ? along : line + 8.5;
    const heading = vertical ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    parkedSpots.push({ x, z, heading });
  }

  // Named landmarks the missions and the respawns use.
  const landmarks = {
    mara: { x: 10, z: 34 },
    hospital: { x: -84, z: -28 },
    policeStation: { x: 84, z: 28 },
    garage: { x: -196, z: 140 },
    pizza: { x: 140, z: -84 },
    houses: [
      { x: -140, z: 196 },
      { x: 196, z: 84 },
      { x: -28, z: -196 },
    ],
    bank: { x: 84, z: -140 },
    safehouse: { x: -224, z: -224 },
    plaza: { x: 0, z: 0 },
  };

  // A gold "MARA" kiosk where the fixer waits, so the player can find her on foot.
  const kiosk = new THREE.Mesh(
    new THREE.BoxGeometry(5, 3.4, 4),
    new THREE.MeshLambertMaterial({ color: 0xffd23f }),
  );
  kiosk.position.set(landmarks.mara.x + 4, 1.7, landmarks.mara.z);
  kiosk.castShadow = true;
  group.add(kiosk);

  return {
    colliders,
    buildingRects,
    parkedSpots,
    landmarks,
    buildingCount,
    /** Gentle sea shimmer; cheap and visible from the pier. */
    update(t) {
      waterMat.opacity = 0.88 + Math.sin(t * 0.7) * 0.04;
    },
  };
}

/** True when a point sits on a road strip (within the asphalt). */
export function onRoad(x, z) {
  const nearLine = (v) => {
    const m = ((v % PITCH) + PITCH) % PITCH;
    return m < 7 || m > PITCH - 7;
  };
  return nearLine(x + HALF) || nearLine(z + HALF);
}

/** A random point on a road, for traffic and pedestrians. */
export function randomRoadPoint(rng) {
  const vertical = rng.chance(0.5);
  const line = rng.pick([-224, -168, -112, -56, 0, 56, 112, 168, 224]);
  const along = rng.range(-HALF + 20, HALF - 20);
  return vertical ? { x: line, z: along } : { x: along, z: line };
}

/** A random sidewalk point just off a road, for pedestrians. */
export function randomWalkPoint(rng) {
  const vertical = rng.chance(0.5);
  const line = rng.pick([-224, -168, -112, -56, 0, 56, 112, 168, 224]);
  const along = rng.range(-HALF + 20, HALF - 20);
  const off = rng.pick([-8.5, 8.5]);
  return vertical ? { x: line + off, z: along } : { x: along, z: line + off };
}

/** Push a circle (x, z, radius) out of every building AABB it overlaps. Returns true on hit. */
export function resolveCollisions(pos, radius, colliders) {
  let hit = false;
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    if (pos.x > c.minX - radius && pos.x < c.maxX + radius && pos.z > c.minZ - radius && pos.z < c.maxZ + radius) {
      const dxl = pos.x - (c.minX - radius);
      const dxr = (c.maxX + radius) - pos.x;
      const dzl = pos.z - (c.minZ - radius);
      const dzr = (c.maxZ + radius) - pos.z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) pos.x = c.minX - radius;
      else if (m === dxr) pos.x = c.maxX + radius;
      else if (m === dzl) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
      hit = true;
    }
  }
  return hit;
}

export function clampToCity(pos) {
  pos.x = Math.max(-HALF - 6, Math.min(HALF + 6, pos.x));
  pos.z = Math.max(-HALF - 6, Math.min(398, pos.z));
}
