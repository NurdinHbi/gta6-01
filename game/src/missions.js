// Missions and story: four jobs from Mara, the fixer, played in order.
// Each mission has stages with a target point, an objective line, an
// optional timer, and a cash reward. The game object carries `mission`
// and this module advances it; the HUD and minimap read the same state.
import { MISSIONS, GARAGE, SAFEHOUSE, BANK, DOCKS } from './config.js';
import { dist } from './random.js';
import { randomRoadPoint } from './world.js';

export function createMissions() {
  return {
    index: 0, // 0-based into MISSIONS; 4 means the story is complete
    stage: 0,
    timer: 0,
    targets: [], // checkpoint points for the current stage
    targetIndex: 0,
    target: null, // {x, z, label} the beacon/minimap point at
    message: '',
    messageTimer: 0,
    completed: false,
    cashStash: null, // the bank cash pickup, mission 4
  };
}

function setTarget(missions, x, z, label) {
  missions.target = { x, z, label };
}

function startMission(missions, index, rng) {
  missions.index = index;
  missions.stage = 0;
  missions.targetIndex = 0;
  const def = MISSIONS[index];
  missions.timer = def.timer;
  if (index === 0) {
    setTarget(missions, GARAGE.x, GARAGE.z, "Mara's Garage");
    missions.message = 'Mara: "First job, kid. Jack any car and bring it to my garage."';
  } else if (index === 1) {
    missions.targets = [];
    for (let i = 0; i < 3; i += 1) missions.targets.push(randomRoadPoint(rng));
    missions.targetIndex = 0;
    const t = missions.targets[0];
    setTarget(missions, t.x, t.z, 'Pizza Drop 1/3');
    missions.message = 'Mara: "Pizza rush! Three drops, one very hungry city. Go!"';
  } else if (index === 2) {
    missions.message = 'Mara: "Time to make some noise. Get to 3 stars — then vanish."';
    setTarget(missions, 0, 0, 'Cause chaos');
  } else if (index === 3) {
    setTarget(missions, BANK.x, BANK.z, 'Solmar Trust Bank');
    missions.message = 'Mara: "The big one. Hit the bank, grab the cash, lose the heat at the docks."';
  }
  missions.messageTimer = 5;
}

// Objective line for the HUD panel.
export function missionObjective(missions) {
  if (missions.completed) return 'Story complete — Solmar is yours. Free roam!';
  const def = MISSIONS[missions.index];
  if (!def) return 'Free roam';
  if (missions.index === 0) {
    return missions.stage === 0
      ? 'MISSION 1 — First Wheels: steal any car (E)'
      : 'MISSION 1 — First Wheels: deliver the car to the garage';
  }
  if (missions.index === 1) {
    return `MISSION 2 — Pizza Rush: drop ${missions.targetIndex + 1}/3 at the marker`;
  }
  if (missions.index === 2) {
    if (missions.stage === 0) return 'MISSION 3 — Lose the Heat: reach 3 wanted stars';
    if (missions.stage === 1) return 'MISSION 3 — Lose the Heat: lose the cops (0 stars)';
    return 'MISSION 3 — Lose the Heat: reach the safehouse';
  }
  if (missions.index === 3) {
    if (missions.stage === 0) return 'MISSION 4 — The Solmar Job: drive to the bank';
    if (missions.stage === 1) return 'MISSION 4 — The Solmar Job: grab the cash on foot (E)';
    return 'MISSION 4 — The Solmar Job: escape to the docks at 4 stars';
  }
  return def.name;
}

