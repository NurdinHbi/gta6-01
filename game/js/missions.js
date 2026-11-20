// Solmar City — Mara's story: 8 sequential missions, then repeatable jobs.
// Each mission is a list of steps; the engine runs one step at a time and
// reports completion or failure back to the game. Authored fresh for round 4.
import { dist2d, formatCash } from './util.js';
import { playMissionStart, playMissionComplete, playFail } from './audio.js';

// Step types:
//   goto    reach a point (label shown in the objective panel)
//   hold    stay inside a radius for `duration` seconds
//   tail    shadow a moving target car for `duration` seconds (8-30 m band)
//   escape  reach a point while wanted is 3+ (police already on you)
//   boat    board the boat at the marina, then run the target boat down
//   survive stay alive for `duration` seconds while the city hunts you
export function defineMissions(city) {
  const L = city.landmarks;
  return [
    {
      id: 1, title: 'First Errand', reward: 400, time: 180,
      brief: 'Mara needs a package moved. Pick it up at the plaza fountain, then bring it to the safehouse.',
      steps: [
        { type: 'goto', x: L.plaza.x, z: L.plaza.z, radius: 8, label: 'Pick up the package at the plaza' },
        { type: 'goto', x: L.safehouse.x, z: L.safehouse.z, radius: 8, label: 'Deliver the package to the safehouse' },
      ],
    },
    {
      id: 2, title: 'The Drop', reward: 700, time: 240,
      brief: 'Three drops, one night. Tower, stadium, park — in that order, and don\'t keep Mara waiting.',
      steps: [
        { type: 'goto', x: L.tower.x, z: L.tower.z, radius: 10, label: 'Drop 1: Solmar Tower' },
        { type: 'goto', x: L.stadium.x, z: L.stadium.z, radius: 12, label: 'Drop 2: the arena' },
        { type: 'goto', x: L.park.x, z: L.park.z, radius: 10, label: 'Drop 3: the park' },
      ],
    },
    {
      id: 3, title: 'Tail the Mark', reward: 900, time: 180,
      brief: 'A rival courier is running a route. Follow him — close enough to see, far enough not to be seen.',
      steps: [
        { type: 'tail', duration: 25, label: 'Tail the grey sedan — stay 8 to 30 m back' },
      ],
    },
    {
      id: 4, title: 'Getaway Driver', reward: 1500, time: 240,
      brief: 'Pick up Mara\'s crew at the safehouse, then lose the heat and get them to the pier.',
      steps: [
        { type: 'goto', x: L.safehouse.x, z: L.safehouse.z, radius: 8, label: 'Pick up the crew at the safehouse' },
        { type: 'escape', x: L.pierEnd.x, z: L.pierEnd.z, radius: 10, label: 'Escape to the pier — the cops are coming' },
      ],
    },
    {
      id: 5, title: 'Bank Job', reward: 2500, time: 300,
      brief: 'Walk into the bank, hold the room while the vault opens, then vanish before the sirens find you.',
      steps: [
        { type: 'goto', x: L.bank.x, z: L.bank.z, radius: 10, label: 'Get to the bank' },
        { type: 'hold', x: L.bank.x, z: L.bank.z, radius: 12, duration: 15, label: 'Hold the bank while the vault opens' },
        { type: 'goto', x: L.safehouse.x, z: L.safehouse.z, radius: 8, label: 'Escape to the safehouse' },
      ],
    },
    {
      id: 6, title: 'Boat Chase', reward: 3000, time: 300,
      brief: 'A smuggler is running for open water. Take the boat at the marina and run him down.',
      steps: [
        { type: 'goto', x: L.marina.x, z: L.marina.z, radius: 10, label: 'Get to the marina' },
        { type: 'boat', label: 'Board the boat (E) and catch the smuggler' },
      ],
    },
    {
      id: 7, title: 'The Exchange', reward: 3500, time: 240,
      brief: 'Midnight on the pier. The buyers are nervous and the cops are already circling. Survive the meet.',
      night: true,
      steps: [
        { type: 'goto', x: L.pierEnd.x, z: L.pierEnd.z, radius: 10, label: 'Meet Mara\'s buyer on the pier' },
        { type: 'survive', duration: 25, label: 'Survive the ambush' },
      ],
    },
    {
      id: 8, title: 'Solmar Finale', reward: 6000, time: 420,
      brief: 'The whole city in one night: the bank, the tower, the pier. Pull it off and Mara owes you everything.',
      steps: [
        { type: 'goto', x: L.bank.x, z: L.bank.z, radius: 10, label: 'Finale 1: the bank' },
        { type: 'goto', x: L.tower.x, z: L.tower.z, radius: 10, label: 'Finale 2: Solmar Tower' },
        { type: 'goto', x: L.pierEnd.x, z: L.pierEnd.z, radius: 10, label: 'Finale 3: the pier' },
      ],
    },
  ];
}

