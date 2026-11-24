// Keyboard + mouse input. Actions are edge-triggered bits consumed once per
// frame by main.js; held keys live in `keys` for the step loop.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_INTERACT = 8;
export const ACTION_SHOOT = 16;
export const ACTION_RELOAD = 32;
export const ACTION_RADIO = 64;
export const ACTION_TAXI = 128;
export const ACTION_GARAGE = 256;

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  Escape: ACTION_PAUSE,
  KeyP: ACTION_PAUSE,
  KeyM: ACTION_MUTE,
  KeyE: ACTION_INTERACT,
  KeyF: ACTION_SHOOT,
  KeyR: ACTION_RELOAD,
  KeyQ: ACTION_RADIO,
  KeyT: ACTION_TAXI,
  KeyG: ACTION_GARAGE,
};

export function createInput(canvas) {
  const keys = new Set();
  let pending = 0;
  let mouseDown = false;
  let dragDx = 0;
  let dragDy = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    const bit = KEY_ACTIONS[event.code];
    if (bit) pending |= bit;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (event) => {
    mouseDown = true; dragging = true; lastX = event.clientX; lastY = event.clientY;
    pending |= ACTION_SHOOT;
  });
  window.addEventListener('mouseup', () => { mouseDown = false; dragging = false; });
  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    dragDx += event.clientX - lastX;
    dragDy += event.clientY - lastY;
    lastX = event.clientX; lastY = event.clientY;
  });

  return {
    keys,
    get mouseDown() { return mouseDown; },
    takeActions() { const a = pending; pending = 0; return a; },
    takeDrag() { const d = { dx: dragDx, dy: dragDy }; dragDx = 0; dragDy = 0; return d; },
    moveAxes() {
      let x = 0; let y = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      return { x, y };
    },
    get run() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    get handbrake() { return keys.has('Space'); },
  };
}
