// Entities for Solmar City: player, cars (parked / traffic / police), pedestrians
// and foot cops, plus the arcade driving and chase AI. Classic script globals.
const CAR_COLORS = [0xc0392b, 0x2e6fb0, 0xe8c33a, 0x27ae60, 0x8e44ad, 0xe67e22, 0xdddddd, 0x222831, 0x16a085, 0xd35400, 0x7f8c8d, 0x1abc9c];

function collideWorld(pos, r, colliders) {
  let hit = false;
  for (const b of colliders) if (resolveCircleBox(pos, r, b)) hit = true;
  return hit;
}

// Like collideWorld, but also returns the total push-out vector (pointing away
// from the walls). Lets drivers slide along a wall instead of stopping dead.
function collideWorldPush(pos, r, colliders) {
  let px = 0, pz = 0, hit = false;
  for (const b of colliders) {
    const bx = pos.x, bz = pos.z;
    if (resolveCircleBox(pos, r, b)) { hit = true; px += pos.x - bx; pz += pos.z - bz; }
  }
  return hit ? { x: px, z: pz } : null;
}

function pointInColliders(x, z, colliders) {
  for (const b of colliders) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
  return false;
}

// ---------- Cars ----------
function createCarMesh(colorHex, isPolice) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorHex });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1d22 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fc4d8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.4), paint);
  body.position.y = 0.55; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.2), glass);
  cabin.position.set(0, 1.05, -0.25); g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 2.0), paint);
  roof.position.set(0, 1.32, -0.25); g.add(roof);
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.9, 1.45], [0.9, 1.45], [-0.9, -1.45], [0.9, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(wx, 0.34, wz);
    g.add(w); wheels.push(w);
  }
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0xffedb0, emissiveIntensity: 0.9 });
  for (const hx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), lightMat);
    h.position.set(hx, 0.62, 2.21); g.add(h);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xaa1111, emissive: 0x770000, emissiveIntensity: 0.6 });
  for (const hx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.08), tailMat);
    t.position.set(hx, 0.62, -2.21); g.add(t);
  }
  let lightL = null, lightR = null;
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.4), dark);
    bar.position.set(0, 1.42, -0.25); g.add(bar);
    lightL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.42),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1 }));
    lightL.position.set(-0.28, 1.44, -0.25); g.add(lightL);
    lightR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 1 }));
    lightR.position.set(0.28, 1.44, -0.25); g.add(lightR);
  }
  return { group: g, wheels, lightL, lightR };
}

function makeCar(scene, x, z, heading, colorHex, opts) {
  const o = opts || {};
  const mesh = createCarMesh(colorHex, !!o.isPolice);
  mesh.group.position.set(x, 0, z);
  mesh.group.rotation.y = heading;
  scene.add(mesh.group);
  return {
    mesh, x, z, heading, speed: 0, steer: 0,
    isPolice: !!o.isPolice, parked: !!o.parked, traffic: !!o.traffic,
    ai: o.ai || null, health: 100, color: colorHex,
    flashT: 0, ramCooldown: 0,
  };
}