export function createMissionEngine(G) {
  const engine = {
    defs: defineMissions(G.city),
    active: null, // { def, stepIndex, timeLeft, holdT, tailT, spottedT, lostT, done }

    currentStep() {
      if (!this.active) return null;
      return this.active.def.steps[this.active.stepIndex] || null;
    },
    currentLabel() {
      const s = this.currentStep();
      if (!s) return 'Free roam — press M for a job';
      return s.label;
    },
    missionTitle() {
      return this.active ? this.active.def.title : 'Free Roam';
    },

    start(index) {
      const def = this.defs[index];
      if (!def) return false;
      this.active = { def, stepIndex: 0, timeLeft: def.time, holdT: 0, tailT: 0, spottedT: 0, lostT: 0 };
      if (def.night) G.setTimeOfDay(21.2);
      if (def.id === 3) G.spawnTailTarget();
      if (def.id === 4) G.setWanted(0); // heat arrives after the pickup
      if (def.id === 6) G.spawnTargetBoat();
      G.notify('Mission: ' + def.title + ' — ' + def.brief);
      playMissionStart();
      return true;
    },

    abort() {
      if (this.active) {
        G.clearTailTarget();
        G.clearTargetBoat();
        this.active = null;
      }
    },

    advance() {
      const a = this.active;
      a.stepIndex += 1;
      a.holdT = 0; a.tailT = 0; a.spottedT = 0; a.lostT = 0;
      const step = this.currentStep();
      if (!step) {
        this.complete();
        return;
      }
      if (step.type === 'escape') G.setWanted(3);
      if (step.type === 'hold') G.setWanted(3);
      if (step.type === 'survive') G.setWanted(4);
      G.notify(step.label);
    },

    complete() {
      const a = this.active;
      G.cash += a.def.reward;
      G.missionsDone += 1;
      G.notify('Mission complete: ' + a.def.title + ' — +' + formatCash(a.def.reward));
      playMissionComplete();
      G.clearTailTarget();
      G.clearTargetBoat();
      this.active = null;
      G.saveGame();
    },

    fail(reason) {
      const a = this.active;
      G.notify('Mission failed: ' + reason + ' — press M to retry ' + (a ? a.def.title : ''));
      playFail();
      G.clearTailTarget();
      G.clearTargetBoat();
      this.active = null;
    },

    update(dt) {
      const a = this.active;
      if (!a) return;
      a.timeLeft -= dt;
      if (a.timeLeft <= 0) { this.fail('time ran out'); return; }
      const step = this.currentStep();
      if (!step) return;
      const pos = G.playerPosition();
      if (step.type === 'goto' || step.type === 'escape') {
        if (dist2d(pos.x, pos.z, step.x, step.z) < step.radius) this.advance();
      } else if (step.type === 'hold') {
        if (dist2d(pos.x, pos.z, step.x, step.z) < step.radius) {
          a.holdT += dt;
          if (a.holdT >= step.duration) this.advance();
        } else {
          a.holdT = Math.max(0, a.holdT - dt * 2);
        }
      } else if (step.type === 'tail') {
        const t = G.tailTarget;
        if (!t) { this.fail('the mark got away'); return; }
        const d = dist2d(pos.x, pos.z, t.x, t.z);
        if (d < 7) {
          a.spottedT += dt;
          if (a.spottedT > 2) { this.fail('you were spotted'); return; }
        } else a.spottedT = 0;
        if (d > 45) {
          a.lostT += dt;
          if (a.lostT > 3) { this.fail('you lost the mark'); return; }
        } else a.lostT = 0;
        if (d >= 7 && d <= 32) a.tailT += dt;
        if (a.tailT >= step.duration) this.advance();
      } else if (step.type === 'boat') {
        if (!G.playerBoat) {
          // still on foot: the marker points at the marina boat
        } else if (G.targetBoat) {
          const d = dist2d(G.playerBoat.x, G.playerBoat.z, G.targetBoat.x, G.targetBoat.z);
          if (d < 18) {
            G.notify('Smuggler caught!');
            this.advance();
          }
        }
      } else if (step.type === 'survive') {
        a.holdT += dt;
        if (a.holdT >= step.duration) this.advance();
      }
    },

    // Where the minimap beacon and the world beacon should point right now.
    beaconTarget() {
      const step = this.currentStep();
      if (!step) return null;
      if (step.type === 'goto' || step.type === 'hold' || step.type === 'escape') {
        return { x: step.x, z: step.z };
      }
      if (step.type === 'tail' && G.tailTarget) return { x: G.tailTarget.x, z: G.tailTarget.z };
      if (step.type === 'boat') {
        if (G.targetBoat && G.playerBoat) return { x: G.targetBoat.x, z: G.targetBoat.z };
        return { x: G.city.landmarks.marina.x, z: G.city.landmarks.marina.z };
      }
      if (step.type === 'survive') return G.playerPosition();
      return null;
    },
  };
  return engine;
}
