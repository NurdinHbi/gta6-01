// Solmar City — every moving thing: the player, cars (parked, traffic,
// police), pedestrians, foot cops, the police helicopter and boats.
// Authored fresh for round 4 from the design spec.
const THREE = window.THREE;
import { makeRng, clamp, lerp, dist2d, angleDelta, angleLerp } from './util.js';

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8c13a, 0x3a3a3a, 0xd8d8d8, 0x2e8a4e, 0x8a4a9e, 0xe07b2e, 0x4a9e9e, 0x9e2e5e];
const PED_SHIRTS = [0xe84a4a, 0x4a8ae8, 0x4ae84a, 0xe8c13a, 0x9e4ae8, 0xe87b4a, 0x4ad8d8, 0xd8d8d8, 0x3a3a3a, 0xf2a0c0];
const PED_PANTS = [0x2a3a5a, 0x3a3a3a, 0x5a4a2a, 0x4a5a3a, 0x6a6a6a];

// Push a circle out of every building AABB it overlaps. Returns true if it hit.
export function resolveCollisions(p, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const nx = clamp(p.x, c.x - c.hx, c.x + c.hx);
    const nz = clamp(p.z, c.z - c.hz, c.z + c.hz);
    const dx = p.x - nx;
    const dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        p.x = nx + (dx / d) * radius;
        p.z = nz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const px = c.hx + radius - Math.abs(p.x - c.x);
        const pz = c.hz + radius - Math.abs(p.z - c.z);
        if (px < pz) p.x = c.x + (p.x >= c.x ? 1 : -1) * (c.hx + radius);
        else p.z = c.z + (p.z >= c.z ? 1 : -1) * (c.hz + radius);
      }
    }
  }
  return hit;
}

// Keep a walker inside the walkable area: city + beach + pier, never the sea.
// The sea starts at x = -352; the pier (a narrow strip around z = 0) is the
// one way to walk out past it, to the lighthouse at x = -380.
export function clampWalkable(p) {
  p.z = clamp(p.z, -290, 290);
  if (p.x < -282 && Math.abs(p.z) <= 6.5) {
    p.x = clamp(p.x, -380, 290); // on the pier
  } else {
    p.x = clamp(p.x, -352, 290); // beach and city; the sea is off limits
  }
}

export function makeCarMesh(color, kind) {
  const g = new THREE.Group();
  const bodyH = kind === 'van' ? 1.5 : 0.85;
  const bodyL = kind === 'van' ? 5.4 : kind === 'sport' ? 4.6 : 4.4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, bodyH, bodyL),
    new THREE.MeshLambertMaterial({ color }));
  body.position.y = 0.75;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, kind === 'van' ? 3.6 : 2.2),
    new THREE.MeshLambertMaterial({ color: 0x1c2733 }));
  cabin.position.set(0, bodyH + 0.55, kind === 'van' ? -0.3 : -0.2);
  cabin.castShadow = true;
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const [wx, wz] of [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.5], [1.0, -1.5]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const lx of [-0.7, 0.7]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.1), lightMat);
    l.position.set(lx, 0.8, bodyL / 2 + 0.02);
    g.add(l);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.position.set(0, bodyH + 1.0, -0.2);
    g.add(bar);
    const bar2 = bar.clone();
    bar2.material = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    bar2.position.z = 0.3;
    g.add(bar2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.3, bodyL + 0.02),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    stripe.position.y = 0.75;
    g.add(stripe);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xe8c13a }));
    sign.position.set(0, bodyH + 1.0, -0.2);
    g.add(sign);
  }
  return g;
}

export function makePlayerMesh() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2e6fc2 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a077 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.0, 0.5), shirt);
  body.position.y = 1.15; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), skin);
  head.position.y = 1.95; head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 12),
    new THREE.MeshLambertMaterial({ color: 0xc23b2e }));
  cap.position.y = 2.18;
  g.add(cap);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.7, 0.35), pants);
    leg.position.set(s * 0.22, 0.35, 0);
    g.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.28), shirt);
    arm.position.set(s * 0.56, 1.15, 0);
    g.add(arm);
  }
  return g;
}

function makePedMesh(shirtColor, pantsColor) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, 0.45),
    new THREE.MeshLambertMaterial({ color: shirtColor }));
  body.position.y = 1.1; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8a077 }));
  head.position.y = 1.85;
  g.add(head);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.65, 0.32),
      new THREE.MeshLambertMaterial({ color: pantsColor }));
    leg.position.set(s * 0.2, 0.33, 0);
    g.add(leg);
  }
  return g;
}

function makeCopMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1e2a4a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.5), navy);
  body.position.y = 1.15; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8a077 }));
  head.position.y = 1.95;
  g.add(head);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.16, 12), navy);
  hat.position.y = 2.16;
  g.add(hat);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xe8c13a }));
  badge.position.set(0.2, 1.35, 0.28);
  g.add(badge);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.7, 0.35), navy);
    leg.position.set(s * 0.22, 0.35, 0);
    g.add(leg);
  }
  return g;
}