// Arcade driving for the player's car. input: {fwd, back, left, right, brake}.
// Returns {crashed} when a hard building hit happened this frame.
function drivePlayerCar(car, input, dt, colliders) {
  const maxSpeed = 34, maxReverse = 10;
  const accel = 16, brakeDecel = 26, drag = 0.6;
  if (input.fwd) car.speed += accel * dt;
  if (input.back) car.speed -= (car.speed > 0.5 ? brakeDecel : 10) * dt;
  if (input.brake) car.speed -= Math.sign(car.speed) * brakeDecel * dt;
  if (!input.fwd && !input.back) car.speed -= Math.sign(car.speed) * drag * 3 * dt;
  if (Math.abs(car.speed) < 0.15 && !input.fwd && !input.back) car.speed = 0;
  car.speed = clamp(car.speed, -maxReverse, maxSpeed);
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const steerMax = 0.55 * (1 - Math.min(0.6, Math.abs(car.speed) / maxSpeed * 0.7));
  car.steer = lerp(car.steer, steerTarget * steerMax, clamp(dt * 8, 0, 1));
  const dirSign = car.speed >= 0 ? 1 : -1;
  // Steering authority needs a floor: at a crawl the car could barely turn
  // at all, so it wedged against building corners instead of turning out.
  // No turn at a dead stop; once rolling, turn like at least 5 u/s.
  const steerSpeed = Math.abs(car.speed) < 0.5 ? 0 : Math.max(Math.abs(car.speed), 5);
  car.heading += (car.steer * dirSign * steerSpeed * 0.055) * dt * (input.brake ? 1.35 : 1);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const pos = { x: nx, z: nz };
  const push = collideWorldPush(pos, 1.6, colliders);
  let crashed = false;
  if (push) {
    // Wall slide: a graze just scrubs a little speed; only a near head-on
    // impact counts as a crash. Scraping used to multiply speed by 0.4 every
    // frame, which pinned the car against the wall forever.
    const pl = Math.hypot(push.x, push.z) || 1;
    const fwdX = Math.sin(car.heading), fwdZ = Math.cos(car.heading);
    const intoWall = -(fwdX * (push.x / pl) + fwdZ * (push.z / pl));
    if (intoWall > 0.65) {
      if (Math.abs(car.speed) > 14) { crashed = true; car.speed *= -0.25; }
      else car.speed *= 0.4;
    } else car.speed *= 0.985;
    car.x = pos.x; car.z = pos.z;
  } else { car.x = nx; car.z = nz; }
  // Beach / pier is foot-only: cars stop at the sand.
  if (car.z > 150) { car.z = 150; if (car.speed > 0) car.speed *= 0.5; }
  car.x = clamp(car.x, -160, 160);
  car.z = clamp(car.z, -160, 150);
  car.mesh.group.position.set(car.x, 0, car.z);
  car.mesh.group.rotation.y = car.heading;
  for (const w of car.mesh.wheels) w.rotation.x += car.speed * dt * 2.2;
  if (car.mesh.wheels[0]) car.mesh.wheels[0].rotation.y = car.steer * 0.5;
  if (car.mesh.wheels[1]) car.mesh.wheels[1].rotation.y = car.steer * 0.5;
  return { crashed };
}

// ---------- Traffic AI ----------
function spawnTraffic(scene, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const road = CITY.ROAD_CENTERS[Math.floor(rng() * CITY.ROAD_CENTERS.length)];
    const dir = rng() < 0.5 ? 1 : -1;
    const laneOff = dir === 1 ? 2.2 : -2.2;
    const pos = -140 + rng() * 280;
    const color = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
    const c = makeCar(scene, 0, 0, 0, color, { traffic: true });
    c.ai = { axis, lane: road + laneOff, pos, dir, speed: 7 + rng() * 4, turnCooldown: 0 };
    cars.push(c);
  }
  return cars;
}

function updateTraffic(cars, dt, rng) {
  for (const c of cars) {
    const a = c.ai;
    a.turnCooldown -= dt;
    a.pos += a.dir * a.speed * dt;
    // At an intersection, sometimes turn onto the crossing road.
    if (a.turnCooldown <= 0) {
      for (const rc of CITY.ROAD_CENTERS) {
        if (Math.abs(a.pos - rc) < 1.4) {
          if (rng() < 0.35) {
            const newDir = rng() < 0.5 ? 1 : -1;
            const oldAxis = a.axis;
            a.axis = oldAxis === 'x' ? 'z' : 'x';
            const newLane = rc + (newDir === 1 ? 2.2 : -2.2);
            a.pos = a.lane;
            a.lane = newLane;
            a.dir = newDir;
            a.turnCooldown = 4;
          } else a.turnCooldown = 1.5;
          break;
        }
      }
    }
    if (a.pos > 148 || a.pos < -148) { a.dir *= -1; a.pos = clamp(a.pos, -148, 148); a.turnCooldown = 2; }
    if (a.axis === 'x') { c.x = a.pos; c.z = a.lane; c.heading = a.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else { c.x = a.lane; c.z = a.pos; c.heading = a.dir > 0 ? 0 : Math.PI; }
    c.speed = a.speed;
    c.mesh.group.position.set(c.x, 0, c.z);
    c.mesh.group.rotation.y = c.heading;
  }
}

// ---------- People ----------
function createPersonMesh(shirtHex, pantsHex, isCop) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtHex });
  const pants = new THREE.MeshLambertMaterial({ color: pantsHex });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), shirt);
  torso.position.y = 1.12; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.68; g.add(head);
  if (isCop) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 10),
      new THREE.MeshLambertMaterial({ color: 0x14264a }));
    cap.position.y = 1.88; g.add(cap);
  } else {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0x2b2018 }));
    hair.position.y = 1.76; hair.scale.set(1, 0.6, 1); g.add(hair);
  }
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.24), pants);
  legL.geometry.translate(0, -0.36, 0); legL.position.set(-0.16, 0.74, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armGeo = new THREE.BoxGeometry(0.16, 0.6, 0.18);
  armGeo.translate(0, -0.3, 0);
  const armL = new THREE.Mesh(armGeo, shirt); armL.position.set(-0.4, 1.44, 0); g.add(armL);
  const armR = new THREE.Mesh(armGeo, shirt); armR.position.set(0.4, 1.44, 0); g.add(armR);
  return { group: g, legL, legR, armL, armR };
}

