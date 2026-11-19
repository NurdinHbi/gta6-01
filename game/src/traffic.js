// Traffic: ten AI cars looping the street grid, twelve stealable parked cars, and the
// Solmar PD patrol cars that join the chase from two stars. AI cars follow rectangular
// loops around blocks and brake for the car ahead; patrol cars steer straight at the
// player and ram. One shared car builder makes every vehicle so the player car, the
// traffic and the police all read as the same city fleet.

import * as THREE from 'three';
import { randomRoadPoint, HALF } from './city.js';

export const CAR_COLORS = [0xd94545, 0x3f6fd9, 0x53b06a, 0xe0a53c, 0xf2f2f2, 0x22262e, 0x9b6bd9, 0x3fb8a6, 0xe07ab0, 0xc9a227, 0x7a4a2a, 0x5a7a8a];
const LOOPS = [-224, -168, -112, -56, 0, 56, 112, 168, 224];

/** A low-poly sedan: body, cabin, four wheels, headlights and taillights. */
export function buildCarMesh(color, isPolice) {
  const car = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1d3a6b : color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x15181d });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fc4d8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  car.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.6, 2.2), glass);
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  car.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, 0.36, wz);
    car.add(wheel);
    wheels.push(wheel);
  }
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffdf80, emissiveIntensity: 0.8 });
  for (const lx of [-0.7, 0.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), lightMat);
    head.position.set(lx, 0.62, 2.22);
    car.add(head);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.16, 0.08),
      new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0x881111 }),
    );
    tail.position.set(lx, 0.62, -2.22);
    car.add(tail);
  }
  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    stripe.position.y = 0.72;
    car.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.4), new THREE.MeshLambertMaterial({ color: 0x223344 }));
    bar.position.set(0, 1.5, -0.2);
    car.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.42), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1.6 }));
    red.position.set(-0.28, 1.52, -0.2);
    car.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.42), new THREE.MeshLambertMaterial({ color: 0x2266ff, emissive: 0x2266ff, emissiveIntensity: 1.6 }));
    blue.position.set(0.28, 1.52, -0.2);
    car.add(blue);
    car.userData.beaconRed = red;
    car.userData.beaconBlue = blue;
  }
  car.userData.wheels = wheels;
  return car;
}

function loopWaypoints(rng) {
  const a = rng.pick(LOOPS);
  const b = rng.pick(LOOPS);
  const c = rng.pick(LOOPS);
  const d = rng.pick(LOOPS);
  return [
    { x: a, z: -HALF + 12 }, { x: a, z: b }, { x: c, z: b }, { x: c, z: d }, { x: -HALF + 12, z: d },
  ];
}

