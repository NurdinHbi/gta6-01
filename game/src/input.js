// Keyboard and pointer input. Held keys give movement and driving; one-shot
// presses (enter car, shoot, reload, pause, weapon switch, mute) are queued as
// bit flags and taken once by the loop, so a press between two frames is never
// lost and never counted twice. Dragging the mouse orbits the camera.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_SHOOT = 8;
export const ACTION_RELOAD = 16;
export const ACTION_MUTE = 32;
export const ACTION_CAM = 64;

const MOVE = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', KeyD: 'right',
};

export function createInput(canvas) {
  const held = { forward: false, back: false, left: false, right: false, run: false, handbrake: false };
  let actions = 0;
  let weaponSlot = -1;
  let orbitDX = 0;
  let orbitDY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  window.addEventListener('keydown', (event) => {
    const move = MOVE[event.code];
    if (move) {
      held[move] = true;
      event.preventDefault();
      return;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') { held.run = true; return; }
    if (event.code === 'Space') { held.handbrake = true; event.preventDefault(); return; }
    if (event.repeat) return;
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyE') actions |= ACTION_ENTER;
    else if (event.code === 'KeyF') actions |= ACTION_SHOOT;
    else if (event.code === 'KeyR') actions |= ACTION_RELOAD;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else if (event.code === 'KeyC') actions |= ACTION_CAM;
    else if (event.code === 'Digit1') weaponSlot = 0;
    else if (event.code === 'Digit2') weaponSlot = 1;
    else if (event.code === 'Digit3') weaponSlot = 2;
  });
  window.addEventListener('keyup', (event) => {
    const move = MOVE[event.code];
    if (move) held[move] = false;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.run = false;
    if (event.code === 'Space') held.handbrake = false;
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(held)) held[k] = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    actions |= ACTION_SHOOT;
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    orbitDX += event.clientX - lastX;
    orbitDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('pointerup', () => { dragging = false; });

  return {
    held,
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeWeaponSlot() {
      const slot = weaponSlot;
      weaponSlot = -1;
      return slot;
    },
    takeOrbit() {
      const out = { dx: orbitDX, dy: orbitDY };
      orbitDX = 0;
      orbitDY = 0;
      return out;
    },
    /** -1/0/1 forward and strafe, from the held keys. */
    moveAxes() {
      return {
        f: (held.forward ? 1 : 0) - (held.back ? 1 : 0),
        s: (held.right ? 1 : 0) - (held.left ? 1 : 0),
      };
    },
  };
}
