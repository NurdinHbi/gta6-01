// Keyboard and mouse: WASD, run, punch, pistol, car keys, pause, mute, and an
// orbit camera driven by dragging (or pointer lock after a click). The game
// reads a snapshot each frame; edges (just-pressed keys) are consumed once.

export class Controls {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();   // keys pressed since the last takePress()
    this.camYaw = Math.PI;      // camera looks north by default
    this.camPitch = 0.42;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.mouseClicked = false;
    this.locked = false;

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.keys.add(e.code);
        this.pressed.add(e.code);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (e.button === 0) this.mouseClicked = true;
      // Clicking the canvas grabs the pointer so the camera can orbit freely.
      if (canvas.requestPointerLock) {
        try { canvas.requestPointerLock(); } catch { /* pointer lock unavailable */ }
      }
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.camYaw -= e.movementX * 0.0032;
        this.camPitch = Math.max(0.08, Math.min(1.15, this.camPitch + e.movementY * 0.0024));
      } else if (this.dragging) {
        this.camYaw -= (e.clientX - this.lastX) * 0.005;
        this.camPitch = Math.max(0.08, Math.min(1.15, this.camPitch + (e.clientY - this.lastY) * 0.004));
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code) { return this.keys.has(code); }

  // True once for a key pressed since the last frame consumed it.
  takePress(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  takeClick() {
    const c = this.mouseClicked;
    this.mouseClicked = false;
    return c;
  }

  endFrame() { this.pressed.clear(); }

  // Movement intent in camera space: x = strafe right, z = forward.
  moveVector() {
    let x = 0;
    let z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    const len = Math.hypot(x, z);
    if (len > 0) { x /= len; z /= len; }
    return { x, z };
  }

  get run() { return this.down('ShiftLeft') || this.down('ShiftRight'); }
}
