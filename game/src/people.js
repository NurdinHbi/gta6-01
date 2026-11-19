// The people of Solmar City: two dozen pedestrians wandering the sidewalks, and the
// foot cops who chase the player once the wanted level rises. Pedestrians are simple
// low-poly figures (body, head, swinging arms) that stroll between sidewalk waypoints,
// panic and run from gunfire and speeding cars, and get knocked flat when a car hits
// them. Cops are navy figures with a cap who sprint at the player, swing when close,
// and drag the player into a Busted arrest if they hold on long enough.

import * as THREE from 'three';
import { randomWalkPoint } from './city.js';

const SKINS = [0xe8b88a, 0xc98d64, 0x8a5a3b, 0xf2c9a0, 0x6b4423];
const SHIRTS = [0xe05a4b, 0x4b8fd9, 0x53b06a, 0xe0a53c, 0x9b6bd9, 0x3fb8a6, 0xf2f2f2, 0x333a44, 0xff8fb0, 0x7ad0e0];
const PANTS = [0x2b3a55, 0x3a3a3a, 0x5a4a35, 0x274435];

function buildFigure(shirt, pants, skin, isCop) {
  const figure = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.34), shirtMat);
  body.position.y = 1.05;
  body.castShadow = true;
  figure.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skinMat);
  head.position.y = 1.72;
  head.castShadow = true;
  figure.add(head);
  if (isCop) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x14264a }));
    cap.position.y = 1.92;
    figure.add(cap);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xaa8800 }));
    badge.position.set(-0.16, 1.25, 0.18);
    figure.add(badge);
  } else {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: 0x2a1c10 }));
    hair.position.y = 1.76;
    figure.add(hair);
  }
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), shirtMat);
  armL.position.set(-0.4, 1.05, 0);
  figure.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), shirtMat);
  armR.position.set(0.4, 1.05, 0);
  figure.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), pantsMat);
  legL.position.set(-0.16, 0.31, 0);
  figure.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), pantsMat);
  legR.position.set(0.16, 0.31, 0);
  figure.add(legR);
  figure.userData = { armL, armR, legL, legR, body };
  return figure;
}

export function createCrowd(scene, rng, colliders) {
  const walkers = [];
  for (let i = 0; i < 24; i += 1) {
    const spot = randomWalkPoint(rng);
    const figure = buildFigure(rng.pick(SHIRTS), rng.pick(PANTS), rng.pick(SKINS), false);
    figure.position.set(spot.x, 0, spot.z);
    scene.add(figure);
    walkers.push({
      mesh: figure,
      pos: figure.position,
      heading: rng.range(0, Math.PI * 2),
      target: randomWalkPoint(rng),
      speed: rng.range(1.1, 1.9),
      down: 0,
      panic: 0,
      phase: rng.range(0, Math.PI * 2),
      alive: true,
    });
  }

  const cops = [];
  const copGroup = new THREE.Group();
  scene.add(copGroup);

  function spawnCop(near) {
    const figure = buildFigure(0x1d3a6b, 0x14264a, rng.pick(SKINS), true);
    figure.position.set(near.x + rng.range(-14, 14), 0, near.z + rng.range(-14, 14));
    copGroup.add(figure);
    const cop = {
      mesh: figure,
      pos: figure.position,
      heading: 0,
      hp: 50,
      arrest: 0,
      swing: 0,
      phase: rng.range(0, Math.PI * 2),
      alive: true,
    };
    cops.push(cop);
    return cop;
  }

  function animateFigure(w, dt, speed) {
    const swing = Math.sin(w.phase) * 0.55 * Math.min(1, speed);
    const u = w.mesh.userData;
    u.armL.rotation.x = swing;
    u.armR.rotation.x = -swing;
    u.legL.rotation.x = -swing;
    u.legR.rotation.x = swing;
    w.phase += dt * 7 * Math.max(0.4, speed);
  }

  return {
    walkers,
    cops,
    spawnCop,
    /** Keep the foot-cop count matched to the wanted level (0 below 1 star). */
    syncCops(wanted, playerPos) {
      const want = wanted >= 1 ? Math.min(4, wanted + 1) : 0;
      while (cops.length < want) spawnCop(playerPos);
      while (cops.length > want) {
        const cop = cops.pop();
        copGroup.remove(cop.mesh);
      }
    },
    /** A walker hit by a car or a fist: flat on the ground for a while, then up again. */
    knockDown(walker, seconds) {
      if (!walker.alive || walker.down > 0) return false;
      walker.down = seconds;
      walker.mesh.rotation.x = -Math.PI / 2;
      walker.mesh.position.y = 0.35;
      return true;
    },
    update(dt, playerPos, playerSpeed, threats) {
      for (const w of walkers) {
        if (!w.alive) continue;
        if (w.down > 0) {
          w.down -= dt;
          if (w.down <= 0) {
            w.mesh.rotation.x = 0;
            w.mesh.position.y = 0;
            w.target = randomWalkPoint(rng);
          }
          continue;
        }
        // Panic: run away from the nearest threat (gunfire, speeding car).
        let flee = null;
        for (const t of threats) {
          const dx = w.pos.x - t.x;
          const dz = w.pos.z - t.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 30 * 30) {
            flee = { x: w.pos.x + dx, z: w.pos.z + dz };
            break;
          }
        }
        let speed = w.speed;
        let tx;
        let tz;
        if (flee) {
          tx = flee.x;
          tz = flee.z;
          speed = 4.6;
          w.panic = 2;
        } else {
          tx = w.target.x;
          tz = w.target.z;
          if (w.panic > 0) w.panic -= dt;
        }
        const dx = tx - w.pos.x;
        const dz = tz - w.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.2) {
          w.target = randomWalkPoint(rng);
        } else {
          const want = Math.atan2(dx, dz);
          let diff = want - w.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          w.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
          w.pos.x += Math.sin(w.heading) * speed * dt;
          w.pos.z += Math.cos(w.heading) * speed * dt;
          w.mesh.rotation.y = w.heading;
          animateFigure(w, dt, speed / 2);
        }
      }
      for (const cop of cops) {
        if (!cop.alive) continue;
        cop.swing -= dt;
        const dx = playerPos.x - cop.pos.x;
        const dz = playerPos.z - cop.pos.z;
        const dist = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        let diff = want - cop.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        cop.heading += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
        const speed = dist > 26 ? 7.2 : 6.1;
        cop.pos.x += Math.sin(cop.heading) * speed * dt;
        cop.pos.z += Math.cos(cop.heading) * speed * dt;
        cop.mesh.rotation.y = cop.heading;
        animateFigure(cop, dt, speed / 2.4);
      }
    },
    removeCop(cop) {
      const i = cops.indexOf(cop);
      if (i >= 0) cops.splice(i, 1);
      copGroup.remove(cop.mesh);
      cop.alive = false;
    },
    respawnWalker(w) {
      const spot = randomWalkPoint(rng);
      w.pos.set(spot.x, 0, spot.z);
      w.mesh.rotation.x = 0;
      w.down = 0;
      w.target = randomWalkPoint(rng);
    },
  };
}
