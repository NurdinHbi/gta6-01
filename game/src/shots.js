// The screenshot scenes behind ?shot=start|chase|night|end. Each one sets the
// real game to a fixed state (time of day, wanted level, positions, mission),
// steps the world forward a little so traffic, pedestrians and the sea are
// alive, and paints the frame — the same seed always gives the same frame.
// Round 7 stages the new content: a taxi on the beachfront, a rainy taxi
// fare at dusk, the neon casino strip at night, and the Harbor Heist getaway.
import { STEP } from './config.js';

function settle(game, seconds) {
  // Step the world without player input so the scene is alive, not frozen.
  const idle = { keys: new Set(), takeActions: () => 0, takeDrag: () => ({ dx: 0, dy: 0 }), mouseDown: false, moveAxes: () => ({ x: 0, y: 0 }), run: false, handbrake: false };
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) game.step(STEP, idle, 0, false);
}

function paintCarRed(car) {
  // The staged getaway cars should read clearly at dusk: repaint the body
  // (each car owns its body material) a bright red.
  if (car.bodyMat && car.bodyMat.color) car.bodyMat.color.setHex(0xc23b2e);
}

export function stageShot(name, game) {
  const { state, player, world } = game;
  if (name === 'chase') {
    // Rainy taxi fare at dusk: driving a yellow cab through the avenues
    // with the meter running and a two-star tail behind.
    state.timeSec = 18.2 * 3600;
    state.rain = 1;
    state.rainTarget = 1;
    state.weatherTimer = 999;
    const car = world.parkedCars.find((c) => c.type === 'taxi') || world.parkedCars[0];
    game.enterCar(car);
    car.x = -38;
    car.z = 40;
    state.carAngle = Math.PI;
    car.angle = Math.PI;
    state.carSpeed = 22;
    player.x = car.x;
    player.z = car.z;
    // Flag a passenger right next to the cab and start the fare.
    const tp = world.taxiPassengers[0];
    if (tp) {
      tp.active = true;
      tp.taken = false;
      tp.ped.mesh.visible = true;
      tp.x = car.x + 3;
      tp.z = car.z + 3;
      tp.ped.x = tp.x;
      tp.ped.z = tp.z;
      tp.ped.mesh.position.set(tp.x, 0, tp.z);
    }
    game.startTaxi();
    game.missions.jobIndex = 8;
    game.missions.beginJob();
    game.setWanted(2);
    // startTaxi sets the fare beacon; re-apply it after beginJob so the
    // yellow meter beacon — not the job beacon — is what the frame shows.
    if (state.taxiDest) game.setBeacon(state.taxiDest.x, 0, state.taxiDest.z, true);
    settle(game, 1.5);
    return { screen: 'play' };
  }
  if (name === 'night') {
    // Casino strip at night: on foot north of the Grand Solmar, facing its
    // neon signs. Pulled back so the signs read as signs, not flat colour,
    // with the avenue, traffic and cars in the lower frame.
    state.timeSec = 22.4 * 3600;
    state.rain = 0;
    state.rainTarget = 0;
    game.setWanted(0);
    player.x = -57;
    player.z = 70;
    player.angle = 0;
    state.camYaw = Math.PI;
    // Low camera looking up: the Grand Solmar neon signs (y≈24) stay in frame.
    state.camPitch = 0.0;
    state.camDist = 16;
    game.missions.jobIndex = 4;
    game.missions.beginJob();
    settle(game, 1.5);
    return { screen: 'play' };
  }
  if (name === 'end') {
    // Harbor Heist getaway at dusk: four stars, roadblocks ahead, helicopter
    // overhead — the new ninth job.
    state.timeSec = 18.7 * 3600;
    state.rain = 0;
    state.rainTarget = 0;
    game.missions.jobIndex = 8;
    game.missions.beginJob();
    // Advance past the pickup and the warehouse hold so the objective bar
    // reads as the getaway to the hideout.
    game.missions.objectiveIndex = 2;
    game.missions.placeBeacon();
    player.x = -60;
    player.z = 132;
    game.setWanted(4);
    const car = world.parkedCars[1];
    game.enterCar(car);
    paintCarRed(car);
    car.x = -57;
    car.z = 100;
    state.carAngle = Math.PI;
    car.angle = Math.PI;
    state.carSpeed = 26;
    player.x = car.x;
    player.z = car.z;
    settle(game, 1.5);
    // The helicopter circles 26 m out at height 42 — far above the chase
    // cam's frame, which looks slightly down. Put it low beside the car,
    // over the open road to the west, so it reads in the shot.
    const heli = world.heli;
    const fx = Math.sin(state.carAngle);
    const fz = Math.cos(state.carAngle);
    const rx = Math.cos(state.carAngle);
    const rz = -Math.sin(state.carAngle);
    heli.mesh.position.set(car.x + fx * 6 + rx * 14, 7, car.z + fz * 6 + rz * 14);
    heli.mesh.rotation.y = state.carAngle + Math.PI;
    const rb = world.roadblocks[0];
    if (rb) {
      rb.mesh.position.set(car.x + fx * 34, 0, car.z + fz * 34);
      rb.mesh.rotation.y = state.carAngle + Math.PI / 2;
    }
    return { screen: 'play' };
  }
  // Default: start — title screen at golden hour, looking west down the
  // beachfront avenue toward the sea, the pier and the lighthouse. The
  // camera sits east of the player (camYaw +PI/2), so the view runs west
  // down the clear road corridor; a taxi waits on the avenue.
  state.timeSec = 17.6 * 3600;
  state.rain = 0;
  state.rainTarget = 0;
  game.setWanted(0);
  player.x = -150;
  player.z = 114;
  player.angle = Math.PI / 2;
  state.camYaw = Math.PI / 2;
  state.camPitch = 0.28;
  state.camDist = 13;
  const taxi = world.parkedCars.find((c) => c.type === 'taxi');
  if (taxi) {
    taxi.x = -162;
    taxi.z = 116;
    taxi.angle = -Math.PI / 2;
    taxi.mesh.position.set(taxi.x, 0, taxi.z);
    taxi.mesh.rotation.y = taxi.angle;
  }
  game.missions.beginJob();
  settle(game, 1.0);
  return { screen: 'title' };
}