// Advance the mission state one step. `game` is the whole game object:
// player, wanted, rng, audio, and the cash award hook live there.
export function updateMissions(game, dt) {
  const missions = game.missions;
  const player = game.player;
  if (missions.completed) return;
  if (missions.messageTimer > 0) missions.messageTimer -= dt;

  const px = player.inCar ? player.car.x : player.x;
  const pz = player.inCar ? player.car.z : player.z;

  if (missions.index === 0) {
    if (missions.stage === 0 && player.inCar) {
      missions.stage = 1;
      missions.message = 'Mara: "Nice wheels. Now bring it to the garage, south-west."';
      missions.messageTimer = 4;
      game.audio.pickup();
    } else if (missions.stage === 1 && player.inCar) {
      if (dist(px, pz, GARAGE.x, GARAGE.z) < 10) completeMission(game, 'Car delivered. Mara is impressed.');
    }
    return;
  }

  if (missions.index === 1) {
    missions.timer -= dt;
    if (missions.timer <= 0) {
      failMission(game, 'Out of time — the pizzas went cold.');
      return;
    }
    const t = missions.targets[missions.targetIndex];
    if (t && dist(px, pz, t.x, t.z) < 9) {
      missions.targetIndex += 1;
      game.audio.pickup();
      if (missions.targetIndex >= missions.targets.length) {
        completeMission(game, 'All three drops done. Tips were generous.');
      } else {
        const nt = missions.targets[missions.targetIndex];
        setTarget(missions, nt.x, nt.z, `Pizza Drop ${missions.targetIndex + 1}/3`);
        missions.message = `Drop ${missions.targetIndex} done — next one!`;
        missions.messageTimer = 3;
      }
    }
    return;
  }

  if (missions.index === 2) {
    if (missions.stage === 0 && game.wanted.stars >= 3) {
      missions.stage = 1;
      setTarget(missions, SAFEHOUSE.x, SAFEHOUSE.z, 'Safehouse');
      missions.message = 'Mara: "Three stars! Now shake them and get to the safehouse."';
      missions.messageTimer = 4;
      game.audio.sirenBlip();
    } else if (missions.stage === 1 && game.wanted.stars === 0) {
      missions.stage = 2;
      missions.message = 'Mara: "Clean. Now get to the safehouse."';
      missions.messageTimer = 4;
    } else if (missions.stage === 2 && dist(px, pz, SAFEHOUSE.x, SAFEHOUSE.z) < 10) {
      completeMission(game, 'Ghosted the whole department. Mara owes you one.');
    }
    return;
  }

  if (missions.index === 3) {
    if (missions.stage === 0 && dist(px, pz, BANK.x, BANK.z) < 12) {
      missions.stage = 1;
      missions.cashStash = { x: BANK.x + 6, z: BANK.z + 6 };
      missions.message = 'Get out on foot and grab the cash (E near the green bag)!';
      missions.messageTimer = 4;
    } else if (missions.stage === 1) {
      if (missions.cashStash && !player.inCar && dist(player.x, player.z, missions.cashStash.x, missions.cashStash.z) < 3.5) {
        missions.stage = 2;
        missions.cashStash = null;
        setTarget(missions, DOCKS.x, DOCKS.z, 'The Docks');
        game.addWanted(Math.max(0, 4 - game.wanted.stars));
        missions.message = 'ALARM! Four stars — run for the docks!';
        missions.messageTimer = 5;
        game.audio.sirenBlip();
      }
    } else if (missions.stage === 2) {
      // Escape counts when the player reaches the docks with heat still on,
      // or after losing the cops entirely.
      if (dist(px, pz, DOCKS.x, DOCKS.z) < 12) {
        completeMission(game, 'The Solmar Job is done. Legends are born on nights like this.');
      }
    }
  }
}

function completeMission(game, line) {
  const missions = game.missions;
  const def = MISSIONS[missions.index];
  game.player.cash += def.reward;
  game.stats.missionsDone += 1;
  game.stats.cashEarned += def.reward;
  missions.message = `${line} +$${def.reward}`;
  missions.messageTimer = 6;
  game.audio.missionJingle();
  missions.index += 1;
  if (missions.index >= MISSIONS.length) {
    missions.completed = true;
    missions.target = null;
    missions.message = 'STORY COMPLETE — Solmar City is yours. Free roam, kid.';
    missions.messageTimer = 8;
    return;
  }
  startMission(missions, missions.index, game.rng);
}

function failMission(game, line) {
  const missions = game.missions;
  missions.message = `${line} Mission failed — try again.`;
  missions.messageTimer = 5;
  game.audio.failSting();
  // Restart the same mission from its beginning.
  startMission(missions, missions.index, game.rng);
}

// Begin mission 1 when a new game starts.
export function beginStory(missions, rng) {
  startMission(missions, 0, rng);
}

// Restart a saved mission from its beginning (used by Continue).
export function startMissionAt(missions, index, rng) {
  startMission(missions, index, rng);
}
