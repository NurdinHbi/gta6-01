// Vehicles: the player's car, traffic AI and parked cars. Driving is
// arcade physics on a fixed step: accelerate, steer by speed, handbrake
// drift, building and car collision, and a traffic loop that follows the
// road grid and turns at intersections.
import { CAR, ROAD, ROADS, CITY_HALF } from './config.js';
import { clamp, angleDiff, dist } from './random.js';
import { buildingHit, nearestRoadPoint, randomRoadPoint } from './world.js';

let nextCarId = 1;

export function makeCar(kind, x, z, angle, color) {
  return {
    id: nextCarId += 1,
    kind, // 'player' | 'traffic' | 'parked' | 'police'
    x, z, angle,
    speed: 0,
    steer: 0,
    color,
    driver: null, // ped id of the driver, for parked-car theft
    honk: 0,
    dead: false,
    brakeLight: false,
  };
}
nextCarId = 1;

export function resetCarIds() {
  nextCarId = 1;
}

// Spawn traffic looping the roads and parked cars along road edges.
export function spawnTraffic(city, rng, playerX, playerZ) {
  const cars = [];
  for (let i = 0; i < CAR.trafficCount; i += 1) {
    const p = randomRoadPoint(rng);
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const dir = rng.chance(0.5) ? 1 : -1;
    const lane = (ROAD / 2 - 1.6) * (rng.chance(0.5) ? 1 : -1);
    const car = makeCar('traffic', p.x, p.z, axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2), rng.pick([0xc23a2e, 0x2e5fa3, 0xe8e8e8, 0x2a9d8f, 0x7b5ea7, 0x4d7c4d, 0xd97b29, 0xf2c200]));
    car.axis = axis;
    car.dir = dir;
    car.lane = lane;
    car.speed = rng.range(7, 13);
    car.targetSpeed = car.speed;
    cars.push(car);
  }
  for (let i = 0; i < CAR.parkedCount; i += 1) {
    const p = randomRoadPoint(rng);
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const lane = (ROAD / 2 - 1.2) * (rng.chance(0.5) ? 1 : -1);
    const angle = axis === 'x' ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    const car = makeCar('parked', axis === 'x' ? p.x : p.x + lane, axis === 'x' ? p.z + lane : p.z, angle, rng.pick([0xc23a2e, 0x2e5fa3, 0xe8e8e8, 0x2a9d8f, 0x7b5ea7, 0x4d7c4d, 0xd97b29]));
    car.axis = axis;
    cars.push(car);
  }
  return cars;
}

// Player driving: W/S throttle, A/D steer, Space handbrake.
export function drivePlayerCar(car, input, dt, city, allCars) {
  const forward = Math.cos(car.angle);
  const right = Math.sin(car.angle);
  let throttle = 0;
  if (input.forward) throttle = 1;
  if (input.back) throttle = car.speed > 0.5 ? -1 : -0.6; // brake, then reverse
  if (throttle > 0) car.speed += CAR.accel * throttle * dt;
  if (throttle < 0) car.speed += (car.speed > 0 ? -CAR.brake : CAR.accel * 0.6) * dt;
  // Drag and rolling resistance.
  car.speed -= car.speed * CAR.drag * dt;
  if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);

  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const steerTarget = steerInput * CAR.steerMax * clamp(Math.abs(car.speed) / 8, 0.25, 1);
  car.steer += (steerTarget - car.steer) * Math.min(1, CAR.steerSpeed * dt * 3);
  const grip = input.handbrake ? CAR.handbrakeGrip : 1;
  car.angle += car.steer * (car.speed / CAR.length) * grip * dt * (car.speed >= 0 ? 1 : -1);
  if (input.handbrake) car.speed *= (1 - 0.6 * dt);

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const nz = car.z + Math.sin(car.angle) * car.speed * dt;
  // Buildings stop the car; slide along them.
  if (!buildingHit(city, nx, car.z, CAR.width / 2 + 0.2)) car.x = nx;
  else { car.speed *= 0.4; car.crashed = true; }
  if (!buildingHit(city, car.x, nz, CAR.width / 2 + 0.2)) car.z = nz;
  else { car.speed *= 0.4; car.crashed = true; }
  car.x = clamp(car.x, -CITY_HALF - 2, 330);
  car.z = clamp(car.z, -CITY_HALF - 2, CITY_HALF + 2);
  car.brakeLight = input.back || input.handbrake;
  return car.crashed === true;
}

// Traffic AI: cruise along its road; at an intersection, sometimes turn.
export function updateTraffic(car, dt, city, rng, allCars) {
  if (car.kind !== 'traffic') return;
  // Slow for a car ahead on the same lane.
  let ahead = Infinity;
  for (const other of allCars) {
    if (other === car || other.dead) continue;
    const d = dist(car.x, car.z, other.x, other.z);
    if (d < 14) {
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const along = dx * Math.cos(car.angle) + dz * Math.sin(car.angle);
      const side = Math.abs(-dx * Math.sin(car.angle) + dz * Math.cos(car.angle));
      if (along > 0 && along < 14 && side < 2.5) ahead = Math.min(ahead, along);
    }
  }
  const target = ahead < 12 ? Math.max(0, ahead - 6) * 0.8 : car.targetSpeed;
  car.speed += clamp(target - car.speed, -14 * dt, 8 * dt);

  const nearIntersection = ROADS.some((c) => Math.abs(car.x - c) < 1.2) && ROADS.some((c) => Math.abs(car.z - c) < 1.2);
  if (nearIntersection && !car.turnedHere) {
    car.turnedHere = true;
    if (rng.next() < 0.45) {
      // Turn left or right onto the cross road.
      const turn = rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
      car.angle += turn;
      car.axis = car.axis === 'x' ? 'z' : 'x';
      car.dir = Math.cos(car.angle) > 0.5 || Math.sin(car.angle) > 0.5 ? 1 : -1;
      // Snap onto the cross road centre + lane.
      const p = nearestRoadPoint(car.x, car.z);
      car.x = p.x;
      car.z = p.z;
    }
  }
  if (!nearIntersection) car.turnedHere = false;

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.z += Math.sin(car.angle) * car.speed * dt;
  // Keep traffic inside the city; loop it back at the edge roads.
  if (car.x > CITY_HALF + 4 || car.x < -CITY_HALF - 4 || car.z > CITY_HALF + 4 || car.z < -CITY_HALF - 4) {
    const p = randomRoadPoint(rng);
    car.x = p.x;
    car.z = p.z;
    car.angle = rng.chance(0.5) ? 0 : Math.PI / 2;
    car.speed = car.targetSpeed;
  }
}

// Simple circle-vs-circle separation between cars, plus a speed nudge.
export function separateCars(cars) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      const min = 4.6;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        const avg = (a.speed + b.speed) / 2;
        a.speed = avg * 0.9;
        b.speed = avg * 0.9;
        a.crashed = true;
        b.crashed = true;
      }
    }
  }
}

export function nearestCar(cars, x, z, maxDist, kinds) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.dead) continue;
    if (kinds && !kinds.includes(car.kind)) continue;
    const d = dist(car.x, car.z, x, z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

export function speedKmh(car) {
  return Math.abs(car.speed) * 3.6;
}
