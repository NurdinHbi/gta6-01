// Keyboard and mouse for Solmar City. Held keys are read every frame; one-shot actions
// (enter a car, punch, pause, help, mute) are queued as flags and taken once, so a press
// landing between two frames is never lost and never fires twice. The camera orbits by
// dragging with the mouse, and the wheel zooms — no pointer lock, so it works the same
// in a real browser and in a headless playtest.

export const ACT_ENTER = 1;
export const ACT_PUNCH = 2;
export const ACT_PAUSE = 4;
export const ACT_HELP = 8;
export const ACT_MUTE = 16;
export const ACT_SHOOT = 32;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const BRAKE = new Set(['Space']);

export function createControls(canvas) {
  const held = new Set();
  let actions = 0;
  let lookDX = 0;
  let lookDY = 0;
  let zoomDelta = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
        event.preventDefault();
      }
      return;
    }
    held.add(event.code);
    if (event.code === 'KeyE') actions |= ACT_ENTER;
    else if (event.code === 'KeyF') actions |= ACT_PUNCH;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACT_PAUSE;
    else if (event.code === 'KeyH') actions |= ACT_HELP;
    else if (event.code === 'KeyM') actions |= ACT_MUTE;
    if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || BRAKE.has(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    dragging = false;
  });

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    lookDX += event.clientX - lastX;
    lookDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  const endDrag = (event) => {
    if (!dragging) return;
    const moved = Math.abs(event.clientX - lastX) + Math.abs(event.clientY - lastY);
    dragging = false;
    // A click without a drag is a pistol shot.
    if (moved < 6) actions |= ACT_SHOOT;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => { dragging = false; });
  canvas.addEventListener('wheel', (event) => {
    zoomDelta += event.deltaY;
    event.preventDefault();
  }, { passive: false });

  return {
    /** -1/0/1 forward, -1/0/1 strafe, run and handbrake flags for this frame. */
    move() {
      const fwd = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
      const strafe = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      return {
        forward: fwd,
        strafe,
        run: held.has('ShiftLeft') || held.has('ShiftRight'),
        brake: held.has('Space'),
      };
    },
    /** Mouse-orbit deltas since the last call, in pixels. */
    takeLook() {
      const out = { dx: lookDX, dy: lookDY, zoom: zoomDelta };
      lookDX = 0;
      lookDY = 0;
      zoomDelta = 0;
      return out;
    },
    /** One-shot actions since the last call, as ACT_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Queue an action from outside input (buttons, tests). */
    queue(action) {
      actions |= action;
    },
  };
}
