// Mara's nine jobs: a small state machine that walks each job's objectives
// in order. The world owns the simulation; this module reads the world
// state, sets beacons and wanted levels, pays out on completion and restarts
// a job when its timer runs out.
import { JOBS, BRIEFCASE_REWARD, STUNT_REWARD } from './config.js';

function dist2(ax, az, bx, bz) {
  const dx = ax - bx; const dz = az - bz;
  return dx * dx + dz * dz;
}

export function createMissions(game) {
  const { state, player, world } = game;
  const missions = {
    jobIndex: 0,
    objectiveIndex: 0,
    timer: 0,
    holdTime: 0,
    active: false,
    finishedAll: false,

    get job() { return JOBS[this.jobIndex] || null; },
    get objective() {
      const job = this.job;
      return job ? job.objectives[this.objectiveIndex] || null : null;
    },

    beginJob() {
      const job = this.job;
      if (!job) { this.active = false; game.setBeacon(0, 0, 0, false); return; }
      this.objectiveIndex = 0;
      this.timer = job.timeLimit;
      this.holdTime = 0;
      this.active = true;
      game.msg(job.intro);
      this.placeBeacon();
      // Objective-specific setup.
      const obj = this.objective;
      if (obj && obj.type === 'loseHeat') game.setWanted(obj.wanted || 2);
      if (obj && obj.type === 'goto' && obj.wanted) game.setWanted(obj.wanted);
      if (obj && obj.type === 'chase') world.smuggler.active = true;
      if (obj && obj.type === 'lift') game.msg('Take the lift at Solmar Tower (12, 12).');
    },

    placeBeacon() {
      const obj = this.objective;
      if (!obj || !this.active) { game.setBeacon(0, 0, 0, false); return; }
      if (obj.type === 'enterCar' || obj.type === 'loseHeat') {
        game.setBeacon(0, 0, 0, false);
        return;
      }
      if (obj.type === 'chase') {
        game.setBeacon(world.smuggler.x, 0, world.smuggler.z, true);
        return;
      }
      game.setBeacon(obj.x ?? 0, obj.y || 0, obj.z ?? 0, true);
    },

    advance() {
      const job = this.job;
      this.objectiveIndex += 1;
      this.holdTime = 0;
      if (this.objectiveIndex >= job.objectives.length) {
        this.completeJob();
        return;
      }
      const obj = this.objective;
      if (obj.type === 'loseHeat') game.setWanted(obj.wanted || 2);
      if (obj.type === 'goto' && obj.wanted) game.setWanted(obj.wanted);
      if (obj.type === 'chase') world.smuggler.active = true;
      this.placeBeacon();
      game.msg(`Next: ${obj.label}`);
    },

    completeJob() {
      const job = this.job;
      state.cash += job.payout;
      state.jobsDone += 1;
      game.msg(job.done);
      game.audio.cash();
      this.active = false;
      game.setBeacon(0, 0, 0, false);
      game.setWanted(0);
      if (this.jobIndex + 1 >= JOBS.length) {
        this.finishedAll = true;
        state.cash += 5000;
        game.msg('All nine jobs done. Free roam — Solmar City is yours. +$5,000 bonus');
      } else {
        this.jobIndex += 1;
        this.beginJob();
      }
      if (game.saveProgress) game.saveProgress();
    },

    failJob(reason) {
      const job = this.job;
      game.msg(reason || `Time's up — ${job ? job.name : 'the job'} failed. Mara gives you another shot.`);
      game.audio.fail();
      this.beginJob();
    },

    update(dt, events, actions) {
      if (!this.active || !this.job) return;
      this.timer -= dt;
      if (this.timer <= 0) { this.failJob(); return; }
      const obj = this.objective;
      if (!obj) return;

      // Event-driven completions first.
      for (const ev of events || []) {
        if (ev.type === 'smugglerCaught' && obj.type === 'chase') { this.advance(); return; }
        if (ev.type === 'stunt' && obj.type === 'jump') { this.advance(); return; }
      }

      const px = state.driving && state.car ? state.car.x : player.x;
      const pz = state.driving && state.car ? state.car.z : player.z;
      switch (obj.type) {
        case 'pickup': {
          const dy = state.onRoof ? Math.abs(state.playerY - (obj.y || 1)) : 0;
          if (!state.driving && !state.inBoat && dy < 6 && dist2(px, pz, obj.x, obj.z) < obj.radius * obj.radius) {
            this.advance();
          }
          break;
        }
        case 'goto': {
          if (dist2(px, pz, obj.x, obj.z) < obj.radius * obj.radius) this.advance();
          break;
        }
        case 'hold': {
          if (dist2(px, pz, obj.x, obj.z) < obj.radius * obj.radius) {
            this.holdTime += dt;
            if (this.holdTime >= (obj.hold || 10)) this.advance();
          } else {
            this.holdTime = Math.max(0, this.holdTime - dt);
          }
          break;
        }
        case 'enterCar': {
          if (state.driving) this.advance();
          break;
        }
        case 'loseHeat': {
          if (Math.floor(state.wanted) === 0) this.advance();
          break;
        }
        case 'enterBoat': {
          if (state.inBoat) this.advance();
          break;
        }
        case 'chase': {
          // Keep the beacon glued to the fleeing smuggler.
          this.placeBeacon();
          break;
        }
        case 'lift': {
          if (state.onRoof) this.advance();
          break;
        }
        case 'jump': {
          break; // completed by the stunt event
        }
        default:
          break;
      }
    },
  };
  return missions;
}
