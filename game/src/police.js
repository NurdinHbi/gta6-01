// Wanted level and police response. Crimes add stars; foot cops spawn
// from 1 star and chase on foot, police cars join from 2 stars and ram.
// Quiet for 20 seconds with no cop close by and the heat decays. A cop
// who holds the player on foot for 2 seconds busts them.
import { WANTED, POLICE, CITY_HALF } from './config.js';
import { clamp, dist, angleDiff } from './random.js';
import { makeCar } from './vehicles.js';
import { roadPointAwayFrom } from './world.js';

export function createWanted() {
  return {
    stars: 0,
    quietTimer: 0, // seconds since the last crime
    decayTimer: 0,
    lastCrimeAt: -999,
    cops: [], // foot cops {x,z,angle,speed,holdTimer,punchTimer}
    policeCars: [],
  };
}

export function addWanted(wanted, amount, now) {
  wanted.stars = clamp(wanted.stars + amount, 0, WANTED.maxStars);
  wanted.quietTimer = 0;
  wanted.lastCrimeAt = now;
  wanted.decayTimer = 0;
}

export function updateWanted(wanted, dt, now, playerX, playerZ, rng, cars, city) {
  wanted.quietTimer += dt;
  // Decay: quiet 20 s and no cop within sight range.
  const nearestCop = nearestCopDistance(wanted, playerX, playerZ);
  if (wanted.stars > 0 && wanted.quietTimer > WANTED.decayQuietSeconds && nearestCop > WANTED.copSightRange) {
    wanted.decayTimer += dt;
    if (wanted.decayTimer >= WANTED.decayStepSeconds) {
      wanted.stars -= 1;
      wanted.decayTimer = 0;
    }
  } else {
    wanted.decayTimer = 0;
  }

  // Foot cops: wanted stars + 1, capped at 5 (downed cops don't count).
  const wantCops = wanted.stars >= 1 ? Math.min(5, wanted.stars + 1) : 0;
  wanted.cops = wanted.cops.filter((c) => !c.down || (c.downTimer -= dt) > 0);
  const liveCops = wanted.cops.filter((c) => !c.down).length;
  for (let i = liveCops; i < wantCops; i += 1) {
    const p = roadPointAwayFrom(rng, playerX, playerZ, 25);
    wanted.cops.push({ x: p.x, z: p.z, angle: 0, speed: 0, holdTimer: 0, punchTimer: 0 });
  }
  while (wanted.cops.filter((c) => !c.down).length > wantCops) {
    const idx = wanted.cops.findIndex((c) => !c.down);
    if (idx === -1) break;
    wanted.cops.splice(idx, 1);
  }
  // Police cars from 2 stars: stars - 1 of them, capped at 3.
  const wantCars = wanted.stars >= 2 ? Math.min(3, wanted.stars - 1) : 0;
  while (wanted.policeCars.length < wantCars) {
    const p = roadPointAwayFrom(rng, playerX, playerZ, 35);
    const car = makeCar('police', p.x, p.z, 0, 0x1a1a2e);
    car.speed = 12;
    wanted.policeCars.push(car);
    cars.push(car);
  }
  while (wanted.policeCars.length > wantCars) {
    const car = wanted.policeCars.pop();
    car.dead = true;
  }
}

export function nearestCopDistance(wanted, x, z) {
  let best = Infinity;
  for (const cop of wanted.cops) best = Math.min(best, dist(cop.x, cop.z, x, z));
  for (const car of wanted.policeCars) best = Math.min(best, dist(car.x, car.z, x, z));
  return best;
}

// Foot cops chase the player (on foot or in a car, slowly) and punch up
// close. Returns 'busted' when a cop holds the player for 2 seconds.
export function updateCops(wanted, dt, player, cars) {
  const px = player.inCar ? player.car.x : player.x;
  const pz = player.inCar ? player.car.z : player.z;
  for (const cop of wanted.cops) {
    if (cop.down) continue;
    const d = dist(cop.x, cop.z, px, pz);
    cop.angle = Math.atan2(pz - cop.z, px - cop.x);
    const speed = player.inCar ? POLICE.footChaseSpeed * 0.8 : POLICE.footChaseSpeed;
    cop.speed = d > 1.4 ? speed : 0;
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.z += Math.sin(cop.angle) * cop.speed * dt;
    cop.punchTimer -= dt;
    if (d < 1.6 && !player.inCar) {
      cop.holdTimer += dt;
      if (cop.punchTimer <= 0) {
        cop.punchTimer = POLICE.punchCooldown;
        player.health -= POLICE.punchDamage;
        player.lastDamageAt = player.time;
        player.hurtFlash = 1;
      }
      if (cop.holdTimer >= POLICE.holdSeconds) return 'busted';
    } else {
      cop.holdTimer = Math.max(0, cop.holdTimer - dt * 2);
    }
  }
  return null;
}

// Police cars chase the player's position and ram. Returns damage dealt
// this step (0 when no ram landed).
export function updatePoliceCars(wanted, dt, player, cars, city) {
  let damage = 0;
  const px = player.inCar ? player.car.x : player.x;
  const pz = player.inCar ? player.car.z : player.z;
  for (const car of wanted.policeCars) {
    if (car.dead) continue;
    const d = dist(car.x, car.z, px, pz);
    const wantAngle = Math.atan2(pz - car.z, px - car.x);
    car.angle += clamp(angleDiff(wantAngle, car.angle), -1.8 * dt, 1.8 * dt);
    const target = d > 6 ? POLICE.carChaseSpeed : POLICE.carChaseSpeed * 0.5;
    car.speed += clamp(target - car.speed, -20 * dt, 10 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.z += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, -CITY_HALF - 2, 330);
    car.z = clamp(car.z, -CITY_HALF - 2, CITY_HALF + 2);
    if (d < 3.2) {
      // Ram: shove the player's car, hurt the player on foot.
      if (player.inCar) {
        player.car.speed = Math.max(player.car.speed * 0.5, 6);
        player.car.x += Math.cos(car.angle) * 1.2;
        player.car.z += Math.sin(car.angle) * 1.2;
        if (car.ramTimer <= 0) {
          damage += POLICE.ramDamage;
          car.ramTimer = 1.2;
        }
      } else if (car.ramTimer <= 0) {
        damage += POLICE.ramDamage;
        player.health -= POLICE.ramDamage;
        player.lastDamageAt = player.time;
        player.hurtFlash = 1;
        car.ramTimer = 1.2;
      }
    }
    car.ramTimer -= dt;
  }
  return damage;
}
