// Solmar City round 7 — tuning numbers, jobs, weapons, taxi fares, garage.
// The city is a 10x10 block grid; one block pitch is BLOCK + ROAD wide.
export const STEP = 1 / 60;

export const CITY = {
  blocks: 10,
  block: 26,
  road: 12,
  half: 190, // city spans about -190..190; the sea starts west of -190
  seaX: -190,
  beachX: -176,
};

export const DAY = 24 * 3600; // seconds in a full day/night cycle
export const DAY_LENGTH = 480; // real seconds per game day

export const PLAYER = {
  walkSpeed: 7,
  runSpeed: 12,
  radius: 0.7,
  maxHealth: 100,
  punchRange: 2.2,
  punchDamage: 12,
  punchCooldown: 0.45,
  startCash: 250,
  startX: 24,
  startZ: 120,
};

export const WEAPONS = [
  { name: 'Pistol', damage: 34, range: 55, rate: 0.28, spread: 0.012, mag: 12, reload: 1.1, auto: false, ammo: 48 },
  { name: 'SMG', damage: 16, range: 34, rate: 0.085, spread: 0.05, mag: 32, reload: 1.4, auto: true, ammo: 128 },
  { name: 'Shotgun', damage: 16, range: 22, rate: 0.85, spread: 0.11, mag: 6, reload: 2.0, auto: false, pellets: 7, ammo: 24 },
];

export const WANTED = {
  decayQuiet: 0.045, // stars per second while unseen and quiet
  steal: 1,
  hitPed: 1,
  shootPublic: 1,
  copDown: 2,
  max: 5,
};

export const TRAFFIC_CARS = 14;
export const PARKED_CARS = 14;
export const PEDESTRIANS = 34;
export const BRIEFCASES = 10;
export const STUNT_RAMPS = 3;
export const TAXI_STANDS = 5;

export const BRIEFCASE_REWARD = 250;
export const STUNT_REWARD = 600;
export const BUSTED_LOSS = 0.1; // fraction of cash lost on Busted / Wasted

// Taxi side-jobs: flag a waiting passenger (yellow TAXI marker), drive them
// to the beacon before the meter timer runs out. Fare ticks up with distance.
export const TAXI = {
  baseFare: 40,
  perMetre: 0.55,
  timeLimit: 150,
  tipPerfect: 50, // bonus for arriving with more than half the time left
};

export const GARAGE = {
  repairCost: 100,
  repaintCost: 50,
  underglowCost: 150,
  spoilerCost: 120,
};

