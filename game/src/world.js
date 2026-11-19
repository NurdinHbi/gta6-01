// Solmar City: procedural generation and every spatial query the game
// needs. The city is a 10x10 grid of blocks separated by roads, with a
// beach strip and ocean on the east edge. All placement is seeded, so the
// same seed builds the same city every time.
import { BLOCK, ROAD, PITCH, GRID, CITY_HALF, ROADS, BEACH_X, OCEAN_X } from './config.js';
import { makeRng, clamp, dist } from './random.js';

const BUILDING_COLORS = [0xe8dcc8, 0xd8c2a8, 0xc9d6de, 0xe6b8a2, 0xb8c9b8, 0xd9c9e0, 0xf0e0c0, 0xa8c4d4];
const PALETTE = {
  taxi: 0xf2c200, red: 0xc23a2e, blue: 0x2e5fa3, white: 0xe8e8e8,
  teal: 0x2a9d8f, purple: 0x7b5ea7, green: 0x4d7c4d, orange: 0xd97b29,
};
export const CAR_COLORS = Object.values(PALETTE);

// A canvas texture of lit windows, shared by buildings of one seed so the
// renderer can reuse a handful of materials instead of one per building.
export function makeWindowTexture(seed, litRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const rng = makeRng(seed);
  // A light sun-bleached facade; the material tint multiplies over it, so
  // buildings stay bright in the sun instead of reading as dark slabs.
  ctx.fillStyle = '#d5d9de';
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 18) {
    for (let x = 8; x < 120; x += 16) {
      const lit = rng.next() < litRatio;
      ctx.fillStyle = lit ? (rng.next() < 0.5 ? '#ffd98a' : '#9fd8ff') : '#3a4556';
      ctx.fillRect(x, y, 10, 12);
    }
  }
  return canvas;
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const palms = [];
  const lights = [];
  const windowCanvases = [];
  for (let i = 0; i < 3; i += 1) windowCanvases.push(makeWindowTexture(seed * 7 + i * 13, 0.35 + i * 0.15));

  // Buildings: one or two per block, with a plaza gap on some blocks.
  for (let bx = 0; bx < GRID; bx += 1) {
    for (let bz = 0; bz < GRID; bz += 1) {
      const cx = -CITY_HALF + ROAD + BLOCK / 2 + bx * PITCH;
      const cz = -CITY_HALF + ROAD + BLOCK / 2 + bz * PITCH;
      const plaza = rng.chance(0.18);
      const downtown = Math.abs(cx) < 120 && Math.abs(cz) < 120;
      const tall = downtown ? rng.range(28, 64) : rng.range(8, 30);
      if (plaza) {
        // A park plaza: grass + palms, no building.
        for (let p = 0; p < 4; p += 1) {
          palms.push({ x: cx + rng.range(-14, 14), z: cz + rng.range(-14, 14), h: rng.range(5, 8) });
        }
        continue;
      }
      const split = rng.chance(0.45);
      if (split) {
        buildings.push({
          x: cx - 9, z: cz, w: 18, d: 34, h: tall * rng.range(0.7, 1.05),
          color: rng.pick(BUILDING_COLORS), tex: rng.int(0, 2),
        });
        buildings.push({
          x: cx + 10, z: cz, w: 16, d: 34, h: tall * rng.range(0.6, 0.95),
          color: rng.pick(BUILDING_COLORS), tex: rng.int(0, 2),
        });
      } else {
        buildings.push({
          x: cx, z: cz, w: rng.range(24, 32), d: rng.range(24, 32), h: tall,
          color: rng.pick(BUILDING_COLORS), tex: rng.int(0, 2),
        });
      }
    }
  }

  // Palm trees along the beach and on sidewalks; streetlights at corners.
  for (let z = -CITY_HALF; z <= CITY_HALF; z += 26) {
    palms.push({ x: BEACH_X + 8 + rng.range(-2, 2), z: z + rng.range(-4, 4), h: rng.range(6, 9) });
    palms.push({ x: BEACH_X + 20 + rng.range(-2, 2), z: z + 13 + rng.range(-4, 4), h: rng.range(5, 8) });
  }
  for (let i = 0; i <= GRID; i += 1) {
    for (let j = 0; j <= GRID; j += 1) {
      if (rng.chance(0.6)) lights.push({ x: ROADS[i] + ROAD / 2 + 1, z: ROADS[j] + ROAD / 2 + 1 });
    }
  }

  return {
    seed, buildings, palms, lights, windowCanvases,
    half: CITY_HALF, beachX: BEACH_X, oceanX: OCEAN_X,
  };
}

