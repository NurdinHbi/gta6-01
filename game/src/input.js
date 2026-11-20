// Keyboard and mouse input. Keys are tracked as a live set; discrete presses
// (confirm, pause, enter-car, reload, weapon switch, mute, camera) are queued
// as one-shot actions the loop consumes once per frame. Dragging the mouse
// orbits the camera; the arrow keys do the same.
export const ACTION_CONFIRM = 1 << 0;
export const ACTION_PAUSE = 1 << 1;
export const ACTION_ENTER = 1 << 2;
export const ACTION_RELOAD = 1 << 3;
export const ACTION_MUTE = 1 << 4;
export const ACTION_CAMERA = 1 << 5;
export const ACTION_SHOOT = 1 << 6;
export const ACTION_PUNCH = 1 << 7;
export const ACTION_WEAPON_1 = 1 << 8;
export const ACTION_WEAPON_2 = 1 << 9;
export const ACTION_WEAPON_3 = 1 << 10;

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyE: ACTION_ENTER,
  KeyR: ACTION_RELOAD,
  KeyM: ACTION_MUTE,
  KeyC: ACTION_CAMERA,
  Digit1: ACTION_WEAPON_1,
  Digit2: ACTION_WEAPON_2,
  Digit3: ACTION_WEAPON_3,
};

export function createInput(canvas) {
  const keys = new Set();
  let queued = 0;
  let dragDX = 0;
  let dragDY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let mouseDown = false;

  function onKeyDown(event) {
    if (event.repeat) {
      if (event.code === 'Space') event.preventDefault();
      return;
    }
    keys.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) queued |= action;
    if (event.code === 'Space') {
      queued |= ACTION_PUNCH;
      event.preventDefault();
    }
    if (event.code === 'KeyF') queued |= ACTION_SHOOT;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onPointerDown(event) {
    dragging = true;
    mouseDown = true;
    lastX = event.clientX;
    lastY = event.clientY;
    if (event.button === 0) queued |= ACTION_SHOOT;
  }

  function onPointerMove(event) {
    if (!dragging) return;
    dragDX += event.clientX - lastX;
    dragDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  }

  function onPointerUp() {
    dragging = false;
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    keys,
    takeActions() {
      const out = queued;
      queued = 0;
      return out;
    },
    takeDrag() {
      const out = { dx: dragDX, dy: dragDY };
      dragDX = 0;
      dragDY = 0;
      return out;
    },
    get mouseDown() {
      return mouseDown;
    },
    // -1..1 movement axes from WASD (x = strafe, y = forward).
    moveAxes() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA')) x -= 1;
      if (keys.has('KeyD')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
      if (keys.has('ArrowLeft')) x -= 1;
      if (keys.has('ArrowRight')) x += 1;
      return { x, y };
    },
    get run() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    get handbrake() {
      return keys.has('Space');
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    },
  };
}
