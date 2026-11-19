// Shared helpers for Solmar City: seeded RNG, math, and circle-vs-AABB collision.
// No imports: this file is loaded as a classic script before the other game files.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }

// Shortest signed angular difference, in radians.
function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function angLerp(a, b, t) { return a + angDiff(a, b) * clamp(t, 0, 1); }

// Push a circle (x,z,r) out of an axis-aligned box {x0,z0,x1,z1}.
// Returns true when a collision happened (and mutates pos).
function resolveCircleBox(pos, r, box) {
  const cx = clamp(pos.x, box.x0, box.x1);
  const cz = clamp(pos.z, box.z0, box.z1);
  const dx = pos.x - cx, dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    pos.x = cx + (dx / d) * r;
    pos.z = cz + (dz / d) * r;
  } else {
    // Center inside the box: push out along the smallest penetration axis.
    const pl = pos.x - box.x0, pr = box.x1 - pos.x;
    const pt = pos.z - box.z0, pb = box.z1 - pos.z;
    const m = Math.min(pl, pr, pt, pb);
    if (m === pl) pos.x = box.x0 - r;
    else if (m === pr) pos.x = box.x1 + r;
    else if (m === pt) pos.z = box.z0 - r;
    else pos.z = box.z1 + r;
  }
  return true;
}

function fmtMoney(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }
function fmtClock(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
