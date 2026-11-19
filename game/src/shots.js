// Staged screenshot scenes behind ?shot=<name>&seed=<n>.
// Each one sets the real game to a real, playable state — a car on a street, a
// mission running, a police chase — then steps the world forward a little so the
// frame is alive, not posed. The same seed always gives the same frame.

import { CAR, PALETTE, STEP } from './config.js';
import { Car, stepTraffic } from './vehicles.js';
import { randomStreetSpot } from './people.js';

function settle(game, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    // Advance traffic and pedestrians a little so the frame is alive, not posed.
    for (const car of game.cars) {
      if (car.driver === 'ai' && car.kind === 'traffic' && car.route) {
        stepTraffic(car, STEP, game.city.colliders, game.cars);
      }
    }
    for (const ped of game.peds) ped.update(STEP, game.city.colliders, game.playerPos(), game.rng);
    game.time += STEP;
  }
}

function putPlayerInCar(game, x, z, yaw, speed) {
  const car = new Car(game.scene, x, z, yaw, 0xc0392b, 'player');
  car.driver = 'player';
  car.speed = speed;
  game.cars.push(car);
  game.playerCar = car;
  game.player.mesh.visible = false;
  game.controls.camYaw = yaw;
  game.controls.camPitch = 0.34;
  return car;
}

function placeCameraBehind(game, yaw) {
  game.controls.camYaw = yaw;
  game.controls.camPitch = 0.36;
}

export function stageShot(name, game) {
  game.setMode('play');
  game.sound.ensure?.();
  const scene = game.scene;

  if (name === 'start') {
    game.setMode('title');
    game.controls.camYaw = Math.PI * 0.8;
    return;
  }

  if (name === 'drive') {
    // Golden-hour cruise down the main avenue, traffic ahead, palms on the kerb.
    putPlayerInCar(game, 0, -60, 0, 14);
    for (let i = 0; i < 3; i += 1) {
      const spot = randomStreetSpot(game.rng);
      const car = new Car(scene, spot.x, spot.z, 0, game.rng.pick(PALETTE.carPaint), 'traffic');
      car.route = null;
      game.cars.push(car);
    }
    placeCameraBehind(game, 0);
    game.say('Solmar City — cruise the avenue. Steal a car with E, start work at Mara\'s garage.', 8);
    settle(game, 0.5);
    return;
  }

  if (name === 'foot') {
    // On foot in the plaza: pedestrians crossing, parked cars at the kerb,
    // pistol in hand, Mara's beacon glowing down the street.
    game.player.mesh.position.set(0, 0, 12);
    game.player.yaw = Math.PI * 0.9;
    game.player.armed = 'pistol';
    game.pistolMesh.visible = true;
    // A few pedestrians crossing right in front of the player, so the shot
    // shows the city's foot traffic instead of an empty street.
    const nearSpots = [[3, 22], [-6, 26], [8, 4], [-4, -2]];
    for (let i = 0; i < nearSpots.length; i += 1) {
      const ped = game.peds[i % game.peds.length];
      ped.mesh.position.set(nearSpots[i][0], 0, nearSpots[i][1]);
      ped.yaw = Math.PI / 2;
      ped.targetYaw = Math.PI / 2;
    }
    placeCameraBehind(game, Math.PI * 0.9);
    game.say('On foot in Solmar City. F punch, 2 pistol, E to steal a car.', 8);
    settle(game, 0.5);
    return;
  }

  if (name === 'mission') {
    // Pizza Rush mid-run: one box already grabbed, the gold beacon marking the
    // next pickup, the objective panel and the minimap marker live.
    game.missions.index = 1;
    game.missions.begin(1, game);
    game.missions.active.pickups = 1;
    game.missions.active.target = game.missions.pizzaSpot(1, game);
    game.missions.setBeacon(game.missions.active.target, PALETTE.beaconGold);
    // On the same street as the gold beacon (x = -174), 26 m south of it, facing
    // it — the beam has to be in the frame, not behind the camera.
    game.player.mesh.position.set(-174, 0, 90);
    game.player.yaw = 0;
    placeCameraBehind(game, 0);
    game.say('Pizza Rush: 1 of 3 boxes collected. Follow the gold beacon.', 8);
    settle(game, 0.5);
    return;
  }

  if (name === 'chase') {
    // Three stars, two police cars on the tail, the player flooring it down the
    // avenue — wanted stars, sirens and the minimap all lit up. The police sit
    // AHEAD of the player, facing the camera as a roadblock: the chase camera
    // looks forward, so cars staged behind it never appear in the frame.
    const car = putPlayerInCar(game, 0, 40, Math.PI, 26);
    void car;
    game.setWanted(3, true);
    game.sound.sirenStart();
    game.hud.setObjective('WANTED — 3 stars! Lose the Solmar PD or find a hideout.');
    const cop1 = new Car(scene, -3.5, 4, 0, 0xf5f6fa, 'police');
    cop1.driver = 'police';
    cop1.speed = 24;
    game.cars.push(cop1);
    game.wanted.policeCars.push(cop1);
    const cop2 = new Car(scene, 3.5, -10, 0, 0xf5f6fa, 'police');
    cop2.driver = 'police';
    cop2.speed = 22;
    game.cars.push(cop2);
    game.wanted.policeCars.push(cop2);
    placeCameraBehind(game, Math.PI);
    game.say('3 stars! Lose the Solmar PD — outrun them or find a hideout.', 8);
    settle(game, 0.5);
    return;
  }

  // Any other name stages the title screen.
  game.setMode('title');
}
