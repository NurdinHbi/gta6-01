// Driving the player's car: arcade handling with acceleration, braking and reverse,
// speed-sensitive steering, a handbrake that breaks the rear loose, and collisions with
// buildings, traffic and pedestrians. Entering a parked car steals it (heat goes up);
// entering a moving traffic car yanks its driver out — same crime, same heat.

import * as THREE from 'three';
import { resolveCollisions, clampToCity } from './city.js';

const MAX_SPEED = 26;
const MAX_REVERSE = 10;

export function createDriver(scene, colliders) {
  let car = null;
  let speed = 0;
  let heading = 0;
  let drift = 0;

  return {
    get car() {
      return car;
    },
    get speed() {
      return speed;
    },
    get heading() {
      return heading;
    },
    get inCar() {
      return car !== null;
    },
    /** Climb into a car: snap the player to the driver's seat and take its heading. */
    enter(target, playerPos) {
      car = target;
      heading = target.heading;
      speed = 0;
      drift = 0;
      playerPos.set(target.pos.x, 0, target.pos.z);
      return car;
    },
    /** Climb out beside the car, leaving it where it stopped. */
    exit(playerPos) {
      if (!car) return null;
      const left = car;
      playerPos.set(
        car.pos.x + Math.cos(car.heading) * 2.2,
        0,
        car.pos.z - Math.sin(car.heading) * 2.2,
      );
      car.speed = 0;
      car = null;
      speed = 0;
      drift = 0;
      return left;
    },
    /** The nearest enterable car within 3.5 m, parked or in traffic. */
    nearestCar(playerPos, candidates) {
      let best = null;
      let bestD = 3.5;
      for (const c of candidates) {
        const d = Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return best;
    },
    /**
     * One driving step. Returns events: { crashed, hitPed } where hitPed lists the
     * pedestrians this step ran down, so the caller can raise the heat and knock them flat.
     */
    update(dt, move, walkers, trafficCars) {
      if (!car) return { crashed: false, hitPed: [] };
      const events = { crashed: false, hitPed: [] };
      const fwd = move.forward;
      const steer = move.strafe;
      if (fwd > 0) speed += 13 * dt;
      else if (fwd < 0) {
        speed += speed > 0.5 ? -26 * dt : -8 * dt;
      } else {
        speed -= Math.sign(speed) * Math.min(Math.abs(speed), 7 * dt);
      }
      if (move.brake) {
        speed -= Math.sign(speed) * Math.min(Math.abs(speed), 30 * dt);
        drift += dt;
      } else {
        drift = Math.max(0, drift - dt * 2);
      }
      speed = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, speed));
      // Steering bites hardest at parking speeds and softens as the car gets faster:
      // at the old flat rate the car snaked off the road at full speed, because a
      // small steering correction swung the nose too far before the driver could
      // correct it. The handbrake still breaks the rear loose for sharp turns.
      const turnRate = Math.max(0.9, 2.6 - Math.abs(speed) * 0.045) * (move.brake ? 1.4 : 1);
      heading -= steer * turnRate * dt * Math.sign(speed || 1);
      car.heading = heading;
      const nx = car.pos.x + Math.sin(heading) * speed * dt;
      const nz = car.pos.z + Math.cos(heading) * speed * dt;
      const probe = { x: nx, z: nz };
      if (resolveCollisions(probe, 1.7, colliders)) {
        if (Math.abs(speed) > 9) events.crashed = true;
        speed *= -0.25;
        probe.x = car.pos.x;
        probe.z = car.pos.z;
      }
      car.pos.x = probe.x;
      car.pos.z = probe.z;
      clampToCity(car.pos);
      // Soft bumps with other cars: shove both apart, bleed speed.
      for (const other of trafficCars) {
        if (other === car) continue;
        const dx = car.pos.x - other.pos.x;
        const dz = car.pos.z - other.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.6 && d > 0.001) {
          const push = (3.6 - d) / 2;
          const ux = dx / d;
          const uz = dz / d;
          car.pos.x += ux * push;
          car.pos.z += uz * push;
          if (!other.parked && !other.police) {
            other.pos.x -= ux * push;
            other.pos.z -= uz * push;
          }
          if (Math.abs(speed) > 10) events.crashed = true;
          speed *= 0.55;
        }
      }
      // Running a pedestrian down.
      for (const w of walkers) {
        if (!w.alive || w.down > 0) continue;
        const d = Math.hypot(w.pos.x - car.pos.x, w.pos.z - car.pos.z);
        if (d < 2.1 && Math.abs(speed) > 2) events.hitPed.push(w);
      }
      car.mesh.rotation.y = heading;
      const wheelSpin = speed * dt * 1.4;
      for (const wheel of car.mesh.userData.wheels) wheel.rotation.x += wheelSpin;
      if (Math.abs(steer) > 0 && Math.abs(speed) > 4) {
        car.mesh.userData.wheels[0].rotation.y = steer * 0.28;
        car.mesh.userData.wheels[1].rotation.y = steer * 0.28;
      } else {
        car.mesh.userData.wheels[0].rotation.y = 0;
        car.mesh.userData.wheels[1].rotation.y = 0;
      }
      return events;
    },
  };
}

/** A short-lived muzzle tracer + impact puff, for the pistol. */
export function makeTracer(scene) {
  const mat = new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 });
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geo, mat);
  line.visible = false;
  scene.add(line);
  let life = 0;
  return {
    fire(from, to) {
      geo.setFromPoints([from, to]);
      line.visible = true;
      life = 0.08;
    },
    update(dt) {
      if (life > 0) {
        life -= dt;
        if (life <= 0) line.visible = false;
      }
    },
  };
}
