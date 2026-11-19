// Save and Continue: progress (cash, story, health, position, clock) lives in
// localStorage under one key, written on mission results and every few seconds.

import { SAVE_KEY } from './config.js';

export function saveGame(game) {
  try {
    const p = game.playerPos();
    const data = {
      version: 1,
      cash: game.cash,
      missionIndex: game.missions.index,
      health: Math.round(game.player.health),
      x: Math.round(p.x * 10) / 10,
      z: Math.round(p.z * 10) / 10,
      yaw: game.player.yaw,
      clockMinutes: Math.round(game.clockMinutes),
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* storage off */ }
}
