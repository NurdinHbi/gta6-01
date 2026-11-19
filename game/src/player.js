// The player on foot: third-person movement relative to the camera,
// punching, pistol shooting, entering and exiting cars, health and regen.
import { PLAYER } from './config.js';
import { clamp, dist, angleDiff } from './random.js';
import { resolveBuildingCollision } from './world.js';
import { nearestCar } from './vehicles.js';
import { scarePeds } from './pedestrians.js';

export function createPlayer(x, z) {
  return {
    x, z,
    angle: 0, // facing, radians (0 = +x)
    speed: 0,
    health: PLAYER.maxHealth,
    cash: 0,
    inCar: null, // the car object when driving, else null
    car: null,
    punchTimer: 0,
    shootTimer: 0,
    lastDamageAt: -999,
    hurtFlash: 0,
    time: 0,
    moving: false,
  };
}

// Walk/run on foot. Movement is relative to the camera yaw.
export function updatePlayerOnFoot(player, input, cameraYaw, dt, city, cars, peds) {
  let mx = 0;
  let mz = 0;
  if (input.forward) { mx += -Math.cos(cameraYaw); mz += -Math.sin(cameraYaw); }
  if (input.back) { mx += Math.cos(cameraYaw); mz += Math.sin(cameraYaw); }
  if (input.left) { mx += Math.sin(cameraYaw); mz += -Math.cos(cameraYaw); }
  if (input.right) { mx += -Math.sin(cameraYaw); mz += Math.cos(cameraYaw); }
  const len = Math.hypot(mx, mz);
  player.moving = len > 0;
  const targetSpeed = len > 0 ? (input.run ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;
  if (len > 0) {
    mx /= len;
    mz /= len;
    player.angle = Math.atan2(mz, mx);
  }
  player.speed += clamp(targetSpeed - player.speed, -PLAYER.accel * dt, PLAYER.accel * dt);
  const nx = player.x + mx * player.speed * dt;
  const nz = player.z + mz * player.speed * dt;
  const before = { x: player.x, z: player.z };
  player.x = nx;
  player.z = nz;
  resolveBuildingCollision(city, player, PLAYER.radius);
  // Bumping a car on foot slows the player; the car barely notices.
  for (const car of cars) {
    if (car.dead || car.kind === 'parked') continue;
    if (dist(player.x, player.z, car.x, car.z) < 2.2 && Math.abs(car.speed) > 2) {
      player.x = before.x;
      player.z = before.z;
      break;
    }
  }
  player.punchTimer -= dt;
  player.shootTimer -= dt;
}

// Punch: hits the nearest ped or cop in range, in front of the player.
export function tryPunch(player, peds, cops, rng) {
  if (player.punchTimer > 0) return null;
  player.punchTimer = PLAYER.punchCooldown;
  let best = null;
  let bestD = PLAYER.punchRange;
  const consider = (list, kind) => {
    for (const e of list) {
      if (e.state === 'down') continue;
      const d = dist(player.x, player.z, e.x, e.z);
      if (d < bestD) {
        const ang = Math.atan2(e.z - player.z, e.x - player.x);
        if (Math.abs(angleDiff(ang, player.angle)) < 1.2) {
          best = { target: e, kind };
          bestD = d;
        }
      }
    }
  };
  consider(peds, 'ped');
  consider(cops, 'cop');
  if (!best) return { hit: false };
  if (best.kind === 'ped') {
    best.target.state = 'down';
    best.target.stateTimer = 4;
    scarePeds(peds, player.x, player.z, 8, rng);
  } else {
    best.target.x += Math.cos(player.angle) * 1.5;
    best.target.z += Math.sin(player.angle) * 1.5;
  }
  return { hit: true, kind: best.kind, target: best.target };
}

// Pistol: hitscan toward the camera aim (the player's facing on foot).
// Returns what was hit, for wanted/score handling.
export function tryShoot(player, peds, cops, cars) {
  if (player.shootTimer > 0) return null;
  player.shootTimer = PLAYER.shootCooldown;
  const range = PLAYER.shootRange;
  const fx = Math.cos(player.angle);
  const fz = Math.sin(player.angle);
  let best = null;
  let bestD = range;
  const consider = (list, kind) => {
    for (const e of list) {
      if (e.state === 'down' || e.dead) continue;
      const dx = e.x - player.x;
      const dz = e.z - player.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > bestD) continue;
      const side = Math.abs(-dx * fz + dz * fx);
      if (side < 1.6) {
        best = { target: e, kind, dist: along };
        bestD = along;
      }
    }
  };
  consider(peds, 'ped');
  consider(cops, 'cop');
  consider(cars, 'car');
  if (!best) return { hit: false, endX: player.x + fx * range, endZ: player.z + fz * range };
  if (best.kind === 'ped') {
    best.target.state = 'down';
    best.target.stateTimer = 8;
  } else if (best.kind === 'cop') {
    best.target.x += fx * 2;
    best.target.z += fz * 2;
    best.target.health = (best.target.health || 3) - 1;
    if (best.target.health <= 0) {
      best.target.down = true;
      best.target.downTimer = 6;
    }
  } else if (best.kind === 'car') {
    best.target.speed *= 0.7;
  }
  return { hit: true, kind: best.kind, target: best.target, endX: best.target.x, endZ: best.target.z };
}

export function tryEnterCar(player, cars) {
  const car = nearestCar(cars, player.x, player.z, 4.5, ['parked', 'traffic', 'police']);
  if (!car) return null;
  if (car.kind === 'traffic' && Math.abs(car.speed) > 1) return null;
  const wasParked = car.kind === 'parked';
  const wasTraffic = car.kind === 'traffic';
  car.kind = 'player';
  player.inCar = car;
  player.car = car;
  player.x = car.x;
  player.z = car.z;
  return { car, stolen: wasParked || wasTraffic, wasParked };
}

export function exitCar(player) {
  const car = player.car;
  if (!car) return;
  car.kind = 'parked';
  car.speed = 0;
  const side = { x: player.x, z: player.z };
  // Step out to the left of the car.
  player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 2.4;
  player.z = car.z + Math.sin(car.angle + Math.PI / 2) * 2.4;
  player.angle = car.angle;
  player.inCar = null;
  player.car = null;
  return side;
}

export function regenHealth(player, dt) {
  if (player.time - player.lastDamageAt > PLAYER.regenDelay && player.health > 0) {
    player.health = Math.min(PLAYER.maxHealth, player.health + PLAYER.regenPerSec * dt);
  }
  if (player.hurtFlash > 0) player.hurtFlash = Math.max(0, player.hurtFlash - dt * 2);
}
