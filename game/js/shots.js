// Solmar City — screenshot scenes behind ?shot=start|drive|chase|night.
// Each one plays the real rules forward from a fresh seeded world with a
// simple autopilot, so the frame is what a short game really looks like and
// the same seed always gives the same frame. Authored fresh for round 4.
import { dist2d } from './util.js';

const STEP = 1 / 30;

// Drive straight down the avenue, steering back toward the street line we
// are on: aim at a point 30 m ahead on that line and turn toward it.
function driveInput(G) {
  const car = G.currentCar || G.playerBoat;
  if (!car) return { forward: false, back: false, left: false, right: false, handbrake: false };
  if (G.currentCar) {
    const streets = G.city.streetX;
    let nearest = streets[0];
    for (const s of streets) if (Math.abs(s - car.x) < Math.abs(nearest - car.x)) nearest = s;
    const tx = nearest;
    const tz = car.z + Math.cos(car.angle) * 30;
    const want = Math.atan2(tx - car.x, tz - car.z);
    let d = (want - car.angle) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return { forward: true, back: false, left: d < -0.06, right: d > 0.06, handbrake: false };
  }
  return { forward: true, back: false, left: false, right: false, handbrake: false };
}

// Steer the boat toward the target boat.
function boatInput(G) {
  const boat = G.playerBoat;
  const target = G.targetBoat;
  if (!boat || !target) return { forward: true, back: false, left: false, right: false, handbrake: false };
  const want = Math.atan2(target.x - boat.x, target.z - boat.z);
  let d = (want - boat.angle) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return { forward: true, back: false, left: d < -0.1, right: d > 0.1, handbrake: false };
}

// Set `G` to the named scene and return which screen to draw over it.
export function stageShot(G, name) {
  G.resetWorld(1);
  if (name === 'drive') {
    G.setTimeOfDay(17.4); // golden hour
    const car = G.parkedCars[0];
    G.teleportPlayer(car.x + 2, car.z + 2);
    G.enterCar(car);
    G.simulate(7, () => driveInput(G));
    G.setShotCamera(null); // chase camera follows the car
    return { screen: 'play' };
  }
  if (name === 'chase') {
    G.setTimeOfDay(17.6); // golden hour chase
    const car = G.parkedCars[1] || G.parkedCars[0];
    G.teleportPlayer(car.x + 2, car.z + 2);
    G.enterCar(car);
    G.setWanted(3);
    G.spawnPoliceNear(2);
    // pull the pursuit right onto the player's tail so the frame shows it
    for (let i = 0; i < G.policeCars.length; i += 1) {
      const pc = G.policeCars[i];
      const back = 20 + i * 9;
      const side = i === 0 ? -4 : 4;
      const fx = Math.sin(car.angle);
      const fz = Math.cos(car.angle);
      pc.x = car.x - fx * back - fz * side;
      pc.z = car.z - fz * back + fx * side;
      pc.angle = car.angle;
      pc.speed = 26;
      pc.mesh.position.set(pc.x, 0, pc.z);
      pc.mesh.rotation.y = pc.angle;
    }
    G.simulate(4.5, () => driveInput(G));
    G.setShotCamMode('chase'); // camera rides ahead of the car, looking back at the pursuit
    return { screen: 'play' };
  }
  if (name === 'night') {
    G.setTimeOfDay(21.6); // night, lighthouse beam up
    G.startMission(5); // Boat Chase
    const m = G.city.landmarks.marina;
    G.teleportPlayer(m.x - 4, m.z);
    // stand on the dock a moment so the "get to the marina" step completes
    // before boarding — otherwise the boat sails away from its own marker
    G.simulate(1, () => ({ forward: false, back: false, left: false, right: false, handbrake: false }));
    G.boardNearestBoat();
    G.simulate(9, () => boatInput(G));
    G.setShotCamMode('chase');
    return { screen: 'play' };
  }
  // start: title screen over a golden-hour view of the city and the beach
  G.setTimeOfDay(17.2);
  const L = G.city.landmarks;
  G.teleportPlayer(L.plaza.x + 6, L.plaza.z + 6);
  G.simulate(2, () => ({ forward: false, back: false, left: false, right: false, handbrake: false }));
  G.setShotCamera({
    pos: { x: L.plaza.x - 70, y: 55, z: L.plaza.z + 95 },
    look: { x: L.tower.x, y: 30, z: L.tower.z },
  });
  return { screen: 'title' };
}
