// Mara's story: four missions in order, then free roam with taxi fares.
// Each mission is a small state machine driven by where the player stands and
// what they are driving; a glowing beacon and a minimap marker always point the
// way. The manager only asks the game for facts — it never touches the renderer
// except through the beacon meshes it owns.

import { MISSIONS, PALETTE } from './config.js';

function makeBeacon(color) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.6, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 13;
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.4, 0.28, 8, 24),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  group.add(ring);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color }),
  );
  diamond.position.y = 4.2;
  group.add(diamond);
  group.userData = { beam, ring, diamond };
  group.visible = false;
  return group;
}

export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.index = 0;            // next mission to play (0..4; 4 means story done)
    this.active = null;        // the running mission's live state, or null
    this.beacon = makeBeacon(PALETTE.beacon);
    scene.add(this.beacon);
    this.beacon2 = makeBeacon(PALETTE.beaconGold);
    scene.add(this.beacon2);
    this.startMarker = makeBeacon(PALETTE.markerGreen);
    scene.add(this.startMarker);
    this.fare = null;          // live taxi fare, or null
    this.fareCooldown = 0;
    this.spin = 0;
  }

  get storyDone() { return this.index >= MISSIONS.length; }
  get currentDef() { return MISSIONS[this.index] ?? null; }

  // Where the next mission starts: Mara's garage door on the west side.
  startSpot() { return { x: -261, z: -8 }; }

  setStartBeacon(on) {
    this.startMarker.visible = on && !this.active && !this.storyDone;
    if (on) this.startMarker.position.set(-261, 0, -8);
  }

  begin(index, game) {
    const def = MISSIONS[index];
    if (!def) return false;
    this.active = {
      def,
      stage: 'go',
      timer: def.timeLimit,
      pickups: 0,
      holdTimer: 0,
      surviveTimer: 0,
      target: null,
    };
    if (def.id === 'wheels') {
      this.active.stage = 'steal';
      this.setBeacon(game.city.spots.garage, PALETTE.beacon);
    } else if (def.id === 'pizza') {
      this.active.stage = 'pickup';
      this.active.pickups = 0;
      this.active.target = this.pizzaSpot(0, game);
      this.setBeacon(this.active.target, PALETTE.beaconGold);
    } else if (def.id === 'heat') {
      game.setWanted(3, true);
      this.active.surviveTimer = 75;
      this.active.stage = 'survive';
      this.setBeacon(game.city.spots.hideout, PALETTE.beacon);
    } else if (def.id === 'job') {
      this.active.stage = 'bank';
      this.setBeacon(game.city.spots.bank, PALETTE.beaconGold);
    }
    game.say(`${def.name} — ${def.brief}`, 6);
    game.hud.setObjective(`${def.name}: ${def.brief}`);
    return true;
  }

  pizzaSpot(n, game) {
    const spots = [
      { x: 116, z: -174 }, { x: -174, z: 116 }, { x: 232, z: -58 },
    ];
    return spots[n % spots.length];
  }

  setBeacon(spot, color) {
    this.beacon.visible = true;
    this.beacon.position.set(spot.x, 0, spot.z);
    this.beacon.userData.beam.material.color.setHex(color);
    this.beacon.userData.ring.material.color.setHex(color);
    this.beacon.userData.diamond.material.color.setHex(color);
  }

  hideBeacon() { this.beacon.visible = false; }
  hideBeacon2() { this.beacon2.visible = false; }

  near(pos, spot, radius = 6) {
    return Math.hypot(pos.x - spot.x, pos.z - spot.z) < radius;
  }

  complete(game) {
    const m = this.active;
    game.cash += m.def.reward;
    game.sound.cash();
    game.say(`${m.def.name} complete! +$${m.def.reward} from Mara.`, 5);
    game.hud.setObjective(this.storyDone
      ? 'Story complete — free roam. Pick up fares for extra cash.'
      : `Next: ${MISSIONS[this.index + 1].name} — head to the green beacon at Mara's garage.`);
    this.active = null;
    this.hideBeacon();
    this.hideBeacon2();
    this.index += 1;
    game.save();
    if (this.storyDone) {
      game.sound.missionDone();
      game.say('Story complete! Solmar City is yours. Fares pay $40–$120 a ride.', 7);
    }
  }

  fail(game, reason) {
    game.sound.missionFail();
    game.say(`Mission failed: ${reason}. Talk to Mara at the green beacon to retry.`, 6);
    game.hud.setObjective(`Mission failed — ${reason}. Return to Mara's garage to retry.`);
    this.active = null;
    this.hideBeacon();
    this.hideBeacon2();
  }

  // Called every frame while a mission runs. Returns nothing; it reads the game.
  update(dt, game) {
    this.spin += dt;
    for (const b of [this.beacon, this.beacon2, this.startMarker]) {
      if (b.visible) {
        b.userData.diamond.rotation.y = this.spin * 2;
        b.userData.diamond.position.y = 4.2 + Math.sin(this.spin * 2.4) * 0.5;
        b.userData.ring.scale.setScalar(1 + Math.sin(this.spin * 3) * 0.08);
      }
    }
    const m = this.active;
    if (m) {
      m.timer -= dt;
      if (m.timer <= 0) { this.fail(game, 'out of time'); return; }
      const playerPos = game.playerPos();
      if (m.def.id === 'wheels') {
        if (m.stage === 'steal' && game.playerCar) {
          m.stage = 'deliver';
          game.say('Nice wheels. Now bring it to the garage beacon.', 4);
        } else if (m.stage === 'deliver' && game.playerCar && this.near(playerPos, game.city.spots.garage, 9)) {
          this.complete(game);
          return;
        }
      } else if (m.def.id === 'pizza') {
        if (m.stage === 'pickup') {
          if (this.near(playerPos, m.target, 5)) {
            m.pickups += 1;
            game.sound.pickup();
            game.say(`Pizza box ${m.pickups} of 3 collected.`, 3);
            if (m.pickups >= 3) {
              m.stage = 'deliver';
              this.setBeacon(game.city.spots.diner, PALETTE.beacon);
              game.say('All three boxes. Deliver them to the diner!', 4);
            } else {
              m.target = this.pizzaSpot(m.pickups, game);
              this.setBeacon(m.target, PALETTE.beaconGold);
            }
          }
        } else if (this.near(playerPos, game.city.spots.diner, 8)) {
          this.complete(game);
          return;
        }
      } else if (m.def.id === 'heat') {
        if (m.stage === 'survive') {
          m.surviveTimer -= dt;
          game.hud.setObjective(`Lose the Heat: stay free ${Math.ceil(m.surviveTimer)}s more, then reach the hideout.`);
          if (m.surviveTimer <= 0) {
            m.stage = 'escape';
            game.setWanted(0, true);
            game.say('Heat is off — for now. Get to the hideout!', 4);
          }
        } else if (this.near(playerPos, game.city.spots.hideout, 9)) {
          this.complete(game);
          return;
        }
      } else if (m.def.id === 'job') {
        if (m.stage === 'bank') {
          if (this.near(playerPos, game.city.spots.bank, 8)) {
            m.holdTimer += dt;
            game.hud.setObjective(`The Solmar Job: grabbing the cash… ${Math.ceil(5 - m.holdTimer)}s`);
            if (m.holdTimer >= 5) {
              m.stage = 'escape';
              game.cash += 250;
              game.setWanted(4, true);
              this.setBeacon(game.city.spots.hideout, PALETTE.beacon);
              game.say('Vault cash grabbed (+$250 on the spot). 4 stars! Lose them and reach the hideout.', 5);
            }
          } else {
            m.holdTimer = Math.max(0, m.holdTimer - dt);
          }
        } else if (this.near(playerPos, game.city.spots.hideout, 9)) {
          this.complete(game);
          return;
        }
      }
    }
    // Taxi fares: free-roam money, offered once the player has wheels (mission 1 done).
    if (!m && this.index >= 1) {
      this.fareCooldown -= dt;
      if (!this.fare && this.fareCooldown <= 0) {
        this.offerFare(game);
      } else if (this.fare) {
        const dest = this.fare.dest;
        if (this.near(game.playerPos(), this.fare.pickup, 6) && !this.fare.pickedUp) {
          this.fare.pickedUp = true;
          game.sound.pickup();
          game.say(`Passenger aboard — take them to the marker ($${this.fare.pay}).`, 4);
          this.setBeacon(dest, PALETTE.markerGreen);
        } else if (this.fare.pickedUp && this.near(game.playerPos(), dest, 8)) {
          game.cash += this.fare.pay;
          game.sound.cash();
          game.say(`Fare complete! +$${this.fare.pay}.`, 4);
          this.fare = null;
          this.hideBeacon();
          this.fareCooldown = 8;
          game.save();
        }
      }
    }
  }

  offerFare(game) {
    const rng = game.rng;
    const spot = () => ({
      x: rng.pick([-232, -174, -116, -58, 0, 58, 116, 174, 232]) + rng.float(-4, 4),
      z: rng.pick([-232, -174, -116, -58, 0, 58, 116, 174, 232]) + rng.float(-4, 4),
    });
    const pickup = spot();
    let dest = spot();
    let tries = 0;
    while (Math.hypot(dest.x - pickup.x, dest.z - pickup.z) < 120 && tries < 8) { dest = spot(); tries += 1; }
    this.fare = { pickup, dest, pay: 40 + rng.int(0, 8) * 10, pickedUp: false };
    this.setBeacon(pickup, PALETTE.beaconGold);
    game.say(`Fare available: pick up the passenger at the gold beacon ($${this.fare.pay}).`, 5);
  }

  // The point the minimap should draw as the current objective, or null.
  objectivePoint(game) {
    if (this.active) {
      if (this.active.def.id === 'wheels') return game.city.spots.garage;
      if (this.active.def.id === 'pizza') return this.active.stage === 'pickup' ? this.active.target : game.city.spots.diner;
      if (this.active.def.id === 'heat') return game.city.spots.hideout;
      if (this.active.def.id === 'job') return this.active.stage === 'bank' ? game.city.spots.bank : game.city.spots.hideout;
      return null;
    }
    if (this.fare) return this.fare.pickedUp ? this.fare.dest : this.fare.pickup;
    return this.startSpot();
  }
}
