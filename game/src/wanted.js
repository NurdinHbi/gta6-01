// Police cars answer fast: they spawn on a nearby street, 26–40 m from the
// player, snapped onto the closest street line — never a random corner of the
// city the player will never see. (Playtest: at 3 stars the cars spawned
// anywhere and took a full minute to arrive; the heat has to feel immediate.)
function nearStreetSpot(game) {
  const p = game.playerPos();
  const dir = game.rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  const d = game.rng.float(26, 40);
  let x = p.x + dir[0] * d;
  let z = p.z + dir[1] * d;
  if (dir[0] !== 0) z = Math.round(z / CITY.pitch) * CITY.pitch;
  else x = Math.round(x / CITY.pitch) * CITY.pitch;
  x = Math.max(-CITY.halfExtent, Math.min(CITY.halfExtent, x));
  z = Math.max(-CITY.halfExtent, Math.min(CITY.halfExtent, z));
  return { x, z };
}

import { CITY, WANTED } from './config.js';
import { FootCop } from './people.js';
import { Car, stepPoliceCar } from './vehicles.js';
import { randomStreetSpot } from './people.js';

export class WantedSystem {
  constructor(scene) {
    this.scene = scene;
    this.level = 0;
    this.quietTimer = 0;
    this.cops = [];
    this.policeCars = [];
    this.spawnTimer = 0;
    this.flashTimer = 0;
  }

  set(level, silent = false) {
    this.level = Math.max(0, Math.min(WANTED.max, level));
    this.quietTimer = 0;
  }

  add(amount, game) {
    if (amount <= 0) return;
    this.set(this.level + amount);
    this.quietTimer = 0;
    if (this.level >= 1) game.sound.sirenStart();
    game.hud.flashWanted();
  }

  // Drop every cop that is chasing; used on respawn and when the heat clears.
  clearPursuit(game) {
    for (const cop of this.cops) game.scene.remove(cop.mesh);
    for (const car of this.policeCars) {
      game.scene.remove(car.mesh);
      const i = game.cars.indexOf(car);
      if (i >= 0) game.cars.splice(i, 1);
    }
    this.cops = [];
    this.policeCars = [];
    game.sound.sirenStop();
  }

  update(dt, game) {
    const playerPos = game.playerPos();
    // Quiet time fades one star at a time, but only while no cop is close.
    let nearestCop = Infinity;
    for (const cop of this.cops) {
      const d = Math.hypot(cop.pos.x - playerPos.x, cop.pos.z - playerPos.z);
      if (d < nearestCop) nearestCop = d;
    }
    if (this.level > 0 && nearestCop > 42) {
      this.quietTimer += dt;
      if (this.quietTimer >= WANTED.decaySeconds) {
        this.quietTimer = 0;
        this.set(this.level - 1);
        if (this.level === 0) {
          this.clearPursuit(game);
          game.say('You lost the cops. Heat is off.', 4);
        }
      }
    } else {
      this.quietTimer = 0;
    }

    // Spawn pursuit to match the wanted level.
    this.spawnTimer -= dt;
    const wantCops = this.level >= 1 ? Math.min(2 + this.level, 6) : 0;
    const wantCars = this.level >= 2 ? Math.min(this.level - 1, 3) : 0;
    if (this.spawnTimer <= 0 && (this.cops.length < wantCops || this.policeCars.length < wantCars)) {
      this.spawnTimer = 1.2;
      if (this.cops.length < wantCops) {
        const spot = randomStreetSpot(game.rng);
        // Cops arrive on foot a little way off, never on top of the player.
        const dx = spot.x - playerPos.x;
        const dz = spot.z - playerPos.z;
        const d = Math.hypot(dx, dz);
        const sx = d < 24 ? playerPos.x + (dx / d) * 30 : spot.x;
        const sz = d < 24 ? playerPos.z + (dz / d) * 30 : spot.z;
        this.cops.push(new FootCop(game.scene, sx, sz));
      } else if (this.policeCars.length < wantCars) {
        const spot = nearStreetSpot(game);
        const car = new Car(game.scene, spot.x, spot.z, 0, 0xf5f6fa, 'police');
        car.driver = 'police';
        game.cars.push(car);
        this.policeCars.push(car);
      }
    }

    // Foot cops run the player down.
    for (let i = this.cops.length - 1; i >= 0; i -= 1) {
      const cop = this.cops[i];
      if (cop.dead) {
        game.scene.remove(cop.mesh);
        this.cops.splice(i, 1);
        continue;
      }
      if (this.level === 0) cop.givingUp = true;
      const result = cop.update(dt, playerPos, game.city.colliders);
      if (result.caught && !game.playerCar) {
        game.busted();
        return;
      }
      if (cop.givingUp) {
        const d = Math.hypot(cop.pos.x - playerPos.x, cop.pos.z - playerPos.z);
        if (d > 90) {
          game.scene.remove(cop.mesh);
          this.cops.splice(i, 1);
        }
      }
    }

    // Police cars ram the player (or their car).
    for (let i = this.policeCars.length - 1; i >= 0; i -= 1) {
      const car = this.policeCars[i];
      if (car.dead) {
        game.scene.remove(car.mesh);
        this.policeCars.splice(i, 1);
        const ci = game.cars.indexOf(car);
        if (ci >= 0) game.cars.splice(ci, 1);
        continue;
      }
      if (this.level === 0) {
        // No heat: the car peels off and despawns far away.
        const d = Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z);
        if (d > 120) {
          game.scene.remove(car.mesh);
          this.policeCars.splice(i, 1);
          const ci = game.cars.indexOf(car);
          if (ci >= 0) game.cars.splice(ci, 1);
        }
        continue;
      }
      stepPoliceCar(car, dt, game.city.colliders, playerPos);
      car.ramCooldown = Math.max(0, car.ramCooldown - dt);
      const d = Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z);
      // A ram hurts once, then the car needs a second to line up the next one:
      // without the cooldown a touching police car dealt damage every frame and
      // killed a standing player in under a second (found in playtesting).
      if (d < 3.4 && car.ramCooldown <= 0) {
        car.ramCooldown = 1.0;
        // A ram: shove the player and hurt them (or their car).
        if (game.playerCar) {
          game.damageCar(game.playerCar, WANTED.policeCarRamDamage);
          game.playerCar.pos.x += (playerPos.x - car.pos.x) * 0.2;
          game.playerCar.pos.z += (playerPos.z - car.pos.z) * 0.2;
        } else {
          game.damagePlayer(WANTED.policeCarRamDamage, 'rammed by a police car');
        }
        car.speed *= -0.3;
      }
    }

    // Siren follows the wanted level.
    if (this.level >= 2) game.sound.sirenStart();
    else game.sound.sirenStop();
  }
}
