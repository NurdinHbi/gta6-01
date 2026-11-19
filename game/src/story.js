// Mara's jobs: four sequential story missions, each with a gold beacon in the world, a
// marker on the minimap, a timer, and a cash payout. Finish one and the next unlocks;
// finish all four and the city is yours in free roam. Every mission is timed, and the
// clock running out fails it — Mara lets you try again from her kiosk.

import * as THREE from 'three';

export const MISSION_REWARDS = [300, 500, 800, 1500];

export const MISSIONS = [
  {
    name: 'First Wheels',
    brief: 'Steal any car and bring it to the garage on the north side. Mara needs wheels, fast.',
    time: 180,
  },
  {
    name: 'Pizza Rush',
    brief: 'Grab the pizza order and deliver it to three houses before it goes cold.',
    time: 180,
  },
  {
    name: 'Lose the Heat',
    brief: 'The PD is all over you. Lose the wanted level before the clock runs out.',
    time: 180,
  },
  {
    name: 'The Solmar Job',
    brief: 'Hit the bank, grab the cash, and get to the safehouse with the whole city chasing you.',
    time: 240,
  },
];

/**
 * Mission state machine. The caller feeds it the player's position, whether they are in
 * a car, and the wanted level each step; it answers with the current objective text, the
 * beacon position, the time left, and completion / failure events.
 */
export function createStory(scene, landmarks) {
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.55 });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 2.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.22, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23f }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.5, 16), beaconMat);
  pillar.position.y = 0.25;
  beacon.add(pillar, beam, ring);
  beacon.visible = false;
  scene.add(beacon);

  let active = null;
  let stage = 0;
  let timer = 0;
  let holdTimer = 0;
  let startedWanted = 0;

  function beaconAt(x, z) {
    beacon.position.set(x, 0, z);
    beacon.visible = true;
  }

  function currentTarget() {
    if (!active) return null;
    const m = active.index;
    if (m === 0) return landmarks.garage;
    if (m === 1) return stage === 0 ? landmarks.pizza : landmarks.houses[Math.min(stage - 1, 2)];
    if (m === 2) return null;
    if (m === 3) return stage === 0 ? landmarks.bank : landmarks.safehouse;
    return null;
  }

  return {
    get active() {
      return active;
    },
    get timeLeft() {
      return timer;
    },
    get stage() {
      return stage;
    },
    /** Where the gold marker should point right now (null = no beacon). */
    target() {
      return currentTarget();
    },
    /** Start mission `index` (0-3). Returns its brief. */
    start(index, state) {
      active = { index, name: MISSIONS[index].name };
      stage = 0;
      holdTimer = 0;
      timer = MISSIONS[index].time;
      startedWanted = state.wanted;
      if (index === 2) state.wanted = Math.max(state.wanted, 2);
      const target = currentTarget();
      if (target) beaconAt(target.x, target.z);
      else beacon.visible = false;
      return MISSIONS[index].brief;
    },
    /** Give up on the active mission; the beacon goes dark. */
    abandon() {
      active = null;
      beacon.visible = false;
    },
    beaconVisible() {
      return beacon.visible;
    },
    /**
     * Advance the active mission. `ctx` carries the live facts: player position, inCar,
     * wanted, and a `pay`/`busted` hook the caller wires to state. Returns an event
     * object: { completed, failed, note }.
     */
    update(dt, ctx) {
      if (!active) return { completed: false, failed: false, note: '' };
      timer -= dt;
      const m = active.index;
      const px = ctx.pos.x;
      const pz = ctx.pos.z;
      const near = (spot, r) => spot && Math.hypot(px - spot.x, pz - spot.z) < r;
      if (timer <= 0) {
        active = null;
        beacon.visible = false;
        return { completed: false, failed: true, note: 'Out of time — Mara is not happy.' };
      }
      if (m === 0) {
        if (ctx.inCar && near(landmarks.garage, 7)) {
          active = null;
          beacon.visible = false;
          return { completed: true, failed: false, note: '' };
        }
      } else if (m === 1) {
        if (stage === 0 && near(landmarks.pizza, 5)) {
          stage = 1;
          beaconAt(landmarks.houses[0].x, landmarks.houses[0].z);
          return { completed: false, failed: false, note: 'Order picked up — first house!' };
        }
        if (stage >= 1 && stage <= 3 && near(landmarks.houses[stage - 1], 6)) {
          stage += 1;
          if (stage <= 3) {
            beaconAt(landmarks.houses[stage - 1].x, landmarks.houses[stage - 1].z);
            return { completed: false, failed: false, note: `Delivered — ${3 - (stage - 1)} to go.` };
          }
          active = null;
          beacon.visible = false;
          return { completed: true, failed: false, note: '' };
        }
      } else if (m === 2) {
        if (ctx.wanted === 0) {
          active = null;
          beacon.visible = false;
          return { completed: true, failed: false, note: '' };
        }
      } else if (m === 3) {
        if (stage === 0 && near(landmarks.bank, 6)) {
          holdTimer += dt;
          if (holdTimer >= 3) {
            stage = 1;
            ctx.wanted = Math.max(ctx.wanted, 3);
            beaconAt(landmarks.safehouse.x, landmarks.safehouse.z);
            return { completed: false, failed: false, note: 'Cash grabbed — run for the safehouse!' };
          }
        } else {
          holdTimer = 0;
        }
        if (stage === 1 && near(landmarks.safehouse, 7)) {
          active = null;
          beacon.visible = false;
          return { completed: true, failed: false, note: '' };
        }
      }
      return { completed: false, failed: false, note: '' };
    },
    /** One-line objective text for the HUD. */
    objectiveText() {
      if (!active) return { title: 'Free Roam', text: 'Visit Mara at the gold kiosk — or explore the city.' };
      const m = active.index;
      if (m === 0) return { title: `Job 1 — ${MISSIONS[0].name}`, text: 'Steal a car, then drive it to the garage marker.' };
      if (m === 1) {
        if (stage === 0) return { title: `Job 2 — ${MISSIONS[1].name}`, text: 'Pick up the pizza order at the gold marker.' };
        return { title: `Job 2 — ${MISSIONS[1].name}`, text: `Deliver the pizza — house ${stage} of 3.` };
      }
      if (m === 2) return { title: `Job 3 — ${MISSIONS[2].name}`, text: 'Lose your wanted level. Stay out of sight.' };
      if (m === 3) {
        if (stage === 0) return { title: `Job 4 — ${MISSIONS[3].name}`, text: 'Get to the bank and hold the marker to grab the cash.' };
        return { title: `Job 4 — ${MISSIONS[3].name}`, text: 'Escape to the safehouse — the whole city is chasing you.' };
      }
      return { title: 'Free Roam', text: '' };
    },
    /** Pulse the beacon so it reads from across the city. */
    animate(t) {
      if (!beacon.visible) return;
      const s = 1 + Math.sin(t * 4) * 0.12;
      ring.scale.set(s, s, 1);
      beam.material.opacity = 0.16 + Math.sin(t * 4) * 0.06;
    },
    /** Show the idle beacon over Mara's kiosk between missions. */
    showMaraBeacon() {
      beaconAt(landmarks.mara.x, landmarks.mara.z);
    },
    hideBeacon() {
      beacon.visible = false;
    },
  };
}