export function makeBoatMesh(color) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 7),
    new THREE.MeshLambertMaterial({ color }));
  hull.position.y = 0.45; hull.castShadow = true;
  g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 4),
    new THREE.MeshLambertMaterial({ color }));
  bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.45, 4.4);
  g.add(bow);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 2.4),
    new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
  cabin.position.set(0, 1.3, -0.5);
  g.add(cabin);
  return g;
}

export function makeHeliMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 5.2),
    new THREE.MeshLambertMaterial({ color: 0x1e2a4a }));
  body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 1.6),
    new THREE.MeshLambertMaterial({ color: 0x9dc4d8 }));
  glass.position.set(0, 0.1, 2.2);
  g.add(glass);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x222222 }));
  rotor.position.y = 1.1;
  g.add(rotor);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.4),
    new THREE.MeshLambertMaterial({ color: 0x1e2a4a }));
  tail.position.set(0, 0.3, -4.4);
  g.add(tail);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(4.5, 26, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, side: THREE.DoubleSide }));
  beam.position.y = -13;
  beam.rotation.x = Math.PI;
  g.add(beam);
  g.userData.rotor = rotor;
  return g;
}

export function spawnParkedCars(scene, rng, city) {
  const cars = [];
  const kinds = ['sedan', 'sport', 'van', 'taxi', 'sedan', 'sport'];
  for (let i = 0; i < 12; i += 1) {
    const street = rng.pick(city.streetX);
    const along = rng.range(-260, 260);
    const side = rng.chance(0.5) ? 1 : -1;
    const horizontal = rng.chance(0.5);
    const x = horizontal ? along : street + side * 5.2;
    const z = horizontal ? street + side * 5.2 : along;
    const angle = horizontal ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const kind = kinds[i % kinds.length];
    const color = CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)];
    const mesh = makeCarMesh(color, kind);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = angle;
    scene.add(mesh);
    cars.push({ mesh, x, z, angle, speed: 0, kind, color, parked: true, stealable: true, health: 100 });
  }
  return cars;
}

export function spawnTraffic(scene, rng, city) {
  const cars = [];
  for (let i = 0; i < 10; i += 1) {
    const route = city.trafficRoutes[i % city.trafficRoutes.length];
    const wp = rng.int(0, route.length - 1);
    const start = route[wp];
    const kind = rng.pick(['sedan', 'sedan', 'sport', 'van', 'taxi']);
    const color = CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)];
    const mesh = makeCarMesh(color, kind);
    mesh.position.set(start.x, 0, start.z);
    scene.add(mesh);
    cars.push({
      mesh, x: start.x, z: start.z, angle: 0, speed: rng.range(6, 9),
      kind, color, parked: false, route, wpIndex: (wp + 1) % route.length,
      cruise: rng.range(6, 10),
    });
  }
  return cars;
}

export function updateTrafficCar(car, dt, colliders) {
  const target = car.route[car.wpIndex];
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const d = Math.hypot(dx, dz);
  if (d < 3) {
    car.wpIndex = (car.wpIndex + 1) % car.route.length;
    return;
  }
  const wantAngle = Math.atan2(dx, dz);
  car.angle = angleLerp(car.angle, wantAngle, dt * 2.2);
  const align = Math.cos(angleDelta(car.angle, wantAngle));
  const speed = car.cruise * clamp(align, 0.2, 1);
  car.x += Math.sin(car.angle) * speed * dt;
  car.z += Math.cos(car.angle) * speed * dt;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.angle;
}

// Arcade driving: throttle, steering that bites harder at speed, handbrake slide.
export function driveCar(car, input, dt, colliders, onCrash) {
  const maxSpeed = car.kind === 'sport' ? 34 : car.kind === 'van' ? 24 : 29;
  const accel = 16;
  if (input.forward) car.speed += accel * dt;
  if (input.back) car.speed -= (car.speed > 0.5 ? 26 : 10) * dt;
  if (!input.forward && !input.back) car.speed -= Math.sign(car.speed) * 6 * dt;
  if (Math.abs(car.speed) < 0.15 && !input.forward) car.speed = 0;
  car.speed = clamp(car.speed, -9, maxSpeed);
  const steerInput = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const speedFactor = clamp(Math.abs(car.speed) / 12, 0.25, 1);
  const grip = input.handbrake ? 0.45 : 1;
  car.angle += steerInput * 1.9 * speedFactor * grip * dt * Math.sign(car.speed || 1);
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.z + Math.cos(car.angle) * car.speed * dt;
  const trial = { x: nx, z: nz };
  const hitWall = resolveCollisions(trial, 1.6, colliders);
  if (trial.x < -350) trial.x = -350; // never drive into the sea
  if (trial.x > 286) trial.x = 286;
  if (trial.z < -286) trial.z = -286;
  if (trial.z > 286) trial.z = 286;
  if (hitWall && Math.abs(car.speed) > 8 && onCrash) onCrash(Math.abs(car.speed));
  if (hitWall) car.speed *= 0.45;
  car.x = trial.x; car.z = trial.z;
  // Stunt ramps: crossing one fast launches the car.
  car.mesh.position.set(car.x, car.y || 0, car.z);
  car.mesh.rotation.y = car.angle;
  car.mesh.rotation.z = input.handbrake && Math.abs(car.speed) > 10 ? -steerInput * 0.08 : 0;
}

