// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Pure rules for hand tools (no three.js): where a released tool goes, and training mission T1.

/** @typedef {{ x: number, y: number, z: number }} Vec3 */

/** @param {Vec3} a @param {Vec3} b */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Decides where a released tool goes (spec §9.3):
 * a free holster within reach → holster; its own wall hook within reach → wall; otherwise → drop.
 * @param {Vec3} pos world position at release
 * @param {{ holsters: { position: Vec3, item: string | null }[], home: Vec3, holsterRadius: number, wallRadius: number }} ctx
 * @returns {{ kind: 'holster', index: number } | { kind: 'wall' } | { kind: 'drop' }}
 */
export function decideRelease(pos, { holsters, home, holsterRadius, wallRadius }) {
  let best = -1;
  let bestD = Infinity;
  holsters.forEach((h, i) => {
    const d = dist(pos, h.position);
    if (h.item === null && d <= holsterRadius && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  if (best >= 0) return { kind: 'holster', index: best };
  if (dist(pos, home) <= wallRadius) return { kind: 'wall' };
  return { kind: 'drop' };
}

/** @param {number | null} landedAt seconds @param {number} now seconds @param {number} returnSeconds */
export function shouldReturnHome(landedAt, now, returnSeconds) {
  return landedAt !== null && now - landedAt >= returnSeconds;
}

/** Training mission T1: grab, holster, drop and recover a tool (spec §9.4). */
export function createT1() {
  return { grabbed: false, holstered: false, dropped: false, recovered: false };
}

/**
 * @param {ReturnType<typeof createT1>} s
 * @param {'grab' | 'holster' | 'drop' | 'wall'} event
 * @param {{ wasOnFloor?: boolean }} [info]
 */
export function updateT1(s, event, info = {}) {
  if (event === 'grab') {
    s.grabbed = true;
    if (info.wasOnFloor && s.dropped) s.recovered = true;
  }
  if (event === 'holster') s.holstered = true;
  if (event === 'drop') s.dropped = true;
  return s;
}

/** @param {ReturnType<typeof createT1>} s */
export const isT1Done = (s) => s.grabbed && s.holstered && s.dropped && s.recovered;
