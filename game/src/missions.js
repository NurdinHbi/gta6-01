// Mara's jobs: the eight-mission state machine. Each mission type is a small
// stage machine (go there, steal then drive, hold the zone, chase the boat,
// clear the jump, grab then escape). The world owns positions and police; this
// file owns timers, stages, payouts and the beacon. main.js routes world
// events here (landings, steals) and asks for the current objective each frame.

import { LANDMARKS, MISSIONS } from './config.js';

function dist2(ax, az, bx, bz) { const dx = ax - bx; const dz = az - bz; return dx * dx + dz * dz; }

export function createMissions(world, audio, say) {
  const W = world;
  let stage = 'idle';
  let timeLeft = 0;
  let holdProgress = 0;
  let chaseProgress = 0;
  let lastObjective = '';

  function current() {
    return W.state.missionIndex < MISSIONS.length ? MISSIONS[W.state.missionIndex] : null;
  }
  function isDone() { return W.state.missionIndex >= MISSIONS.length; }

  function start() {
    const m = current();
    if (!m) {
      W.state.freeRoam = true;
      W.setBeacon(0, 0, false);
      W.setZone(0, 0, false);
      W.setLandZone(0, 0, false);
      stage = 'free';
      return;
    }
    stage = m.type === 'steal' ? 'steal' : m.type === 'boat' ? 'toDock' : m.type === 'stunt' ? 'drive' : m.type === 'escape' ? 'grab' : 'toTarget';
    timeLeft = m.timeLimit;
    holdProgress = 0;
    chaseProgress = 0;
    if (m.forceNight) W.setTimeOfDay(21.5);
    if (m.type === 'stunt') {
      W.setLandZone(m.landZone.x, m.landZone.z, true);
      W.landZoneActive = true;
      W.landZonePos = { x: m.landZone.x, z: m.landZone.z };
    } else {
      W.setLandZone(0, 0, false);
      W.landZoneActive = false;
    }
    if (m.type === 'boat') {
      W.targetBoat.active = false;
      W.targetBoat.mesh.visible = false;
    }
    updateBeacon();
    say(`Mara — Job ${m.id}: ${m.title}. ${m.brief}`);
    audio.jingle();
  }

  function updateBeacon() {
    const m = current();
    if (!m) { W.setBeacon(0, 0, false); return; }
    if (stage === 'steal') { W.setBeacon(0, 0, false); return; }
    if (stage === 'toDock') W.setBeacon(m.target.x, m.target.z, true);
    else if (stage === 'chase') W.setBeacon(W.targetBoat.x, W.targetBoat.z, true);
    else if (stage === 'drive' && m.type === 'stunt') W.setBeacon(m.target.x, m.target.z, true);
    else if (stage === 'escape') W.setBeacon(m.escape.x, m.escape.z, true);
    else W.setBeacon(m.target.x, m.target.z, true);
  }

  function objectiveText() {
    const m = current();
    if (!m) return { title: 'Free Roam', brief: 'All eight jobs done. Solmar is yours — collect briefcases, hit the ramps, or just drive.', hint: '', progress: 0 };
    let brief = m.brief;
    let progress = 0;
    if (stage === 'steal') brief = 'Steal a parked car — walk up to one and press E.';
    else if (stage === 'hold') { brief = 'Hold the zone — stay inside the glowing circle!'; progress = holdProgress / m.holdSeconds; }
    else if (stage === 'chase') { brief = 'Stay on the smuggler’s boat!'; progress = chaseProgress / m.chaseSeconds; }
    else if (stage === 'escape') brief = 'Escape to the beacon — lose the heat on the way.';
    else if (stage === 'toDock') brief = 'Get to the marina dock and board the speedboat (E).';
    else if (stage === 'drive' && m.type === 'stunt') brief = 'Steal a car and hit the pier ramp at full speed.';
    else if (stage === 'grab') brief = 'Grab the briefcase on the tower terrace.';
    return { title: `Job ${m.id}: ${m.title}`, brief, hint: m.hint, progress, timeLeft };
  }

  function complete() {
    const m = current();
    if (!m) return;
    W.state.cash += m.pay;
    W.state.missionsDone += 1;
    W.state.missionIndex += 1;
    W.setBeacon(0, 0, false);
    W.setZone(0, 0, false);
    W.setLandZone(0, 0, false);
    W.landZoneActive = false;
    W.targetBoat.active = false;
    W.targetBoat.mesh.visible = false;
    say(`Job done — ${m.title}. Mara paid $${m.pay}.`);
    audio.jingle();
    if (W.state.missionIndex >= MISSIONS.length) {
      W.state.freeRoam = true;
      W.state.cash += 2000;
      say('All eight jobs done. Mara wired a $2,000 bonus — free roam unlocked.');
      stage = 'free';
    } else {
      start();
    }
  }

  function fail(reason) {
    const m = current();
    if (!m) return;
    say(`${reason} Mara gives you another shot at ${m.title}.`);
    audio.fail();
    W.setZone(0, 0, false);
    if (m.type === 'boat') { W.targetBoat.active = false; W.targetBoat.mesh.visible = false; }
    start();
  }

  function update(dt) {
    const m = current();
    if (!m || stage === 'free' || stage === 'idle') return;
    timeLeft -= dt;
    if (timeLeft <= 0) { fail('Time’s up.'); return; }
    const p = W.player;
    if (stage === 'steal') {
      if (p.vehicle) {
        stage = 'drive';
        if (W.state.wanted < 2) W.setWanted(2);
        say('Now drive it to the hideout — and lose the tail.');
        updateBeacon();
      }
      return;
    }
    if (stage === 'drive') {
      if (m.type === 'stunt') {
        if (p.vehicle && dist2(p.x, p.z, m.target.x, m.target.z) < 100) {
          // The ramp is the target; the landing itself completes it (see onWorldEvent).
        }
        return;
      }
      if (dist2(p.x, p.z, m.target.x, m.target.z) < 36) complete();
      return;
    }
    if (stage === 'toDock') {
      if (p.boat) {
        stage = 'chase';
        W.targetBoat.active = true;
        W.targetBoat.mesh.visible = true;
        W.targetBoat.pathT = 0;
        say('There he is — the red boat. Stay on him!');
        updateBeacon();
      }
      return;
    }
    if (stage === 'chase') {
      updateBeacon();
      const d = Math.hypot(p.x - W.targetBoat.x, p.z - W.targetBoat.z);
      if (d < 20) {
        chaseProgress += dt;
        if (chaseProgress >= m.chaseSeconds) complete();
      } else {
        chaseProgress = Math.max(0, chaseProgress - dt * 0.5);
      }
      return;
    }
    if (stage === 'toTarget') {
      if (m.type === 'hold') {
        W.setZone(m.target.x, m.target.z, true);
        if (dist2(p.x, p.z, m.target.x, m.target.z) < 36) {
          stage = 'hold';
          holdProgress = 0;
          if (m.wantedOnHold) W.setWanted(m.wantedOnHold);
          else W.setWanted(3);
          say('Hold it — stay in the zone!');
        }
        return;
      }
      if (dist2(p.x, p.z, m.target.x, m.target.z) < 36) complete();
      return;
    }
    if (stage === 'hold') {
      if (dist2(p.x, p.z, m.target.x, m.target.z) < 36) {
        holdProgress += dt;
        if (holdProgress >= m.holdSeconds) {
          stage = 'escape';
          W.setZone(0, 0, false);
          say('Got it — now run!');
          updateBeacon();
        }
      } else {
        holdProgress = Math.max(0, holdProgress - dt);
      }
      return;
    }
    if (stage === 'grab') {
      if (dist2(p.x, p.z, m.target.x, m.target.z) < 25) {
        stage = 'escape';
        if (m.wantedOnGrab) W.setWanted(m.wantedOnGrab);
        say('Briefcase grabbed — four stars and a helicopter. Move!');
        updateBeacon();
      }
      return;
    }
    if (stage === 'escape') {
      if (dist2(p.x, p.z, m.escape.x, m.escape.z) < 36) complete();
    }
  }

  function onWorldEvent(e) {
    const m = current();
    if (!m) return;
    if (e.type === 'land' && m.type === 'stunt' && stage === 'drive') {
      if (e.inZone) complete();
      else say('Jump landed outside the zone — hit the ramp again.');
    }
  }

  function resetTo(index) {
    W.state.missionIndex = index;
    start();
  }

  return {
    current, isDone, start, update, onWorldEvent, objectiveText, complete, fail, resetTo,
    get stage() { return stage; },
    get timeLeft() { return timeLeft; },
    get progress() {
      const m = current();
      if (!m) return 0;
      if (stage === 'hold') return holdProgress / m.holdSeconds;
      if (stage === 'chase') return chaseProgress / m.chaseSeconds;
      return 0;
    },
  };
}