export function spawnPedestrians(scene, rng, city) {
  const peds = [];
  for (let i = 0; i < 24; i += 1) {
    const street = rng.pick(city.streetX);
    const along = rng.range(-260, 260);
    const horizontal = rng.chance(0.5);
    const x = horizontal ? along : street + rng.pick([-9, 9]);
    const z = horizontal ? street + rng.pick([-9, 9]) : along;
    const mesh = makePedMesh(
      PED_SHIRTS[rng.int(0, PED_SHIRTS.length - 1)],
      PED_PANTS[rng.int(0, PED_PANTS.length - 1)]);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      mesh, x, z, angle: rng.range(0, Math.PI * 2),
      speed: rng.range(1.2, 2.6), target: null, scared: 0, alive: true,
      walkPhase: rng.range(0, 6),
    });
  }
  return peds;
}

export function updatePedestrian(ped, dt, rng, city, danger) {
  if (!ped.alive) return;
  if (ped.scared > 0) {
    ped.scared -= dt;
    ped.speed = 5.5;
  } else {
    ped.speed = ped.baseSpeed || 1.8;
  }
  if (!ped.target || dist2d(ped.x, ped.z, ped.target.x, ped.target.z) < 4) {
    if (ped.scared > 0 && danger) {
      const a = Math.atan2(ped.x - danger.x, ped.z - danger.z);
      ped.target = { x: ped.x + Math.sin(a) * 40, z: ped.z + Math.cos(a) * 40 };
    } else {
      const street = rng.pick(city.streetX);
      const along = rng.range(-260, 260);
      const horizontal = rng.chance(0.5);
      ped.target = horizontal
        ? { x: along, z: street + rng.pick([-9, 9]) }
        : { x: street + rng.pick([-9, 9]), z: along };
    }
  }
  const want = Math.atan2(ped.target.x - ped.x, ped.target.z - ped.z);
  ped.angle = angleLerp(ped.angle, want, dt * 3);
  ped.x += Math.sin(ped.angle) * ped.speed * dt;
  ped.z += Math.cos(ped.angle) * ped.speed * dt;
  clampWalkable(ped);
  ped.walkPhase += dt * ped.speed * 2.2;
  ped.mesh.position.set(ped.x, Math.abs(Math.sin(ped.walkPhase)) * 0.08, ped.z);
  ped.mesh.rotation.y = ped.angle;
  ped.mesh.rotation.z = Math.sin(ped.walkPhase) * 0.05;
}

export function spawnCop(scene, x, z) {
  const mesh = makeCopMesh();
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return { mesh, x, z, angle: 0, speed: 4.6, health: 60, punchTimer: 0, bustedHold: 0, alive: true };
}

export function updateCop(cop, dt, player, colliders) {
  if (!cop.alive) return;
  const d = dist2d(cop.x, cop.z, player.x, player.z);
  const want = Math.atan2(player.x - cop.x, player.z - cop.z);
  cop.angle = angleLerp(cop.angle, want, dt * 4);
  if (d > 1.6) {
    cop.x += Math.sin(cop.angle) * cop.speed * dt;
    cop.z += Math.cos(cop.angle) * cop.speed * dt;
    resolveCollisions(cop, 0.6, colliders);
    clampWalkable(cop);
  }
  cop.mesh.position.set(cop.x, 0, cop.z);
  cop.mesh.rotation.y = cop.angle;
  // Punch the player up close; hold them for a bust.
  cop.punchTimer -= dt;
  if (d < 1.9 && cop.punchTimer <= 0) {
    cop.punchTimer = 0.9;
    return 'punch';
  }
  if (d < 2.2) {
    cop.bustedHold += dt;
    if (cop.bustedHold > 2.5) return 'busted';
  } else {
    cop.bustedHold = Math.max(0, cop.bustedHold - dt);
  }
  return null;
}

export function spawnPoliceCar(scene, x, z) {
  const mesh = makeCarMesh(0x1e2a4a, 'police');
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return { mesh, x, z, angle: 0, speed: 0, kind: 'police', color: 0x1e2a4a, parked: false, health: 120 };
}

export function updatePoliceCar(car, dt, player, colliders, onCrash) {
  const d = dist2d(car.x, car.z, player.x, player.z);
  const want = Math.atan2(player.x - car.x, player.z - car.z);
  car.angle = angleLerp(car.angle, want, dt * 1.6);
  const targetSpeed = d > 6 ? 30 : 12;
  car.speed = lerp(car.speed, targetSpeed, dt * 0.8);
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.z + Math.cos(car.angle) * car.speed * dt;
  const trial = { x: nx, z: nz };
  const hitWall = resolveCollisions(trial, 1.6, colliders);
  if (hitWall) car.speed *= 0.4;
  car.x = clamp(trial.x, -282, 286);
  car.z = clamp(trial.z, -286, 286);
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.angle;
  if (d < 3.2 && Math.abs(car.speed) > 4 && onCrash) onCrash(car);
  return d;
}
