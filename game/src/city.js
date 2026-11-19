// Solmar City itself: a procedural coastal city on a street grid, a sand beach and
// a pier to the south, palms and streetlights, and the collision boxes every
// walker and driver bumps into. No textures are loaded — the window patterns are
// drawn once onto canvases and used as materials.

import { CITY, PALETTE } from './config.js';

function makeWindowTexture(base, lit) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Subtle vertical shading so a flat box still reads as a facade.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.16)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const x = 10 + col * 30;
      const y = 14 + row * 30;
      g.fillStyle = lit && ((row * 4 + col) % 3 === 0) ? '#ffd98a' : '#274b63';
      g.fillRect(x, y, 20, 16);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hexCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function box(w, h, d, material, x, y, z, parent) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

// A palm: a leaning trunk of stacked cylinders and a crown of flat leaves.
function makePalm(x, z, parent, rng) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf, side: THREE.DoubleSide });
  const lean = rng.float(-0.12, 0.12);
  for (let i = 0; i < 4; i += 1) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.02, 0.2 - i * 0.02, 1.6, 6), trunkMat);
    seg.position.set(lean * i * 1.4, 0.8 + i * 1.55, 0);
    seg.rotation.z = -lean;
    group.add(seg);
  }
  const topY = 6.6;
  const topX = lean * 4.4;
  for (let i = 0; i < 7; i += 1) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), leafMat);
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(topX + Math.cos(a) * 1.1, topY + 0.25, Math.sin(a) * 1.1);
    leaf.rotation.set(Math.sin(a) * 0.9, 0, Math.cos(a) * 0.9 + 0.5);
    leaf.rotation.y = -a;
    group.add(leaf);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
  nut.position.set(topX, topY, 0);
  group.add(nut);
  group.position.set(x, 0, z);
  parent.add(group);
  return group;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const buildings = [];
  const palms = [];
  const world = new THREE.Group();
  scene.add(world);

  // Sun-soaked light: warm sun low in the west, soft sky fill, gentle haze.
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.9);
  sun.position.set(-180, 190, -120);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5f, 0.85));
  scene.fog = new THREE.Fog(PALETTE.fog, 320, 900);

  // Ground: one big slab for the city, sand beyond it, ocean beyond that.
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x8f8a80 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(620, 620), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  world.add(ground);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(620, CITY.waterStart - CITY.beachStart + 40),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.01, (CITY.beachStart + CITY.waterStart) / 2 + 10);
  world.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(900, CITY.worldSouth - CITY.waterStart + 120),
    new THREE.MeshLambertMaterial({ color: PALETTE.water }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.02, CITY.waterStart + (CITY.worldSouth - CITY.waterStart) / 2 + 40);
  world.add(water);

  // Roads: dark strips along every street line, plus a dashed centre line.
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.asphaltLine });
  const streetCoords = [];
  for (let k = -5; k <= 5; k += 1) streetCoords.push(k * CITY.pitch);
  for (const c of streetCoords) {
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadHalf * 2, 620), roadMat);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(c, 0.03, 0);
    world.add(ns);
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(620, CITY.roadHalf * 2), roadMat);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.03, c);
    world.add(ew);
    for (let d = -280; d <= 280; d += 24) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 5), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(c, 0.05, d);
      world.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.7), lineMat);
      dash2.rotation.x = -Math.PI / 2;
      dash2.position.set(d, 0.05, c);
      world.add(dash2);
    }
  }

  // Sidewalks: pale frames around each block.
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const blockSpan = CITY.pitch - CITY.roadHalf * 2;
  // Landmark blocks stay clear: Mara's garage, the diner, the bank and the
  // hideout are built there instead of ordinary towers.
  const landmarkBlocks = new Set(['-5,-1', '3,1', '-1,-4', '4,3']);
  for (let bx = -5; bx < 5; bx += 1) {
    for (let bz = -5; bz < 5; bz += 1) {
      if (landmarkBlocks.has(`${bx},${bz}`)) continue;
      const cx = bx * CITY.pitch + CITY.pitch / 2;
      const cz = bz * CITY.pitch + CITY.pitch / 2;
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(blockSpan + 6, blockSpan + 6), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(cx, 0.02, cz);
      world.add(walk);
    }
  }

  // Buildings: one or two per block, varied heights and pastel facades.
  const facadeMats = PALETTE.building.map((c) => makeWindowTexture(hexCss(c), true));
  const roofMat = new THREE.MeshLambertMaterial({ color: PALETTE.roof });
  let buildingCount = 0;
  for (let bx = -5; bx < 5; bx += 1) {
    for (let bz = -5; bz < 5; bz += 1) {
      if (landmarkBlocks.has(`${bx},${bz}`)) continue;
      const cx = bx * CITY.pitch + CITY.pitch / 2;
      const cz = bz * CITY.pitch + CITY.pitch / 2;
      const isDowntown = Math.abs(cx) < 120 && Math.abs(cz) < 120;
      const tall = isDowntown ? rng.float(26, 68) : rng.float(10, 30);
      const spots = rng.chance(0.42)
        ? [
            { dx: -9, dz: 0, w: 17, d: 26, h: tall * rng.float(0.7, 1) },
            { dx: 10, dz: 2, w: 15, d: 22, h: tall * rng.float(0.45, 0.8) },
          ]
        : [{ dx: 0, dz: 0, w: 26, d: 26, h: tall }];
      for (const s of spots) {
        const mat = new THREE.MeshLambertMaterial({ map: facadeMats[buildingCount % facadeMats.length] });
        const b = box(s.w, s.h, s.d, mat, cx + s.dx, s.h / 2, cz + s.dz, world);
        const roof = box(s.w + 0.6, 0.8, s.d + 0.6, roofMat, cx + s.dx, s.h + 0.4, cz + s.dz, world);
        roof.visible = true;
        b.userData.isBuilding = true;
        buildings.push({ x: cx + s.dx, z: cz + s.dz, w: s.w, d: s.d, h: s.h });
        colliders.push({
          minX: cx + s.dx - s.w / 2, maxX: cx + s.dx + s.w / 2,
          minZ: cz + s.dz - s.d / 2, maxZ: cz + s.dz + s.d / 2,
        });
        buildingCount += 1;
      }
      // A few blocks get a pocket park instead of a second tower.
      if (rng.chance(0.16)) {
        const tree = makePalm(cx + rng.float(-12, 12), cz + rng.float(-12, 12), world, rng);
        palms.push(tree);
      }
    }
  }

  // Beach palms along the sand, and a long pier at x = 0.
  for (let x = -270; x <= 270; x += 34) {
    palms.push(makePalm(x + rng.float(-6, 6), CITY.beachStart + rng.float(8, 44), world, rng));
  }
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9a7b52 });
  const pier = new THREE.Group();
  const deck = box(10, 0.6, CITY.worldSouth - CITY.beachStart - 30, pierMat, 0, 1.1, (CITY.beachStart + CITY.worldSouth) / 2 - 5, pier);
  deck.userData.isPier = true;
  for (let z = CITY.beachStart + 12; z < CITY.worldSouth - 20; z += 14) {
    box(0.8, 2.4, 0.8, pierMat, -4.6, 0, z, pier);
    box(0.8, 2.4, 0.8, pierMat, 4.6, 0, z, pier);
  }
  // Little shack at the pier's end, and a striped awning over it.
  box(8, 4.5, 7, new THREE.MeshLambertMaterial({ color: 0xe8e0cc }), 0, 3.4, CITY.worldSouth - 38, pier);
  const awning = box(9.5, 0.3, 8.5, new THREE.MeshLambertMaterial({ color: 0xe74c3c }), 0, 6, CITY.worldSouth - 38, pier);
  awning.rotation.z = 0.06;
  world.add(pier);
  colliders.push({ minX: -5, maxX: 5, minZ: CITY.waterStart + 60, maxZ: CITY.worldSouth - 20 });

  // Streetlights at every other intersection corner.
  const lampMat = new THREE.MeshLambertMaterial({ color: PALETTE.lamp });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const sx of streetCoords) {
    for (const sz of streetCoords) {
      if ((Math.abs(sx / CITY.pitch) + Math.abs(sz / CITY.pitch)) % 2 !== 0) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.4, 6), lampMat);
      pole.position.set(sx + 8.4, 3.2, sz + 8.4);
      world.add(pole);
      const arm = box(1.6, 0.12, 0.12, lampMat, sx + 7.7, 6.4, sz + 8.4, world);
      arm.visible = true;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bulbMat);
      bulb.position.set(sx + 7, 6.3, sz + 8.4);
      world.add(bulb);
    }
  }

  // Landmarks the missions point at: Mara's garage (blue), the diner, the bank.
  const landmark = (x, z, color, label) => {
    const g = new THREE.Group();
    const base = box(18, 9, 14, new THREE.MeshLambertMaterial({ color }), 0, 4.5, 0, g);
    base.userData.isBuilding = true;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 2.4),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    sign.position.set(0, 8.2, 7.2);
    g.add(sign);
    g.position.set(x, 0, z);
    g.userData.label = label;
    world.add(g);
    colliders.push({ minX: x - 9, maxX: x + 9, minZ: z - 7, maxZ: z + 7 });
    return g;
  };
  landmark(-261, -29, 0x2e86de, 'garage');
  landmark(203, 87, 0xe67e22, 'diner');
  landmark(-29, -203, 0xc9a227, 'bank');
  // Hideout: a small warehouse on the east edge.
  landmark(261, 203, 0x7f8c8d, 'hideout');

  return {
    group: world,
    colliders,
    buildings,
    buildingCount,
    palms,
    // Handy named spots for spawns and mission beacons (world coordinates).
    spots: {
      plaza: { x: 0, z: 0 },
      garage: { x: -261, z: -8 },
      diner: { x: 203, z: 108 },
      bank: { x: -29, z: -182 },
      hideout: { x: 261, z: 224 },
      pierEnd: { x: 0, z: CITY.worldSouth - 48 },
      beach: { x: 60, z: CITY.beachStart + 30 },
    },
  };
}

// Push a circle (x, z, radius) out of every building box it overlaps.
export function resolveCircleCollision(pos, radius, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 < 1e-6) {
        pos.x = c.maxX + radius;
      } else {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      }
    }
  }
}

export function clampToWorld(pos, margin = 4) {
  pos.x = Math.max(-CITY.halfExtent - margin, Math.min(CITY.halfExtent + margin, pos.x));
  pos.z = Math.max(-CITY.halfExtent - margin, Math.min(CITY.worldSouth - 10, pos.z));
}
