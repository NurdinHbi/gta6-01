// The people of Solmar City: pedestrians strolling the sidewalks, and the foot
// cops who chase the player once the wanted level rises. Everyone is a few boxes
// with a walk cycle made of swinging limbs.

import { CITY, PALETTE } from './config.js';
import { clampToWorld, resolveCircleCollision } from './city.js';

export function makePersonMesh(shirtColor, skinColor = PALETTE.playerSkin, isCop = false) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const pants = new THREE.MeshLambertMaterial({ color: isCop ? 0x1c2a4a : 0x2c3e50 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.36), shirt);
  body.position.y = 1.05;
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), skin);
  head.position.y = 1.72;
  group.add(head);
  if (isCop) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), new THREE.MeshLambertMaterial({ color: 0x0e1626 }));
    cap.position.y = 1.96;
    group.add(cap);
  } else {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x2b1d12 }));
    hair.position.y = 1.95;
    group.add(hair);
  }
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), shirt);
  armL.position.set(-0.4, 1.05, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), shirt);
  armR.position.set(0.4, 1.05, 0);
  group.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.2), pants);
  legL.position.set(-0.16, 0.31, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.2), pants);
  legR.position.set(0.16, 0.31, 0);
  group.add(legR);
  group.userData = { armL, armR, legL, legR, body, head };
  return group;
}

export class Pedestrian {
  constructor(scene, x, z, rng) {
    this.mesh = makePersonMesh(rng.pick(PALETTE.pedShirt));
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.yaw = rng.float(0, Math.PI * 2);
    this.speed = rng.float(1.1, 2.1);
    this.walkPhase = rng.float(0, Math.PI * 2);
    this.fleeing = false;
    this.fleeTimer = 0;
    this.health = 30;
    this.dead = false;
    this.retargetTimer = rng.float(2, 8);
    this.targetYaw = this.yaw;
  }

  get pos() { return this.mesh.position; }

  scare() {
    this.fleeing = true;
    this.fleeTimer = 4;
    this.speed = 4.2;
  }

  update(dt, colliders, playerPos, rng) {
    if (this.dead) return;
    this.retargetTimer -= dt;
    if (this.fleeTimer > 0) {
      this.fleeTimer -= dt;
      // Run away from the player.
      this.targetYaw = Math.atan2(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
      if (this.fleeTimer <= 0) { this.fleeing = false; this.speed = 1.6; }
    } else if (this.retargetTimer <= 0) {
      this.retargetTimer = rng.float(4, 10);
      // Turn onto a new street direction at an intersection-ish moment.
      this.targetYaw = Math.round((this.yaw + rng.pick([-Math.PI / 2, Math.PI / 2, 0])) / (Math.PI / 2)) * (Math.PI / 2);
    }
    let dyaw = this.targetYaw - this.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.yaw += Math.max(-2.4 * dt, Math.min(2.4 * dt, dyaw));
    this.mesh.rotation.y = this.yaw;
    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    resolveCircleCollision(this.pos, 0.5, colliders);
    clampToWorld(this.pos, 6);
    this.walkPhase += dt * this.speed * 3.2;
    const s = Math.sin(this.walkPhase) * 0.55;
    const u = this.mesh.userData;
    u.legL.rotation.x = s;
    u.legR.rotation.x = -s;
    u.armL.rotation.x = -s * 0.8;
    u.armR.rotation.x = s * 0.8;
  }
}

// A foot cop: runs at the player, and if he stays close long enough, the player
// is Busted. Cops give up and walk off once the wanted level falls.
export class FootCop {
  constructor(scene, x, z) {
    this.mesh = makePersonMesh(PALETTE.copShirt, PALETTE.playerSkin, true);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.yaw = 0;
    this.speed = 7.2;
    this.walkPhase = 0;
    this.catchTimer = 0;
    this.givingUp = false;
    this.dead = false;
    this.health = 50;
  }

  get pos() { return this.mesh.position; }

  update(dt, playerPos, colliders) {
    if (this.dead) return;
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (this.givingUp) {
      // Walk away from the player and despawn far off.
      this.yaw = Math.atan2(-dx, -dz);
      this.pos.x += Math.sin(this.yaw) * 2 * dt;
      this.pos.z += Math.cos(this.yaw) * 2 * dt;
      this.mesh.rotation.y = this.yaw;
      return { dist, caught: false };
    }
    this.yaw = Math.atan2(dx, dz);
    this.mesh.rotation.y = this.yaw;
    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    resolveCircleCollision(this.pos, 0.5, colliders);
    this.walkPhase += dt * this.speed * 3.4;
    const s = Math.sin(this.walkPhase) * 0.7;
    const u = this.mesh.userData;
    u.legL.rotation.x = s;
    u.legR.rotation.x = -s;
    u.armL.rotation.x = -s;
    u.armR.rotation.x = s;
    if (dist < 1.6) this.catchTimer += dt;
    else this.catchTimer = Math.max(0, this.catchTimer - dt * 2);
    return { dist, caught: this.catchTimer > 1.6 };
  }
}

// Random street-side spot, used for spawning pedestrians and parked cars.
export function randomStreetSpot(rng) {
  const street = rng.pick([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]) * CITY.pitch;
  const along = rng.float(-CITY.halfExtent + 20, CITY.halfExtent - 20);
  if (rng.chance(0.5)) return { x: street + rng.pick([-9, 9]), z: along };
  return { x: along, z: street + rng.pick([-9, 9]) };
}
