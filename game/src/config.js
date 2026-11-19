// Solmar City — every tuning number and colour in one place.
// The city is a grid of streets; blocks sit between them. All distances are metres,
// all speeds are metres per second, all money is dollars.

export const STEP = 1 / 60;

export const CITY = {
  pitch: 58,          // street centre to street centre
  streets: 11,        // street lines each way, indices -5..5
  roadHalf: 7,         // half the road width
  halfExtent: 290,     // city edge in x and in z (north side)
  beachStart: 290,     // sand begins here (south)
  waterStart: 384,     // ocean begins here
  worldSouth: 560,     // far edge of the water plane
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10.5,
  accel: 42,
  radius: 0.55,
  height: 1.8,
  health: 100,
  jumpSpeed: 7,
  punchRange: 2.1,
  punchDamage: 12,
  punchCooldown: 0.45,
  pistolDamage: 26,
  pistolRange: 55,
  pistolCooldown: 0.32,
  pistolAmmo: Infinity,
};

export const CAR = {
  accel: 16,
  brake: 26,
  reverseMax: 9,
  topSpeed: 34,
  steerMax: 0.55,
  grip: 6.5,
  health: 100,
  length: 4.4,
  width: 2.0,
};

export const TRAFFIC_COUNT = 10;
export const PARKED_COUNT = 12;
export const PED_COUNT = 24;

export const WANTED = {
  max: 5,
  decaySeconds: 26,      // quiet seconds before one star fades
  copCatchSeconds: 1.6,  // a foot cop this close, this long, means Busted
  copCatchRange: 1.6,
  copSpeed: 7.2,
  policeCarSpeed: 30,
  policeCarRamDamage: 9,
};

// Cash lost when Busted or Wasted, as a share of what the player carries.
export const BUST_PENALTY = 0.10;

export const MISSIONS = [
  {
    id: 'wheels',
    name: 'First Wheels',
    giver: 'Mara',
    brief: 'Mara needs wheels. Steal any parked car, then bring it to the blue garage beacon.',
    reward: 300,
    timeLimit: 150,
  },
  {
    id: 'pizza',
    name: 'Pizza Rush',
    giver: 'Mara',
    brief: 'Three pizza boxes are waiting across town. Grab all three, then deliver them to the diner.',
    reward: 500,
    timeLimit: 210,
  },
  {
    id: 'heat',
    name: 'Lose the Heat',
    giver: 'Mara',
    brief: 'The crew tripped an alarm. You are at 3 stars. Stay free for 75 seconds, then reach the hideout.',
    reward: 800,
    timeLimit: 180,
  },
  {
    id: 'job',
    name: 'The Solmar Job',
    giver: 'Mara',
    brief: 'Hit the Solmar Bank vault, grab the cash, then lose the cops and reach the hideout.',
    reward: 1500,
    timeLimit: 320,
  },
];

export const SAVE_KEY = 'solmar-city.save.v1';

export const PALETTE = {
  sky: 0x8ec9ee,
  fog: 0xcfe8f5,
  sun: 0xfff2d8,
  asphalt: 0x3a3f46,
  asphaltLine: 0xd8d3c0,
  sidewalk: 0x9a938a,
  sand: 0xe8d29a,
  water: 0x2e7fa8,
  grass: 0x7fae62,
  building: [0xe8b48a, 0xd99a6c, 0xc7d3de, 0xf2e3c6, 0xb8c4a8, 0xe0a080, 0x9fb6c9, 0xd9c1a3],
  glass: 0x2c4a63,
  roof: 0x6b5d4f,
  palmTrunk: 0x8a6b48,
  palmLeaf: 0x3f8f4f,
  lamp: 0x2e3138,
  carPaint: [0xc0392b, 0x2471a3, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1, 0x1a1a1a, 0x16a085, 0xd35400],
  taxi: 0xf7c948,
  police: 0xf5f6fa,
  playerShirt: 0x2e86de,
  playerSkin: 0xc68642,
  pedShirt: [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xecf0f1],
  copShirt: 0x1c2a4a,
  beacon: 0x35d0ff,
  beaconGold: 0xffc93c,
  markerGreen: 0x2fd47a,
  markerRed: 0xff4d4d,
};

export const DAY_START_MINUTES = 9 * 60 + 24; // 09:24, golden morning
