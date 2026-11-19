// Pedestrians: Solmar locals walking the sidewalks on waypoints. They
// stroll, wait at corners, and flee when scared — a gunshot, a punch, or
// a car bearing down on them. A ped hit by a car goes down and stays down.
import { PED } from './config.js';
import { dist } from './random.js';
import { randomSidewalkPoint } from './world.js';

let nextPedId = 1;

export function spawnPeds(city, rng) {
  nextPedId = 1;
  const peds = [];
  const shirts = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1, 0xfd79a8, 0x00cec9];
  const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
  for (let i = 0; i < PED.count; i += 1) {
    const p = randomSidewalkPoint(rng);
    const target = randomSidewalkPoint(rng);
    peds.push({
      id: nextPedId,
      x: p.x, z: p.z,
      tx: target.x, tz: target.z,
      angle: Math.atan2(target.z - p.z, target.x - p.x),
      speed: 0,
      state: 'walk', // walk | flee | down | wait
      stateTimer: rng.range(0, 4),
      shirt: shirts[i % shirts.length],
      skin: skins[i % skins.length],
      scared: 0,
    });
    nextPedId += 1;
  }
  return peds;
}

// Flee from a scare at (x, z). `rng` is optional; when given, the flee
// duration comes from the seeded RNG so staged scenes stay deterministic.
export function scarePeds(peds, x, z, radius, rng) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.z, x, z) < radius) {
      ped.state = 'flee';
      ped.stateTimer = rng ? rng.range(2.5, 4.5) : 2.5 + Math.random() * 2;
      ped.fleeX = x;
      ped.fleeZ = z;
      ped.scared = 1;
    }
  }
}

export function updatePeds(peds, dt, city, rng, cars) {
  for (const ped of peds) {
    if (ped.state === 'down') {
      ped.stateTimer -= dt;
      if (ped.stateTimer <= 0) {
        ped.state = 'walk';
        const t = randomSidewalkPoint(rng);
        ped.tx = t.x;
        ped.tz = t.z;
      }
      continue;
    }
    if (ped.state === 'flee') {
      ped.stateTimer -= dt;
      const away = Math.atan2(ped.z - ped.fleeZ, ped.x - ped.fleeX);
      ped.angle = away;
      ped.speed = PED.fleeSpeed;
      ped.x += Math.cos(away) * ped.speed * dt;
      ped.z += Math.sin(away) * ped.speed * dt;
      if (ped.stateTimer <= 0) {
        ped.state = 'walk';
        const t = randomSidewalkPoint(rng);
        ped.tx = t.x;
        ped.tz = t.z;
      }
      continue;
    }
    // Walking: head for the waypoint; pick a new one on arrival.
    const d = dist(ped.x, ped.z, ped.tx, ped.tz);
    if (d < 2) {
      if (ped.state === 'walk' && rng.chance(0.3)) {
        ped.state = 'wait';
        ped.stateTimer = rng.range(1, 3);
      } else {
        const t = randomSidewalkPoint(rng);
        ped.tx = t.x;
        ped.tz = t.z;
      }
      ped.speed = 0;
      continue;
    }
    if (ped.state === 'wait') {
      ped.stateTimer -= dt;
      if (ped.stateTimer <= 0) {
        ped.state = 'walk';
        const t = randomSidewalkPoint(rng);
        ped.tx = t.x;
        ped.tz = t.z;
      }
      continue;
    }
    ped.angle = Math.atan2(ped.tz - ped.z, ped.tx - ped.x);
    ped.speed = PED.walkSpeed;
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.z += Math.sin(ped.angle) * ped.speed * dt;
    // A car closing fast on the sidewalk scares them off the road.
    for (const car of cars) {
      if (car.dead || car.kind === 'parked') continue;
      if (Math.abs(car.speed) < 4) continue;
      const cd = dist(ped.x, ped.z, car.x, car.z);
      if (cd < 5) {
        const dx = car.x - ped.x;
        const dz = car.z - ped.z;
        const along = dx * Math.cos(car.angle) + dz * Math.sin(car.angle);
        if (along > 0) {
          ped.state = 'flee';
          ped.stateTimer = 2;
          ped.fleeX = car.x;
          ped.fleeZ = car.z;
          break;
        }
      }
    }
  }
}

// A car running a ped over: returns the ped, or null.
export function carHitsPed(cars, peds) {
  for (const car of cars) {
    if (car.dead || car.kind === 'parked' || Math.abs(car.speed) < 3) continue;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      if (dist(car.x, car.z, ped.x, ped.z) < 2.0) {
        ped.state = 'down';
        ped.stateTimer = 6;
        ped.speed = 0;
        return { ped, car };
      }
    }
  }
  return null;
}
