// The screenshot scenes behind ?shot=start|chase|night|end. Each one sets the
// real game to a fixed state (time of day, wanted level, positions, mission),
// steps the world forward a little so traffic, pedestrians and the sea are
// alive, and paints the frame — the same seed always gives the same frame.
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
  const body = car.mesh.children[0];
  if (body && body.material && body.material.color) body.material.color.setHex(0xc23b2e);
}

export function stageShot(name, game) {
  const { state, player, world } = game;
  if (name === 'chase') {
    // Three-star police chase on the avenue at dusk.
    state.timeSec = 18.2 * 3600;
    const car = world.parkedCars[0];
    game.enterCar(car);
    paintCarRed(car);
    car.x = -38;
    car.z = 40;
    state.carAngle = Math.PI;
    car.angle = Math.PI;
    state.carSpeed = 22;
    player.x = car.x;
    player.z = car.z;
    game.missions.jobIndex = 1;
    game.missions.beginJob();
    // Advance past the "steal a car" step (we are already driving) so the
    // objective bar reads as a chase, then set the three-star tail.
    game.missions.update(0.05, [], 0);
    game.setWanted(3);
    settle(game, 1.5);
    return { screen: 'play' };
  }
  if (name === 'night') {
    // Casino strip at night: on foot south of the Grand Solmar, facing its
    // neon signs, camera low so the signs stay in frame.
    state.timeSec = 22.4 * 3600;
    game.setWanted(0);
    player.x = -57;
    player.z = 88;
    player.angle = 0;
    state.camYaw = Math.PI;
    // Low camera looking up: the Grand Solmar neon signs (y≈24) stay in frame.
    state.camPitch = -0.15;
    state.camDist = 13;
    game.missions.jobIndex = 4;
    game.missions.beginJob();
    settle(game, 1.5);
    return { screen: 'play' };
  }
  if (name === 'end') {
    // Final-job getaway at dusk: five stars, roadblocks ahead. Advance the
    // Big Score past the vault hold so the objective bar reads as the
    // getaway through the roadblocks.
    state.timeSec = 18.7 * 3600;
    game.missions.jobIndex = 7;
    game.missions.beginJob();
    player.x = -60;
    player.z = 132;
    game.missions.update(13, [], 0);
    game.setWanted(5);
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
    return { screen: 'play' };
  }
  // Default: start — title screen at golden hour, looking west down the
  // beachfront toward the sea, the pier and the lighthouse.
  state.timeSec = 17.6 * 3600;
  game.setWanted(0);
  player.x = -150;
  player.z = 100;
  player.angle = -Math.PI / 2;
  state.camYaw = -Math.PI / 2;
  game.missions.beginJob();
  settle(game, 1.0);
  return { screen: 'title' };
}
