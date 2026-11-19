// The single game-state object and its localStorage save. Everything the player has
// earned or unlocked lives here, so saving is one JSON write and loading is one parse;
// the live simulation (positions, traffic, cops) is rebuilt fresh on every load.

export const SAVE_KEY = 'solmar-city.save.v1';
export const START_CASH = 150;
export const START_HEALTH = 100;

/** A brand-new player: a little starting cash, no heat, no jobs done yet. */
export function freshState() {
  return {
    cash: START_CASH,
    health: START_HEALTH,
    wanted: 0,
    missionIndex: 0,
    missionsDone: 0,
    storyComplete: false,
    clockMinutes: 9 * 60,
    kills: 0,
    carsStolen: 0,
    bestWanted: 0,
    spawn: { x: 0, z: 26 },
    playSeconds: 0,
  };
}

export function saveGame(state) {
  try {
    const snap = {
      cash: state.cash,
      health: state.health,
      wanted: 0,
      missionIndex: state.missionIndex,
      missionsDone: state.missionsDone,
      storyComplete: state.storyComplete,
      clockMinutes: state.clockMinutes,
      kills: state.kills,
      carsStolen: state.carsStolen,
      bestWanted: state.bestWanted,
      spawn: state.spawn,
      playSeconds: state.playSeconds,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(snap));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    const state = freshState();
    Object.assign(state, data);
    state.wanted = 0;
    state.health = START_HEALTH;
    return state;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

/** Cash lost to a bust or a hospital visit: 10%, rounded down, at least $0. */
export function bailCut(cash) {
  return Math.floor(cash * 0.1);
}
