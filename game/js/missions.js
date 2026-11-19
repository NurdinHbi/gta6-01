// Story missions for Solmar City: four jobs from the fixer Mara, then free roam.
// Missions are a small state machine driven by main.js's update loop.
const MISSIONS = [
  { id: 1, name: 'First Wheels', reward: 300, time: 150,
    desc: 'Mara needs wheels. Steal the marked car and bring it to the drop-off.' },
  { id: 2, name: 'Pizza Rush', reward: 500, time: 210,
    desc: 'Three pizza deliveries across town. Stand in each beacon to drop off.' },
  { id: 3, name: 'Lose the Heat', reward: 800, time: 240,
    desc: 'The cops are on you — 3 stars. Break line of sight and let the heat die to 0.' },
  { id: 4, name: 'The Solmar Job', reward: 1500, time: 300,
    desc: 'Hit the Solmar Bank, grab the cash, then escape to Mara\'s hideout.' },
];

function createBeacon(scene) {
  const geo = new THREE.CylinderGeometry(2.6, 2.6, 34, 20, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd23e, transparent: true, opacity: 0.22,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pillar = new THREE.Mesh(geo, mat);
  pillar.position.y = 17;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.1, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  const grp = new THREE.Group();
  grp.add(pillar); grp.add(ring);
  grp.visible = false;
  scene.add(grp);
  // Floating gold marker used to tag the mission car in mission 1.
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.7),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }));
  marker.visible = false;
  scene.add(marker);
  return { group: grp, pillar, ring, marker, t: 0 };
}

function setBeacon(beacon, x, z) {
  beacon.group.visible = true;
  beacon.group.position.set(x, 0, z);
}
function hideBeacon(beacon) { beacon.group.visible = false; }
function setMarker(beacon, x, z, y) {
  beacon.marker.visible = true;
  beacon.marker.position.set(x, y, z);
}
function hideMarker(beacon) { beacon.marker.visible = false; }

function updateBeaconVisual(beacon, dt) {
  beacon.t += dt;
  if (beacon.group.visible) {
    beacon.pillar.material.opacity = 0.16 + Math.sin(beacon.t * 3) * 0.07;
    const s = 1 + Math.sin(beacon.t * 3) * 0.08;
    beacon.ring.scale.set(s, s, 1);
  }
  if (beacon.marker.visible) {
    beacon.marker.rotation.y += dt * 2;
    beacon.marker.position.y += Math.sin(beacon.t * 2.5) * 0.15 * dt * 10 * 0.1;
  }
}

// Current mission target point (for the beacon and the minimap), or null.
function missionTarget(G) {
  const m = G.mission;
  if (!m || !m.active) return null;
  if (m.idx === 0) {
    if (m.stage === 0) return G.missionCar ? { x: G.missionCar.x, z: G.missionCar.z } : null;
    return { x: CITY.DROPOFF.x, z: CITY.DROPOFF.z };
  }
  if (m.idx === 1) return CITY.PIZZA_SPOTS[Math.min(m.stage, 2)];
  if (m.idx === 2) return null;
  if (m.idx === 3) {
    if (m.stage === 0) return { x: CITY.BANK.x, z: CITY.BANK.z - 12 };
    return { x: CITY.HIDEOUT.x, z: CITY.HIDEOUT.z };
  }
  return null;
}

function getMissionObjective(G) {
  const m = G.mission;
  if (!m || !m.active) {
    if (G.missionIndex >= MISSIONS.length) return { title: 'Free Roam', text: 'All missions complete. Solmar City is yours — steal, drive, survive.', timer: null };
    return { title: 'Mara\'s Jobs', text: 'Press M to start the next mission: ' + MISSIONS[G.missionIndex].name + ' ($' + MISSIONS[G.missionIndex].reward + ').', timer: null };
  }
  const def = MISSIONS[m.idx];
  let text = def.desc;
  if (m.idx === 0) text = m.stage === 0 ? 'Steal the marked car (gold marker) — press E next to it.' : 'Drive the car to the drop-off beacon.';
  if (m.idx === 1) text = 'Deliver pizza ' + (m.stage + 1) + ' of 3 — stand in the beacon.';
  if (m.idx === 2) text = 'Lose the cops! Wanted level must fall to 0. Stay out of sight.';
  if (m.idx === 3) text = m.stage === 0 ? 'Get to the bank and crack the vault (stand in the beacon).' : 'You have the cash — escape to Mara\'s hideout!';
  return { title: def.name + ' — $' + def.reward, text, timer: Math.max(0, Math.ceil(m.timer)) };
}