// Mara's nine jobs, in order. Job 9 is new in round 7: the Harbor Heist.
export const JOBS = [
  {
    id: 1, name: 'First Errand', payout: 500, timeLimit: 150,
    intro: "Mara: pick up my package on the pier before the timer runs out. Don't keep me waiting.",
    done: 'Package delivered. Mara trusts you now. +$500',
    objectives: [{ type: 'pickup', label: 'Pick up the package on the pier', x: -196, z: 62, radius: 3.5 }],
  },
  {
    id: 2, name: 'Getaway Driver', payout: 800, timeLimit: 240,
    intro: 'Mara: steal a car, then lose the tail and bring it to the hideout.',
    done: 'Clean getaway. The hideout crew is impressed. +$800',
    objectives: [
      { type: 'enterCar', label: 'Steal a car (walk up and press E)', radius: 4 },
      { type: 'loseHeat', label: 'Lose the tail (break line of sight)', wanted: 2 },
      { type: 'goto', label: 'Drive to the hideout', x: 150, z: -150, radius: 7 },
    ],
  },
  {
    id: 3, name: 'Bank Job', payout: 2000, timeLimit: 300,
    intro: 'Mara: hold the lobby of the First Solmar Bank, then run to the safe house.',
    done: 'The bank job paid off. +$2,000',
    objectives: [
      { type: 'hold', label: 'Hold the bank lobby', x: 60, z: -24, radius: 9, hold: 10 },
      { type: 'goto', label: 'Escape the three-star response to the safe house', x: -120, z: 150, radius: 8, wanted: 3 },
    ],
  },
  {
    id: 4, name: 'Boat Chase', payout: 1500, timeLimit: 240,
    intro: 'Mara: take a speedboat from the marina and run down the smuggler off the coast.',
    done: 'Smuggler caught, cargo seized. +$1,500',
    objectives: [
      { type: 'enterBoat', label: 'Board the speedboat at the marina', x: -200, z: -40, radius: 5 },
      { type: 'chase', label: 'Run down the smuggler boat', radius: 14 },
    ],
  },
  {
    id: 5, name: 'Night Run', payout: 1200, timeLimit: 300,
    intro: 'Mara: a cross-city delivery after dark. Keep it quiet.',
    done: 'Night delivery made, no questions asked. +$1,200',
    objectives: [
      { type: 'pickup', label: 'Collect the night parcel at the stadium', x: -150, z: -120, radius: 4 },
      { type: 'goto', label: 'Deliver it to the north docks', x: 24, z: -168, radius: 7 },
    ],
  },
  {
    id: 6, name: 'Stunt Jump', payout: 1000, timeLimit: 180,
    intro: 'Mara: clear the broken pier ramp and land it clean for the cameras.',
    done: 'The cameras loved it. +$1,000',
    objectives: [{ type: 'jump', label: 'Hit the pier ramp at speed and land the jump', x: -196, z: 96, radius: 10 }],
  },
  {
    id: 7, name: 'Rooftop Heist', payout: 3000, timeLimit: 300,
    intro: 'Mara: grab the briefcase on the Solmar Tower roof while the helicopter hunts you.',
    done: 'Rooftop briefcase secured. +$3,000',
    objectives: [
      { type: 'lift', label: 'Take the lift up Solmar Tower (stand on the pad, press E)', x: 12, z: 12, radius: 4 },
      { type: 'pickup', label: 'Grab the briefcase on the roof', x: 12, z: 12, y: 96, radius: 4 },
      { type: 'goto', label: 'Get back down and reach the hideout', x: 150, z: -150, radius: 8, wanted: 4 },
    ],
  },
  {
    id: 8, name: 'The Big Score', payout: 10000, timeLimit: 420,
    intro: 'Mara: hit the Grand Solmar vault and bring the money home through the roadblocks.',
    done: 'The Big Score is yours. +$10,000',
    objectives: [
      { type: 'hold', label: 'Crack the Grand Solmar vault', x: -60, z: 132, radius: 9, hold: 12 },
      { type: 'goto', label: 'Bring the money home through the roadblocks', x: 150, z: -150, radius: 8, wanted: 5 },
    ],
  },
  {
    id: 9, name: 'Harbor Heist', payout: 6000, timeLimit: 420,
    intro: 'Mara: one last job — grab the harbor shipment, hold the warehouse, and bring it home through the rain.',
    done: 'Harbor Heist complete. Solmar City is yours. +$6,000',
    objectives: [
      { type: 'pickup', label: 'Grab the harbor shipment at the north docks', x: 24, z: -168, radius: 4 },
      { type: 'hold', label: 'Hold the warehouse while the crew loads up', x: 60, z: -150, radius: 9, hold: 12 },
      { type: 'goto', label: 'Bring the shipment home to the hideout', x: 150, z: -150, radius: 8, wanted: 4 },
    ],
  },
];

export const PALETTE = {
  skyDawn: 0xff9a7a,
  skyNoon: 0x87b5e0,
  skyDusk: 0xff8c4a,
  skyNight: 0x0b1026,
  sunNoon: 0xfff2d8,
  sunDusk: 0xffb36b,
  ground: 0x2b2f36,
  road: 0x23262c,
  roadWet: 0x1e222c,
  sidewalk: 0x3a3f47,
  sand: 0xc2a878,
  sea: 0x1d4e6b,
  building: [0x8a7f72, 0x6f7d8c, 0x9c8a6a, 0x7a6a72, 0x5f6e5a, 0x8c6f5a, 0x707a80, 0x9a8f7d, 0x646e7a, 0x7d7468, 0x55606e, 0xa08a70],
  neon: [0xff2d78, 0x00e5ff, 0xffd23f, 0x7c4dff, 0x39ff88],
  car: [0xc23b2e, 0x2e6fc2, 0xe0a92e, 0x3aa655, 0xdddddd, 0x222226, 0x7a4fd0, 0xd06a2e, 0x12b5a5, 0xe06ab0],
  taxiYellow: 0xf7c948,
};

export const SAVE_KEY = 'solmar-city.save.v1';

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