function makePlayerMesh() {
  const m = createPersonMesh(0xd8d8d8, 0x2c3e50, false);
  // Player jacket: bright so the player is easy to spot.
  m.group.children[0].material = new THREE.MeshLambertMaterial({ color: 0xff5a3c });
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.4, 1.0, 0.25);
  m.group.add(gun);
  return { ...m, gun };
}

function spawnPeds(scene, rng, count, colliders) {
  const shirts = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xfd79a8];
  const peds = [];
  for (let i = 0; i < count; i++) {
    const m = createPersonMesh(shirts[i % shirts.length], 0x2c3e50, false);
    const x = -145 + rng() * 290, z = -145 + rng() * 290;
    m.group.position.set(x, 0, z);
    scene.add(m.group);
    peds.push({
      mesh: m, x, z, heading: rng() * Math.PI * 2, speed: 1.3 + rng() * 0.5,
      state: 'walk', tx: x, tz: z, health: 50, fleeT: 0, walkPhase: rng() * 6, downT: 0,
    });
  }
  return peds;
}

function pickPedTarget(p, rng, colliders) {
  for (let tries = 0; tries < 8; tries++) {
    const bx = CITY.MIN + Math.floor(rng() * CITY.GRID) * CITY.PITCH;
    const bz = CITY.MIN + Math.floor(rng() * CITY.GRID) * CITY.PITCH;
    const x = bx + 2 + rng() * 16, z = bz + 2 + rng() * 16;
    if (!pointInColliders(x, z, colliders)) { p.tx = x; p.tz = z; return; }
  }
  p.tx = p.x + (rng() - 0.5) * 20; p.tz = p.z + (rng() - 0.5) * 20;
}

function updatePeds(peds, dt, rng, colliders, threat) {
  for (const p of peds) {
    if (p.state === 'down') {
      p.downT -= dt;
      p.mesh.group.rotation.x = lerp(p.mesh.group.rotation.x, -Math.PI / 2 * 0.9, dt * 4);
      if (p.downT <= 0) { p.state = 'walk'; p.health = 50; p.mesh.group.rotation.x = 0; pickPedTarget(p, rng, colliders); }
      continue;
    }
    if (threat && dist2(p.x, p.z, threat.x, threat.z) < 9) { p.state = 'flee'; p.fleeT = 3; }
    if (p.state === 'flee') {
      p.fleeT -= dt;
      const a = Math.atan2(p.x - threat.x, p.z - threat.z);
      p.heading = angLerp(p.heading, a, dt * 6);
      const sp = 3.6;
      const pos = { x: p.x + Math.sin(p.heading) * sp * dt, z: p.z + Math.cos(p.heading) * sp * dt };
      collideWorld(pos, 0.4, colliders);
      p.x = clamp(pos.x, -160, 160); p.z = clamp(pos.z, -160, 244);
      if (p.fleeT <= 0) { p.state = 'walk'; pickPedTarget(p, rng, colliders); }
    } else {
      const d = dist2(p.x, p.z, p.tx, p.tz);
      if (d < 1.2) { pickPedTarget(p, rng, colliders); continue; }
      const a = Math.atan2(p.tx - p.x, p.tz - p.z);
      p.heading = angLerp(p.heading, a, dt * 5);
      const pos = { x: p.x + Math.sin(p.heading) * p.speed * dt, z: p.z + Math.cos(p.heading) * p.speed * dt };
      collideWorld(pos, 0.4, colliders);
      p.x = clamp(pos.x, -160, 160); p.z = clamp(pos.z, -160, 244);
    }
    p.walkPhase += dt * (p.state === 'flee' ? 11 : 7);
    const sw = Math.sin(p.walkPhase) * 0.5;
    p.mesh.legL.rotation.x = sw; p.mesh.legR.rotation.x = -sw;
    p.mesh.armL.rotation.x = -sw * 0.7; p.mesh.armR.rotation.x = sw * 0.7;
    p.mesh.group.position.set(p.x, 0, p.z);
    p.mesh.group.rotation.y = p.heading;
  }
}