export function createTraffic(scene, rng, parkedSpots, colliders = []) {
  const aiCars = [];
  for (let i = 0; i < 10; i += 1) {
    const spot = randomRoadPoint(rng);
    const mesh = buildCarMesh(rng.pick(CAR_COLORS), false);
    mesh.position.set(spot.x, 0, spot.z);
    scene.add(mesh);
    aiCars.push({
      mesh,
      pos: mesh.position,
      heading: rng.range(0, Math.PI * 2),
      speed: 0,
      cruise: rng.range(7, 11),
      waypoints: loopWaypoints(rng),
      wp: 0,
      stopped: 0,
      parked: false,
      police: false,
    });
  }

  const parked = [];
  for (const spot of parkedSpots) {
    const mesh = buildCarMesh(rng.pick(CAR_COLORS), false);
    mesh.position.set(spot.x, 0, spot.z);
    mesh.rotation.y = spot.heading;
    scene.add(mesh);
    parked.push({
      mesh,
      pos: mesh.position,
      heading: spot.heading,
      speed: 0,
      cruise: 0,
      waypoints: [],
      wp: 0,
      stopped: 0,
      parked: true,
      police: false,
      stolen: false,
    });
  }

  const patrols = [];
  const patrolGroup = new THREE.Group();
  scene.add(patrolGroup);

  function spawnPatrol(near) {
    const mesh = buildCarMesh(0, true);
    mesh.position.set(near.x + rng.range(-40, 40), 0, near.z + rng.range(-40, 40));
    patrolGroup.add(mesh);
    const car = {
      mesh,
      pos: mesh.position,
      heading: rng.range(0, Math.PI * 2),
      speed: 0,
      cruise: 15,
      waypoints: [],
      wp: 0,
      stopped: 0,
      parked: false,
      police: true,
      flash: rng.next() * 10,
      detour: null,
    };
    patrols.push(car);
    return car;
  }

  /** True when a point would be inside a building (with a margin). */
  function insideBuilding(x, z, margin) {
    for (const c of colliders) {
      if (x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin) return true;
    }
    return false;
  }

  function steerToward(car, tx, tz, dt, maxTurn) {
    const want = Math.atan2(tx - car.pos.x, tz - car.pos.z);
    let diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.heading += Math.max(-maxTurn * dt, Math.min(maxTurn * dt, diff));
  }

  return {
    aiCars,
    parked,
    patrols,
    spawnPatrol,
    /** Keep the patrol count matched to the wanted level (0 below 2 stars). */
    syncPatrols(wanted, playerPos) {
      const want = wanted >= 2 ? Math.min(4, wanted) : 0;
      while (patrols.length < want) spawnPatrol(playerPos);
      while (patrols.length > want) {
        const car = patrols.pop();
        patrolGroup.remove(car.mesh);
      }
    },
    update(dt, playerPos, playerInCar, allCars) {
      for (const car of aiCars) {
        const wp = car.waypoints[car.wp];
        const dx = wp.x - car.pos.x;
        const dz = wp.z - car.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 4) {
          car.wp = (car.wp + 1) % car.waypoints.length;
          continue;
        }
        // Brake for anything slow right ahead.
        let blocked = false;
        for (const other of allCars) {
          if (other === car || other.parked) continue;
          const ox = other.pos.x - car.pos.x;
          const oz = other.pos.z - car.pos.z;
          const forward = ox * Math.sin(car.heading) + oz * Math.cos(car.heading);
          const side = Math.abs(ox * Math.cos(car.heading) - oz * Math.sin(car.heading));
          if (forward > 0 && forward < 9 && side < 2.4) { blocked = true; break; }
        }
        const target = blocked ? 0 : car.cruise;
        car.speed += Math.max(-14 * dt, Math.min(8 * dt, target - car.speed));
        steerToward(car, wp.x, wp.z, dt, 1.6);
        car.pos.x += Math.sin(car.heading) * car.speed * dt;
        car.pos.z += Math.cos(car.heading) * car.speed * dt;
        car.mesh.rotation.y = car.heading;
        for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += car.speed * dt * 1.4;
      }
      for (const car of patrols) {
        car.flash += dt;
        const blink = Math.sin(car.flash * 9) > 0;
        if (car.mesh.userData.beaconRed) {
          car.mesh.userData.beaconRed.material.emissiveIntensity = blink ? 2.2 : 0.2;
          car.mesh.userData.beaconBlue.material.emissiveIntensity = blink ? 0.2 : 2.2;
        }
        // Patrol cars chase, but they steer around buildings instead of through them:
        // if the road ahead is blocked, pick a sideways detour until it clears.
        let tx = playerPos.x;
        let tz = playerPos.z;
        const aheadX = car.pos.x + Math.sin(car.heading) * 8;
        const aheadZ = car.pos.z + Math.cos(car.heading) * 8;
        if (!car.detour && insideBuilding(aheadX, aheadZ, 3)) {
          const side = Math.sin(car.flash * 3.7) > 0 ? 1 : -1;
          car.detour = {
            x: car.pos.x + Math.cos(car.heading) * 34 * side,
            z: car.pos.z - Math.sin(car.heading) * 34 * side,
          };
        }
        if (car.detour) {
          tx = car.detour.x;
          tz = car.detour.z;
          if (Math.hypot(tx - car.pos.x, tz - car.pos.z) < 6 || !insideBuilding(aheadX, aheadZ, 3)) car.detour = null;
        }
        steerToward(car, tx, tz, dt, 2.0);
        const dist = Math.hypot(playerPos.x - car.pos.x, playerPos.z - car.pos.z);
        const target = dist > 6 ? 16.5 : 13;
        car.speed += Math.max(-18 * dt, Math.min(10 * dt, target - car.speed));
        car.pos.x += Math.sin(car.heading) * car.speed * dt;
        car.pos.z += Math.cos(car.heading) * car.speed * dt;
        car.mesh.rotation.y = car.heading;
        for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += car.speed * dt * 1.4;
      }
    },
    removePatrol(car) {
      const i = patrols.indexOf(car);
      if (i >= 0) patrols.splice(i, 1);
      patrolGroup.remove(car.mesh);
    },
  };
}
