// Mara's eight jobs: a small state machine that walks each job's objectives
// in order. The world owns the simulation; this module reads the world state,
// sets beacons and wanted levels, pays out on completion and restarts a job
// when its timer runs out.
import { JOBS, BRIEFCASE_REWARD, STUNT_REWARD } from './config.js';
import { ACTION_ENTER } from './input.js';

function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function createMissions(game) {
  const { state, player, world } = game;
  let jobIndex = 0; // 0-based into JOBS
  let objIndex = 0;
  let timer = 0;
  let holdTime = 0;
  let started = false;
  let objectiveStarted = false;

  function currentJob() {
    return JOBS[jobIndex] || null;
  }

  function currentObjective() {
    const job = currentJob();
    return job ? job.objectives[objIndex] : null;
  }

  function setObjectiveBeacon(obj) {
    if (!obj) {
      game.clearBeacon();
      return;
    }
    if (obj.type === 'chase') {
      // The smuggler boat moves; its marker is drawn live on the minimap.
      game.clearBeacon();
      return;
    }
    if (obj.type === 'enterCar' || obj.type === 'loseHeat' || obj.type === 'enterBoat') {
      game.clearBeacon();
      return;
    }
    game.setBeacon(obj.x, obj.y || 0, obj.z, obj.type === 'pickup' ? 0xffd23f : 0x00e5ff);
  }

  function beginObjective() {
    const obj = currentObjective();
    objectiveStarted = true;
    holdTime = 0;
    setObjectiveBeacon(obj);
    if (!obj) return;
    if (obj.type === 'hold' && obj.wanted) game.setWanted(obj.wanted);
    if (obj.type === 'goto' && obj.wanted) game.setWanted(obj.wanted);
    if (obj.type === 'lift') game.state.liftPadActive = true;
    if (obj.type === 'pickup' && currentJob().id === 7) game.setWanted(4);
    if (obj.type === 'jump') game.msg('Hit the ramp at full speed — over 60 km/h!');
    if (obj.type === 'chase') game.msg('The smuggler is running for open water. Catch him!');
  }

  function beginJob() {
    const job = currentJob();
    if (!job) return;
    objIndex = 0;
    timer = job.timeLimit;
    started = true;
    objectiveStarted = false;
    game.msg(`JOB ${job.id}/8 — ${job.name}: ${job.intro}`);
    if (job.id === 5) {
      // Night Run happens after dark.
      game.state.timeSec = 21.5 * 3600;
      game.msg('Night falls over Solmar City.');
    }
    beginObjective();
  }

  function completeObjective() {
    const job = currentJob();
    objIndex += 1;
    objectiveStarted = false;
    game.state.liftPadActive = false;
    if (objIndex >= job.objectives.length) completeJob();
    else beginObjective();
  }

  function completeJob() {
    const job = currentJob();
    game.addCash(job.payout);
    game.state.jobsDone += 1;
    game.msg(`${job.done}`);
    game.audio.jingle();
    game.clearBeacon();
    jobIndex += 1;
    if (jobIndex >= JOBS.length) {
      game.state.freeRoam = true;
      game.addCash(5000);
      game.msg('ALL EIGHT JOBS DONE — free roam unlocked. Bonus +$5,000. Solmar City is yours.');
      game.saveProgress();
      return;
    }
    beginJob();
    game.saveProgress();
  }

  function failJob() {
    const job = currentJob();
    game.msg(`Time ran out on ${job.name}. Mara gives you another shot — the job restarts.`);
    game.setWanted(0);
    beginJob();
  }

  function update(dt, events, actions) {
    const job = currentJob();
    if (!job) return; // all jobs done: free roam
    if (!started) {
      beginJob();
      return;
    }
    timer -= dt;
    if (timer <= 0) {
      failJob();
      return;
    }
    const obj = currentObjective();
    if (!obj) return;
    const px = player.x;
    const pz = player.z;
    const py = game.state.playerY || 0;

    // Stunt ramps pay $600 for a clean landing even outside the job.
    for (const e of events) {
      if (e.type === 'jumpLand' && e.speed > 17 && e.airTime > 0.7) {
        const r = game.world.ramps.find((ramp) => dist2d(e.x, e.z, ramp.x, ramp.z) < 60);
        if (r && !r.used) {
          r.used = true;
          game.addCash(STUNT_REWARD);
          game.msg(`Stunt ramp cleared! +$${STUNT_REWARD}`);
          game.audio.pickup();
        }
        if (obj.type === 'jump') completeObjective();
      }
      if (e.type === 'liftUp' && obj.type === 'lift') completeObjective();
      if (e.type === 'boatBoard' && obj.type === 'enterBoat') completeObjective();
    }

    switch (obj.type) {
      case 'pickup': {
        const dy = Math.abs((obj.y || 0) - py);
        if (dist2d(px, pz, obj.x, obj.z) < obj.radius && dy < 5) {
          game.audio.pickup();
          completeObjective();
        }
        break;
      }
      case 'goto': {
        if (dist2d(px, pz, obj.x, obj.z) < obj.radius) completeObjective();
        break;
      }
      case 'enterCar': {
        if (game.state.driving) {
          completeObjective();
          game.setWanted(2);
          game.msg('Two stars on you — lose the tail, then get to the hideout.');
        }
        break;
      }
      case 'loseHeat': {
        if (game.state.wanted <= 0) completeObjective();
        break;
      }
      case 'hold': {
        if (dist2d(px, pz, obj.x, obj.z) < obj.radius) {
          holdTime += dt;
          if (holdTime >= (obj.hold || 8)) completeObjective();
        } else holdTime = 0;
        break;
      }
      case 'enterBoat': {
        // Completed via the boatBoard event above.
        break;
      }
      case 'chase': {
        if (game.state.inBoat && (game.state.smugglerDist || 999) < obj.radius) {
          game.msg('You ran the smuggler down!');
          completeObjective();
        }
        break;
      }
      case 'jump': {
        // Completed via the jumpLand event above.
        break;
      }
      case 'lift': {
        // Completed via the liftUp event above.
        break;
      }
      default:
        break;
    }
  }

  function objectiveLabel() {
    const job = currentJob();
    if (!job) return 'Free roam — Solmar City is yours.';
    const obj = currentObjective();
    let label = `Job ${job.id}/8 — ${job.name}: ${obj ? obj.label : ''}`;
    if (obj && obj.type === 'hold') {
      label += ` (${Math.max(0, obj.hold - holdTime).toFixed(0)}s)`;
    }
    return label;
  }

  function timerLeft() {
    return Math.max(0, timer);
  }

  return {
    update,
    objectiveLabel,
    timerLeft,
    currentJob,
    currentObjective,
    get jobIndex() {
      return jobIndex;
    },
    set jobIndex(v) {
      jobIndex = v;
      started = false;
      objectiveStarted = false;
    },
    beginJob,
    get started() {
      return started;
    },
  };
}