// ---------- Foot cops ----------
function spawnFootCop(scene, x, z) {
  const m = createPersonMesh(0x1c3d6e, 0x14264a, true);
  m.group.position.set(x, 0, z);
  scene.add(m.group);
  return { mesh: m, x, z, heading: 0, speed: 5.2, bustT: 0, walkPhase: 0 };
}

function updateFootCops(cops, dt, player, wanted, colliders) {
  let busted = false;
  for (const c of cops) {
    const d = dist2(c.x, c.z, player.x, player.z);
    if (wanted >= 1 && !player.inCar) {
      const a = Math.atan2(player.x - c.x, player.z - c.z);
      c.heading = angLerp(c.heading, a, dt * 6);
      const sp = c.speed;
      const pos = { x: c.x + Math.sin(c.heading) * sp * dt, z: c.z + Math.cos(c.heading) * sp * dt };
      collideWorld(pos, 0.4, colliders);
      c.x = clamp(pos.x, -160, 160); c.z = clamp(pos.z, -160, 244);
      if (d < 2.3) { c.bustT += dt; if (c.bustT > 1.2) busted = true; }
      else c.bustT = Math.max(0, c.bustT - dt * 2);
    } else if (wanted >= 1 && player.inCar) {
      // Cops give up the foot chase against a car: hold position, watch.
      c.bustT = Math.max(0, c.bustT - dt);
    } else {
      c.bustT = 0;
    }
    c.walkPhase += dt * 9;
    const sw = Math.sin(c.walkPhase) * 0.55;
    c.mesh.legL.rotation.x = sw; c.mesh.legR.rotation.x = -sw;
    c.mesh.group.position.set(c.x, 0, c.z);
    c.mesh.group.rotation.y = c.heading;
  }
  return busted;
}

// ---------- Police cars ----------
function spawnPoliceCar(scene, x, z, heading) {
  const c = makeCar(scene, x, z, heading, 0xf2f2f2, { isPolice: true });
  c.speed = 0;
  return c;
}

function updatePoliceCars(cars, dt, player, colliders) {
  for (const c of cars) {
    c.flashT += dt;
    const on = Math.floor(c.flashT * 6) % 2 === 0;
    if (c.mesh.lightL) c.mesh.lightL.material.emissiveIntensity = on ? 1.6 : 0.15;
    if (c.mesh.lightR) c.mesh.lightR.material.emissiveIntensity = on ? 0.15 : 1.6;
    const d = dist2(c.x, c.z, player.x, player.z);
    const targetHeading = Math.atan2(player.x - c.x, player.z - c.z);
    const turn = clamp(angDiff(c.heading, targetHeading), -1, 1);
    const wantSpeed = d > 6 ? 26 : 12;
    c.speed = lerp(c.speed, wantSpeed, clamp(dt * 0.8, 0, 1));
    c.heading += turn * clamp(dt * 2.2, 0, 1) * (c.speed > 1 ? 1 : 0);
    const pos = { x: c.x + Math.sin(c.heading) * c.speed * dt, z: c.z + Math.cos(c.heading) * c.speed * dt };
    collideWorld(pos, 1.6, colliders);
    c.x = clamp(pos.x, -160, 160); c.z = clamp(pos.z, -160, 150);
    c.mesh.group.position.set(c.x, 0, c.z);
    c.mesh.group.rotation.y = c.heading;
  }
}
