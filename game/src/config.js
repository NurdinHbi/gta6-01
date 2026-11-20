// Solmar City — every tuning number, landmark and job in one place.
// The city is a flat grid in world units: x east, z south. Roads run every
// 60 units; the beach and the sea are the south edge (z past 250).

export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-city.save.v1';
export const WORLD = { half: 300, beachZ: 250, seaZ: 292, roadStep: 60 };

export const PLAYER = {
  walkSpeed: 7,
  runSpeed: 12,
  radius: 0.9,
  health: 100,
  punchDamage: 25,
  punchRange: 2.4,
  punchCooldown: 0.45,
};

export const WEAPONS = [
  { name: 'Pistol', key: '1', damage: 34, range: 55, rate: 0.28, spread: 0.012, mag: 12, reload: 1.1, auto: false, kick: 0.35, color: 0x2b2f36 },
  { name: 'SMG', key: '2', damage: 16, range: 42, rate: 0.09, spread: 0.05, mag: 32, reload: 1.4, auto: true, kick: 0.22, color: 0x3a3f4a },
  { name: 'Shotgun', key: '3', damage: 14, range: 26, rate: 0.85, spread: 0.11, mag: 6, reload: 1.8, auto: false, pellets: 7, kick: 0.9, color: 0x6b4a2a },
];

export const CAR = {
  accel: 22,
  brake: 34,
  reverseMax: 12,
  maxSpeed: 46,
  steer: 0.55,
  grip: 6.5,
  radius: 2.2,
  enterRange: 4.5,
};

export const WANTED = {
  stealCar: 1,
  hitPedestrian: 1,
  shootPublic: 1,
  killCop: 2,
  killPedestrian: 1,
  decaySeconds: 26,
  max: 5,
};

export const PALETTE = {
  skyDawn: 0xff9a6b,
  skyNoon: 0x7ec8f2,
  skyGolden: 0xffb347,
  skyDusk: 0x3a2b5e,
  skyNight: 0x0b1026,
  sunNoon: 0xfff2d8,
  sunGolden: 0xff9a3c,
  moon: 0x8fa8ff,
  road: 0x2e3138,
  roadLine: 0xd8d8c8,
  sidewalk: 0x8d8d84,
  sand: 0xe8cf9a,
  sea: 0x1d6f8f,
  seaDeep: 0x0d4a68,
  grass: 0x4f8f4a,
  building: [0xb8a88f, 0x9fb4c4, 0xc4a484, 0x8fa3b8, 0xd8c8a8, 0xa8b8a8, 0xc4b49a, 0x7f9fb8],
  windowLit: 0xffd27a,
  windowDark: 0x2a3542,
  neonPink: 0xff4fa3,
  neonCyan: 0x35e0ff,
  neonGold: 0xffc93c,
  palmTrunk: 0x7a5a38,
  palmLeaf: 0x2f8f4a,
  copBlue: 0x1c4fd8,
  copWhite: 0xf2f2f2,
  taxiYellow: 0xffc93c,
};

// Landmarks: every mission, beacon and the minimap read these same spots.
export const LANDMARKS = {
  spawn: { x: 0, z: 196 },
  pier: { x: 0, z: 268 },
  pierEnd: { x: 0, z: 330 },
  marina: { x: -216, z: 300 },
  marinaDock: { x: -204, z: 296 },
  tower: { x: -60, z: -60 },
  towerRoof: { x: -60, z: -42 },
  bank: { x: -120, z: 60 },
  bankLobby: { x: -120, z: 48 },
  casino: { x: 60, z: 180 },
  casinoVault: { x: 60, z: 168 },
  stadium: { x: 180, z: -180 },
  lighthouse: { x: 264, z: 296 },
  hospital: { x: -180, z: -120 },
  precinct: { x: 120, z: -60 },
  hideout: { x: -240, z: 228 },
  marasPlace: { x: 240, z: 228 },
  safehouse: { x: -228, z: -228 },
  rampPier: { x: 24, z: 252 },
  rampStadium: { x: 150, z: -150 },
  rampBeach: { x: -150, z: 252 },
  smugglerStart: { x: -120, z: 330 },
};

