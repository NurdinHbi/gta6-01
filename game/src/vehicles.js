// Cars: how one looks, how one drives, and how the city's traffic thinks.
// Traffic cars follow rectangular loops around blocks; parked cars wait at curbs
// to be stolen; police cars chase the player. One arcade physics step serves all.

import { CAR, CITY, PALETTE } from './config.js';
import { clampToWorld, resolveCircleCollision } from './city.js';

let carId = 0;

export function makeCarMesh(color, kind = 'sedan') {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: PALETTE.glass });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR.width, 0.75, CAR.length), paint);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(CAR.width - 0.35, 0.62, CAR.length * 0.48), glass);
  cabin.position.set(0, 1.2, -0.25);
  group.add(cabin);
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    sign.position.set(0, 1.62, -0.25);
    group.add(sign);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), new THREE.MeshLambertMaterial({ color: 0x223344 }));
    bar.position.set(0, 1.58, -0.25);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.34), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.3, 1.7, -0.25);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.34), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.set(0.3, 1.7, -0.25);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10), tyre);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  return group;
}

export class Car {
  constructor(scene, x, z, yaw, color, kind) {
    this.id = carId += 1;
    this.kind = kind; // 'traffic' | 'parked' | 'police' | 'player'
    this.mesh = makeCarMesh(color, kind);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = yaw;
    scene.add(this.mesh);
    this.speed = 0;
    this.steer = 0;
    this.health = CAR.health;
    this.driver = kind === 'parked' ? null : 'ai';
    this.route = null;
    this.routeIndex = 0;
    this.stuckTimer = 0;
    this.dead = false;
    this.flash = 0;
    this.ramCooldown = 0; // seconds until this car can hurt the player again
  }

  get pos() { return this.mesh.position; }
  get yaw() { return this.mesh.rotation.y; }
  set yaw(v) { this.mesh.rotation.y = v; }

  forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }
}

// A rectangular loop around one block, driven clockwise on the streets.
export function makeLoop(rng) {
  const bx = rng.int(-4, 3);
  const bz = rng.int(-4, 3);
  const x0 = bx * CITY.pitch + CITY.pitch / 2 - CITY.pitch / 2 - CITY.roadHalf / 2;
  const x1 = bx * CITY.pitch + CITY.pitch / 2 + CITY.pitch / 2 + CITY.roadHalf / 2;
  const z0 = bz * CITY.pitch + CITY.pitch / 2 - CITY.pitch / 2 - CITY.roadHalf / 2;
  const z1 = bz * CITY.pitch + CITY.pitch / 2 + CITY.pitch / 2 + CITY.roadHalf / 2;
  // Corners in driving order; the car aims at the next one.
  return [
    { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
  ];
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

// One arcade step for any car: throttle -1..1, steer -1..1, dt seconds.
export function stepCar(car, throttle, steer, dt, colliders) {
  const targetSpeed = throttle >= 0 ? throttle * CAR.topSpeed : throttle * CAR.reverseMax;
  const rate = throttle >= 0 ? CAR.accel : CAR.brake;
  car.speed += Math.max(-rate * dt, Math.min(rate * dt, targetSpeed - car.speed));
  if (Math.abs(throttle) < 0.05) car.speed *= Math.max(0, 1 - 2.2 * dt);
  const speedSign = car.speed >= 0 ? 1 : -1;
  car.yaw += steer * CAR.steerMax * (Math.abs(car.speed) / CAR.topSpeed) * 2.4 * speedSign * dt;
  const f = car.forward();
  car.pos.x += f.x * car.speed * dt;
  car.pos.z += f.z * car.speed * dt;
  resolveCircleCollision(car.pos, 2.1, colliders);
  clampToWorld(car.pos, 2);
  // Spin the wheels to match the road speed.
  const spin = (car.speed * dt) / 0.36;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  if (car.kind === 'police') {
    car.flash += dt;
    const on = Math.floor(car.flash * 6) % 2 === 0;
    car.mesh.userData.lightRed.material.color.setHex(on ? 0xff2222 : 0x550000);
    car.mesh.userData.lightBlue.material.color.setHex(on ? 0x111166 : 0x2244ff);
  }
}

// Traffic brains: follow the loop, slow down for the car ahead.
export function stepTraffic(car, dt, colliders, allCars) {
  if (!car.route) return;
  const target = car.route[car.routeIndex];
  const dx = target.x - car.pos.x;
  const dz = target.z - car.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 4) {
    car.routeIndex = (car.routeIndex + 1) % car.route.length;
    return;
  }
  const wantYaw = Math.atan2(dx, dz);
  let dyaw = wantYaw - car.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, dyaw * 1.6));
  // Look ahead: if another car is close in front, brake.
  let throttle = 0.55;
  const f = car.forward();
  for (const other of allCars) {
    if (other === car || other.dead) continue;
    const ox = other.pos.x - car.pos.x;
    const oz = other.pos.z - car.pos.z;
    const ahead = ox * f.x + oz * f.z;
    const side = Math.abs(ox * f.z - oz * f.x);
    if (ahead > 0 && ahead < 9 && side < 2.4) { throttle = -0.6; break; }
  }
  stepCar(car, throttle, steer, dt, colliders);
}

// Police chase brains: steer at the player, ram, and never give up while wanted.
export function stepPoliceCar(car, dt, colliders, playerPos) {
  const dx = playerPos.x - car.pos.x;
  const dz = playerPos.z - car.pos.z;
  const wantYaw = Math.atan2(dx, dz);
  let dyaw = wantYaw - car.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, dyaw * 2.2));
  const dist = Math.hypot(dx, dz);
  stepCar(car, dist > 6 ? 1 : 0.5, steer, dt, colliders);
}
