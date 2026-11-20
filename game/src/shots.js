// The screenshot scenes behind ?shot=start|chase|night|end (with &seed=N).
// Each one plays the real rules forward from a fresh world for a fixed number
// of steps, steered by a scripted driver, so the frame is what a short game
// really looks like and the same seed always gives the same frame. Staged cars
// are always placed ON a road and pointed along it, so the scripted driver
// never rams a building: the avenue at x=0 runs the whole city north-south.

import { STEP } from './config.js';

function fakeInput(forward, strafe) {
  return {
    moveAxes: () => ({ f: forward, s: strafe || 0 }),
    held: { forward: forward > 0, back: forward < 0, left: false, right: false, run: false, handbrake: false },
    takeActions: () => 0,
    takeWeaponSlot: () => -1,
    takeOrbit: () => ({ dx: 0, dy: 0 }),
  };
}

function stepFor(world, seconds, input) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) world.step(STEP, input, { dx: 0, dy: 0 });
}

/** Put a parked car on the x=0 avenue, pointed south, and steal it. */
function carOnAvenue(world, z) {
  const car = world.vehicles.find((v) => v.kind === 'parked');
  if (!car) return null;
  car.x = 0; car.z = z; car.angle = 0;
  car.mesh.position.set(0, 0, z);
  car.mesh.rotation.y = 0;
  world.player.x = -3; world.player.z = z;
  world.enterNearestVehicle();
  return car;
}

/** Line the pursuing police cars up behind the player's car, then swing the
 * camera to the front-side so the pursuit is actually in frame: a chase
 * camera behind the player would put the police behind the lens. */
function lineUpPolice(world) {
  const p = world.player;
  const veh = p.vehicle;
  if (!veh) return;
  const fx = Math.sin(veh.angle); const fz = Math.cos(veh.angle);
  world.policeCars.forEach((pc, i) => {
    const back = 15 + i * 9;
    const side = i % 2 === 0 ? -3 : 3;
    pc.x = p.x - fx * back - fz * side;
    pc.z = p.z - fz * back + fx * side;
    pc.angle = veh.angle;
    pc.speed = 30;
    pc.mesh.position.set(pc.x, 0, pc.z);
    pc.mesh.rotation.y = pc.angle;
  });
  // Front-side camera: ahead of the car, looking back at it and the pursuit.
  world.setCamera(veh.angle + 0.35, 0.3, 18);
}

/**
 * Set `world` + `missions` to the named scene and return the screen to draw
 * over it. start = title at golden hour on the beachfront, pier and sea ahead;
 * chase = a three-star pursuit down the x=0 avenue at golden hour; night =
 * the casino strip after dark with cops closing in; end = the five-star Big
 * Score getaway at dusk, helicopter up, roadblock ahead.
 */
export function stageShot(name, world, missions) {
  world.reset();
  const idle = fakeInput(0, 0);
  if (name === 'chase') {
    world.setTimeOfDay(17.2);
    missions.start();
    carOnAvenue(world, -140);
    world.setWanted(3);
    stepFor(world, 6, fakeInput(1, 0));
    lineUpPolice(world);
    return 'play';
  }
  if (name === 'night') {
    world.setTimeOfDay(21.6);
    missions.start();
    // On the casino plaza, facing the neon sign to the north.
    world.player.x = 60; world.player.z = 214;
    world.setWanted(1);
    stepFor(world, 5, idle);
    world.setCamera(0, 0.26, 13);
    return 'play';
  }
  if (name === 'end') {
    world.setTimeOfDay(18.4);
    world.state.missionIndex = 7;
    missions.start();
    carOnAvenue(world, -60);
    world.setWanted(5);
    stepFor(world, 5, fakeInput(1, 0));
    lineUpPolice(world);
    return 'play';
  }
  // start (default): on the beachfront promenade, pier and sea ahead, the
  // tower behind the camera — the title panel sits over the waterfront.
  world.setTimeOfDay(17.6);
  missions.start();
  world.player.x = 0; world.player.z = 234;
  stepFor(world, 2, idle);
  world.setCamera(Math.PI, 0.42, 16);
  return 'title';
}
