// ?shot= scenes: deterministic staged frames for the screenshots. Each
// scene resets the world from the seed, then plays the real rules forward
// for a fixed number of steps under a simple driving autopilot, so the
// frame is what a short game really looks like and the same seed always
// gives the same frame.
import { STEP, GARAGE } from './config.js';
import { angleDiff } from './random.js';
import { makeCar } from './vehicles.js';

// Waypoint loop around downtown for the driving autopilot.
const LOOP = [
  { x: -104, z: -104 }, { x: 104, z: -104 },
  { x: 104, z: 104 }, { x: -104, z: 104 },
];

function autopilotDrive(game, dt) {
  const car = game.player.car;
  if (!car) return;
  const wp = LOOP[game.shotWp % LOOP.length];
  const d = Math.hypot(wp.x - car.x, wp.z - car.z);
  if (d < 12) game.shotWp += 1;
  const want = Math.atan2(wp.z - car.z, wp.x - car.x);
  const diff = angleDiff(want, car.angle);
  const input = game.input;
  // Always drive forward; handbrake-spin when the waypoint is behind.
  input.forward = true;
  input.back = false;
  input.left = diff > 0.12;
  input.right = diff < -0.12;
  input.handbrake = Math.abs(diff) > 2.2;
}

function putPlayerInCar(game, x, z, angle, color) {
  const car = makeCar('player', x, z, angle, color || 0xc23a2e);
  game.cars.push(car);
  game.player.inCar = car;
  game.player.car = car;
  game.player.x = x;
  game.player.z = z;
  game.camera.yaw = angle + Math.PI;
  game.camera.pitch = 0.32;
  game.camera.dist = 11;
  return car;
}

// Chase framing fix (v1 had the patrol cars behind the camera): after the
// autopilot run, move each police car to a spot ahead of the player's car
// — one in the lane ahead, one alongside — so the chase camera, which sits
// behind the player, actually sees them. Their speed matches the player's
// so the next live frames keep them in view.
function framePoliceCarsInView(game) {
  const car = game.player.car;
  if (!car) return;
  const fx = Math.cos(car.angle);
  const fz = Math.sin(car.angle);
  const lx = -fz;
  const lz = fx;
  const spots = [
    { ahead: 20, side: -4 },
    { ahead: 14, side: 5 },
  ];
  game.wanted.policeCars.forEach((copCar, i) => {
    const spot = spots[i % spots.length];
    copCar.x = car.x + fx * spot.ahead + lx * spot.side;
    copCar.z = car.z + fz * spot.ahead + lz * spot.side;
    copCar.angle = car.angle;
    copCar.speed = Math.max(car.speed, 16);
    copCar.ramTimer = 0;
  });
  // Keep the chase camera aimed down the road, not drifting.
  game.camera.yaw = car.angle + Math.PI;
  game.camera.pitch = 0.3;
  game.camera.dist = 12;
}

// Stage the named scene on the live game object. Returns the screen the
// HUD should show over it.
export function stageShot(name, game) {
  game.reset(game.seed);
  game.shotWp = 0;
  game.screen = 'play';
  if (name === 'start') {
    for (let i = 0; i < 5 / STEP; i += 1) game.step(STEP, true);
    game.screen = 'title';
    return 'title';
  }
  if (name === 'drive') {
    putPlayerInCar(game, -104, -100, 0, 0xc23a2e);
    game.player.cash = 1240;
    game.shotWp = 1; // first waypoint is ahead, down the road
    for (let i = 0; i < 14 / STEP; i += 1) {
      autopilotDrive(game, STEP);
      game.step(STEP, true);
    }
    return 'play';
  }
  if (name === 'chase') {
    putPlayerInCar(game, 0, -100, 0, 0x2e5fa3);
    game.player.cash = 2480;
    game.addWanted(3);
    game.shotWp = 1; // first waypoint is ahead, down the road
    for (let i = 0; i < 7 / STEP; i += 1) {
      autopilotDrive(game, STEP);
      game.step(STEP, true);
    }
    game.addWanted(0); // keep the 3 stars the chase earned; no decay yet
    framePoliceCarsInView(game);
    return 'play';
  }
  if (name === 'mission') {
    // On foot near Mara's garage, beacon on, objective live.
    game.player.x = GARAGE.x - 26;
    game.player.z = GARAGE.z - 6;
    game.player.angle = Math.atan2(GARAGE.z - game.player.z, GARAGE.x - game.player.x);
    game.player.cash = 620;
    game.camera.yaw = game.player.angle + Math.PI;
    game.camera.pitch = 0.3;
    game.camera.dist = 9;
    // A red car parked nearby, as if just stolen for the job.
    const car = makeCar('parked', GARAGE.x - 14, GARAGE.z + 8, Math.PI / 2, 0xc23a2e);
    game.cars.push(car);
    for (let i = 0; i < 3 / STEP; i += 1) game.step(STEP, true);
    return 'play';
  }
  return 'title';
}