function startMission(G) {
  if (G.missionIndex >= MISSIONS.length) { G.toast('All missions complete — free roam!'); return; }
  const idx = G.missionIndex;
  const def = MISSIONS[idx];
  G.mission = { idx, stage: 0, timer: def.time, dwell: 0, active: true };
  if (idx === 2) {
    G.setWanted(3);
    G.toast('Mission: ' + def.name + ' — the heat is on! Lose 3 stars.');
  } else {
    G.toast('Mission started: ' + def.name + ' — ' + def.desc);
  }
  AudioSys.pickup();
  refreshMissionBeacon(G);
}

function refreshMissionBeacon(G) {
  const t = missionTarget(G);
  if (t) setBeacon(G.beacon, t.x, t.z); else hideBeacon(G.beacon);
  if (G.mission && G.mission.idx === 0 && G.mission.stage === 0 && G.missionCar) {
    setMarker(G.beacon, G.missionCar.x, 3.2, G.missionCar.z);
  } else hideMarker(G.beacon);
}

function completeMission(G) {
  const def = MISSIONS[G.mission.idx];
  G.cash += def.reward;
  G.missionIndex++;
  G.mission = { idx: -1, stage: 0, timer: 0, dwell: 0, active: false };
  hideBeacon(G.beacon); hideMarker(G.beacon);
  AudioSys.success();
  if (G.missionIndex >= MISSIONS.length) {
    G.toast('ALL MISSIONS COMPLETE! Mara paid you $' + def.reward + '. Free roam!');
  } else {
    G.toast('Mission complete! +$' + def.reward + '. Next: ' + MISSIONS[G.missionIndex].name + ' (press M).');
  }
  G.save();
}

function failMission(G, reason) {
  AudioSys.fail();
  G.toast('Mission failed: ' + reason + '. Press M to retry.');
  G.mission = { idx: -1, stage: 0, timer: 0, dwell: 0, active: false };
  hideBeacon(G.beacon); hideMarker(G.beacon);
}

function nearPoint(G, x, z, r) {
  return dist2(G.player.x, G.player.z, x, z) < r;
}

function updateMission(G, dt) {
  const m = G.mission;
  if (!m || !m.active) return;
  m.timer -= dt;
  if (m.timer <= 0) { failMission(G, 'time ran out'); return; }
  const P = G.player;

  if (m.idx === 0) {
    if (m.stage === 0) {
      if (P.inCar && P.car === G.missionCar) {
        m.stage = 1;
        G.toast('Got the wheels. Now drive to the drop-off.');
        refreshMissionBeacon(G);
      }
    } else if (nearPoint(G, CITY.DROPOFF.x, CITY.DROPOFF.z, 7) && P.inCar) {
      completeMission(G);
    }
  } else if (m.idx === 1) {
    const spot = CITY.PIZZA_SPOTS[m.stage];
    if (nearPoint(G, spot.x, spot.z, 3.5)) {
      m.dwell += dt;
      if (m.dwell >= 1.5) {
        m.dwell = 0;
        AudioSys.pickup();
        m.stage++;
        if (m.stage >= 3) completeMission(G);
        else { G.toast('Delivery ' + m.stage + ' of 3 done. Next stop marked.'); refreshMissionBeacon(G); }
      }
    } else m.dwell = 0;
  } else if (m.idx === 2) {
    if (G.wanted <= 0) completeMission(G);
  } else if (m.idx === 3) {
    if (m.stage === 0) {
      const door = { x: CITY.BANK.x, z: CITY.BANK.z - 12 };
      if (nearPoint(G, door.x, door.z, 4)) {
        m.dwell += dt;
        if (m.dwell >= 3) {
          m.dwell = 0; m.stage = 1;
          G.setWanted(3);
          G.toast('Vault cracked! $1,500 in the bag — now LOSE the cops and reach the hideout!');
          AudioSys.pickup();
          refreshMissionBeacon(G);
        }
      } else m.dwell = 0;
    } else if (nearPoint(G, CITY.HIDEOUT.x, CITY.HIDEOUT.z, 6)) {
      completeMission(G);
    }
  }
}
