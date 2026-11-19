// Solmar City — tuning constants. One job: every number the rest of the
// game balances against lives here, so a tweak never means hunting code.
export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-city-save-v1';
export const SAVE_VERSION = 1; // bump when the save shape changes

// Camera orbit limits (shared by the orbit controls and the shot staging).
export const CAMERA = { minDist: 6, maxDist: 16, minPitch: 0.08, maxPitch: 1.1 };

// City grid: 10 x 10 blocks, roads between them, beach + ocean on the east edge.
export const BLOCK = 40;
export const ROAD = 12;
export const PITCH = BLOCK + ROAD; // 52
export const GRID = 10;
export const CITY_HALF = (GRID * BLOCK + (GRID + 1) * ROAD) / 2; // 266
export const BEACH_X = CITY_HALF; // sand starts here
export const OCEAN_X = CITY_HALF + 46;

// Road centre lines, west to east / north to south.
export function roadCentres() {
  const centres = [];
  for (let i = 0; i <= GRID; i += 1) centres.push(-CITY_HALF + ROAD / 2 + i * PITCH);
  return centres;
}
export const ROADS = roadCentres();

// Player on foot.
export const PLAYER = {
  walkSpeed: 5.2,
  runSpeed: 9.0,
  accel: 42,
  radius: 0.55,
  maxHealth: 100,
  regenPerSec: 2.5,
  regenDelay: 5,
  punchRange: 2.1,
  punchDamage: 22,
  punchCooldown: 0.45,
  shootCooldown: 0.28,
  shootRange: 42,
  shootDamage: 34,
};

// Cars.
export const CAR = {
  maxSpeed: 34,
  maxReverse: 10,
  accel: 16,
  brake: 30,
  drag: 0.55,
  steerMax: 0.55,
  steerSpeed: 2.6,
  handbrakeGrip: 0.35,
  length: 4.4,
  width: 2.0,
  trafficCount: 10,
  parkedCount: 12,
};

// Pedestrians and police.
export const PED = { count: 24, walkSpeed: 1.6, fleeSpeed: 4.2, radius: 0.5 };
export const POLICE = {
  footChaseSpeed: 6.4,
  punchDamage: 6,
  punchCooldown: 0.9,
  holdSeconds: 2,
  carChaseSpeed: 30,
  ramDamage: 8,
};

// Wanted.
export const WANTED = {
  maxStars: 5,
  decayQuietSeconds: 20,
  decayStepSeconds: 3,
  copSightRange: 30,
};

// Missions.
export const MISSIONS = [
  { id: 1, name: 'First Wheels', reward: 300, timer: 0 },
  { id: 2, name: 'Pizza Rush', reward: 500, timer: 100 },
  { id: 3, name: 'Lose the Heat', reward: 800, timer: 0 },
  { id: 4, name: 'The Solmar Job', reward: 1500, timer: 0 },
];

export const START_CASH = 120;
export const STATION = { x: -234, z: -234 }; // police station, NW corner
export const HOSPITAL = { x: 234, z: -234 }; // hospital, NE corner
export const GARAGE = { x: -208, z: 208 }; // Mara's garage, SW
export const SAFEHOUSE = { x: 208, z: 208 }; // safehouse, SE
export const BANK = { x: -104, z: -104 }; // Solmar Trust Bank, downtown
export const DOCKS = { x: 300, z: 0 }; // docks on the beach, east edge

export const COLORS = {
  sky: 0x87bfe8,
  sun: 0xffe3b3,
  road: 0x33363d,
  roadLine: 0xf5d76e,
  sidewalk: 0x9a9a92,
  sand: 0xe8d29a,
  ocean: 0x1e6f8e,
  grass: 0x5f9e52,
};