// Mara's eight jobs, in order. type drives the mission state machine:
// goto = reach the marker; steal = steal any car then reach it; hold = stand
// in the zone for holdSeconds; boat = board the speedboat and stay close to
// the smuggler's boat for chaseSeconds; stunt = clear the ramp and land in
// the zone; escape = reach the marker while wanted stays at least wantedMin.
export const MISSIONS = [
  {
    id: 1, title: 'First Errand', type: 'goto',
    brief: 'Mara: "A package is waiting on the pier. Walk it back to me — no, just get it. The timer is real."',
    target: { x: 0, z: 268 }, timeLimit: 150, pay: 500,
    hint: 'Follow the yellow beacon to the pier. Run with Shift.',
  },
  {
    id: 2, title: 'Getaway Driver', type: 'steal',
    brief: 'Mara: "I need wheels and I need them gone. Take a parked car — any car — and bring it to the hideout. The cops will notice."',
    target: { x: -240, z: 228 }, timeLimit: 180, pay: 900, wantedMin: 2,
    hint: 'Press E near a parked car to steal it. Then drive to the hideout beacon.',
  },
  {
    id: 3, title: 'Bank Job', type: 'hold',
    brief: 'Mara: "First Solmar Bank, lobby, ten seconds of nerve. Then run — the whole precinct is coming."',
    target: { x: -120, z: 48 }, holdSeconds: 10, escape: { x: -228, z: -228 }, timeLimit: 240, pay: 2200,
    hint: 'Stand in the glowing lobby zone until the bar fills, then escape to the safe house.',
  },
  {
    id: 4, title: 'Boat Chase', type: 'boat',
    brief: 'Mara: "A smuggler is running the coast in a speedboat. Take my boat from the marina and run him down. Stay on him."',
    target: { x: -204, z: 296 }, chaseTarget: { x: -120, z: 330 }, chaseSeconds: 8, timeLimit: 240, pay: 2600,
    hint: 'Board the boat at the marina dock (E), then chase the red boat along the coast.',
  },
  {
    id: 5, title: 'Night Run', type: 'goto',
    brief: 'Mara: "One delivery, cross-city, after dark. No headlights, no stops. The city is quieter at night — use it."',
    target: { x: 240, z: 228 }, timeLimit: 200, pay: 1500, forceNight: true,
    hint: 'Drive or run to Mara’s place on the east beachfront before dawn.',
  },
  {
    id: 6, title: 'Stunt Jump', type: 'stunt',
    brief: 'Mara: "The crew wants a show. Take the pier ramp at full speed and land it clean. Cameras are rolling."',
    target: { x: 24, z: 252 }, landZone: { x: 24, z: 296 }, timeLimit: 180, pay: 1800,
    hint: 'Steal a car, hit the pier ramp fast, and land inside the glowing zone.',
  },
  {
    id: 7, title: 'Rooftop Heist', type: 'escape',
    brief: 'Mara: "A briefcase on the Solmar Tower terrace. Four stars the moment you touch it, and a helicopter that never blinks."',
    target: { x: -60, z: -42 }, escape: { x: -228, z: -228 }, timeLimit: 260, pay: 3400, wantedOnGrab: 4,
    hint: 'Grab the briefcase on the tower terrace, then lose the helicopter and reach the safe house.',
  },
  {
    id: 8, title: 'The Big Score', type: 'hold',
    brief: 'Mara: "The Grand Solmar vault. Eight seconds inside, then five stars, roadblocks, a helicopter, everything. Bring it home."',
    target: { x: 60, z: 168 }, holdSeconds: 8, escape: { x: 240, z: 228 }, timeLimit: 300, pay: 5000, wantedOnHold: 5,
    hint: 'Hold the vault zone, then escape through the roadblocks to Mara’s place.',
  },
];

// Ten gold briefcases, hidden around the city. Each pays $250 on pickup.
export const COLLECTIBLES = [
  { x: -240, z: 270, note: 'under the west pier boards' },
  { x: 120, z: 270, note: 'behind the beach kiosk' },
  { x: 264, z: 282, note: 'at the lighthouse base' },
  { x: -60, z: -84, note: 'behind Solmar Tower' },
  { x: 180, z: -150, note: 'by the stadium gate' },
  { x: -180, z: -144, note: 'hospital courtyard' },
  { x: 120, z: -84, note: 'precinct steps' },
  { x: -228, z: -204, note: 'safe-house alley' },
  { x: 240, z: 204, note: 'Mara’s garden wall' },
  { x: -204, z: 282, note: 'marina fuel dock' },
];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