// Is (x, z) on a road surface (including intersections)?
export function isOnRoad(x, z) {
  for (const c of ROADS) {
    if (Math.abs(x - c) <= ROAD / 2 + 0.5) return true;
    if (Math.abs(z - c) <= ROAD / 2 + 0.5) return true;
  }
  return false;
}

// Is (x, z) on a sidewalk (the ring around each block)?
export function isOnSidewalk(x, z) {
  if (isOnRoad(x, z)) return false;
  if (x > BEACH_X) return false;
  const bx = Math.abs(x);
  const bz = Math.abs(z);
  return bx <= CITY_HALF + 2 && bz <= CITY_HALF + 2;
}

// Circle vs building AABBs. Returns the building hit, or null.
export function buildingHit(city, x, z, r) {
  for (const b of city.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r) return b;
  }
  return null;
}

// Push a circle out of buildings and the world edge. Mutates pos {x, z}.
export function resolveBuildingCollision(city, pos, r) {
  const b = buildingHit(city, pos.x, pos.z, r);
  if (b) {
    const dx = pos.x - b.x;
    const dz = pos.z - b.z;
    const px = b.w / 2 + r - Math.abs(dx);
    const pz = b.d / 2 + r - Math.abs(dz);
    if (px < pz) pos.x = b.x + (dx >= 0 ? b.w / 2 + r : -(b.w / 2 + r));
    else pos.z = b.z + (dz >= 0 ? b.d / 2 + r : -(b.d / 2 + r));
    return b;
  }
  pos.x = clamp(pos.x, -CITY_HALF - 4, OCEAN_X + 60);
  pos.z = clamp(pos.z, -CITY_HALF - 4, CITY_HALF + 4);
  return null;
}

// Nearest point on the road grid to (x, z): snap to the closer axis road.
export function nearestRoadPoint(x, z) {
  let bestX = ROADS[0];
  let bestZ = ROADS[0];
  for (const c of ROADS) {
    if (Math.abs(c - x) < Math.abs(bestX - x)) bestX = c;
    if (Math.abs(c - z) < Math.abs(bestZ - z)) bestZ = c;
  }
  // Snap to the nearer of the two axis roads.
  return Math.abs(bestX - x) < Math.abs(bestZ - z)
    ? { x: bestX, z, axis: 'z' }
    : { x, z: bestZ, axis: 'x' };
}

export function randomRoadPoint(rng) {
  const road = rng.pick(ROADS);
  const along = rng.range(-CITY_HALF + 20, CITY_HALF - 20);
  return rng.chance(0.5) ? { x: road, z: along } : { x: along, z: road };
}

export function randomSidewalkPoint(rng) {
  for (let tries = 0; tries < 20; tries += 1) {
    const x = rng.range(-CITY_HALF, CITY_HALF);
    const z = rng.range(-CITY_HALF, CITY_HALF);
    if (isOnSidewalk(x, z)) return { x, z };
  }
  return { x: -234, z: 0 };
}

// A point on the road grid at least `minDist` from (x, z), for spawns.
export function roadPointAwayFrom(rng, x, z, minDist) {
  for (let tries = 0; tries < 30; tries += 1) {
    const p = randomRoadPoint(rng);
    if (dist(p.x, p.z, x, z) >= minDist) return p;
  }
  return randomRoadPoint(rng);
}
