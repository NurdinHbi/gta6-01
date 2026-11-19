// Keyboard + mouse input. One job: turn DOM events into a plain state
// object the simulation reads; the game never touches events directly.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    // Held movement keys, read by player / driving code.
    forward: false,
    back: false,
    left: false,
    right: false,
    run: false,
    handbrake: false,
    // Edge-triggered actions, consumed by the game loop each step.
    enterCar: false,
    punch: false,
    shoot: false,
    interact: false,
    pause: false,
    mute: false,
    // Camera orbit deltas accumulated since the last step.
    dragDX: 0,
    dragDY: 0,
    wheel: 0,
    dragging: false,
    // Pointer position for click-to-shoot (centre of screen is the crosshair).
    pointerDown: false,
  };

  function refreshHeld() {
    const k = input.keys;
    input.forward = k.has('KeyW') || k.has('ArrowUp');
    input.back = k.has('KeyS') || k.has('ArrowDown');
    input.left = k.has('KeyA') || k.has('ArrowLeft');
    input.right = k.has('KeyD') || k.has('ArrowRight');
    input.run = k.has('ShiftLeft') || k.has('ShiftRight');
    input.handbrake = k.has('Space');
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    input.keys.add(event.code);
    if (event.code === 'KeyE') input.enterCar = true;
    if (event.code === 'KeyF') input.punch = true;
    if (event.code === 'KeyM') input.mute = true;
    if (event.code === 'Escape' || event.code === 'KeyP') input.pause = true;
    if (event.code === 'Space') event.preventDefault();
    refreshHeld();
  });
  window.addEventListener('keyup', (event) => {
    input.keys.delete(event.code);
    refreshHeld();
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    refreshHeld();
  });

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      input.pointerDown = true;
      input.dragging = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) {
      input.pointerDown = false;
      input.dragging = false;
    }
  });
  window.addEventListener('mousemove', (event) => {
    if (!input.dragging) return;
    input.dragDX += event.movementX || 0;
    input.dragDY += event.movementY || 0;
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    input.wheel += event.deltaY;
  }, { passive: false });
  // Click (not drag) shoots the pistol. A click is a short press with
  // almost no mouse movement; the loop decides from the drag distance.
  let downX = 0;
  let downY = 0;
  canvas.addEventListener('mousedown', (event) => {
    downX = event.clientX;
    downY = event.clientY;
  });
  window.addEventListener('mouseup', (event) => {
    const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
    if (event.button === 0 && moved < 6) input.shoot = true;
  });

  // Consume all edge-triggered flags after one simulation step.
  input.consumeEdges = () => {
    input.enterCar = false;
    input.punch = false;
    input.shoot = false;
    input.interact = false;
    input.pause = false;
    input.mute = false;
    input.dragDX = 0;
    input.dragDY = 0;
    input.wheel = 0;
  };

  return input;
}
