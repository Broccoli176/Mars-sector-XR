// 2D (top-down) collision for smooth/keyboard locomotion. Pure data → testable headlessly.
// The player is a circle; walls, door frames and furniture are axis-aligned boxes.

export const PLAYER_RADIUS = 0.22; // m
const MAX_STEP = 0.08; // m per collision sub-step (no tunnelling through 0.2 m walls)
const PUSH_ITERATIONS = 3;
const DOOR_FRAME_WIDTH = 0.08; // must match the frames drawn in world/Basement.js
const DOOR_FRAME_DEPTH = 0.32;
const DOOR_ASSIST_RANGE = 0.9; // m from the wall line where door assist kicks in
const DOOR_ASSIST_LATERAL = 0.75; // m max sideways offset from the door centre to be guided in

/** @typedef {{ x0: number, x1: number, z0: number, z1: number }} Box2 */
/** @typedef {{ alongX: boolean, fixed: number, center: number }} Door */

/**
 * Builds the collision world from layout.json (walls minus door gaps, door frames).
 * Furniture can be added later with `addBox`.
 * @param {{ wallThickness: number, walls: { from: number[], to: number[], gaps?: number[][] }[] }} layout
 * @param {{ radius?: number }} [opts]
 */
export function buildCollider(layout, { radius = PLAYER_RADIUS } = {}) {
  /** @type {Box2[]} */
  const boxes = [];
  /** @type {Door[]} */
  const doors = [];
  const half = layout.wallThickness / 2;

  /** @param {boolean} alongX @param {number} fixed @param {number} s @param {number} e @param {number} depthHalf */
  const pushSegment = (alongX, fixed, s, e, depthHalf) => {
    if (e - s <= 1e-6) return;
    boxes.push(alongX
      ? { x0: s, x1: e, z0: fixed - depthHalf, z1: fixed + depthHalf }
      : { x0: fixed - depthHalf, x1: fixed + depthHalf, z0: s, z1: e });
  };

  for (const wall of layout.walls) {
    const alongX = wall.from[1] === wall.to[1];
    const fixed = alongX ? wall.from[1] : wall.from[0];
    const a = alongX ? wall.from[0] : wall.from[1];
    const b = alongX ? wall.to[0] : wall.to[1];
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    let cursor = start;
    for (const [g0, g1] of [...(wall.gaps ?? [])].sort((p, q) => p[0] - q[0])) {
      pushSegment(alongX, fixed, cursor, g0, half);
      // Door frame jambs narrow the opening slightly.
      pushSegment(alongX, fixed, g0, g0 + DOOR_FRAME_WIDTH, DOOR_FRAME_DEPTH / 2);
      pushSegment(alongX, fixed, g1 - DOOR_FRAME_WIDTH, g1, DOOR_FRAME_DEPTH / 2);
      doors.push({ alongX, fixed, center: (g0 + g1) / 2 });
      cursor = g1;
    }
    pushSegment(alongX, fixed, cursor, end, half);
  }

  /** Pushes the circle out of every overlapping box. @param {number} x @param {number} z */
  const pushOut = (x, z) => {
    for (let it = 0; it < PUSH_ITERATIONS; it++) {
      let moved = false;
      for (const b of boxes) {
        const cx = Math.min(Math.max(x, b.x0), b.x1);
        const cz = Math.min(Math.max(z, b.z0), b.z1);
        const dx = x - cx;
        const dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        moved = true;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2);
          const k = (radius - d) / d;
          x += dx * k;
          z += dz * k;
        } else {
          // Centre inside the box: leave through the nearest side.
          const exits = [
            [b.x0 - radius - x, 0],
            [b.x1 + radius - x, 0],
            [0, b.z0 - radius - z],
            [0, b.z1 + radius - z],
          ].sort((p, q) => Math.abs(p[0] + p[1]) - Math.abs(q[0] + q[1]));
          x += exits[0][0];
          z += exits[0][1];
        }
      }
      if (!moved) break;
    }
    return { x, z };
  };

  /**
   * Sideways nudge toward a door centre when walking at a door slightly off-axis.
   * @param {number} x @param {number} z @param {number} dx @param {number} dz
   */
  const doorAssist = (x, z, dx, dz) => {
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) return null;
    for (const door of doors) {
      const across = door.alongX ? z - door.fixed : x - door.fixed; // signed distance to the wall line
      const moveAcross = door.alongX ? dz : dx;
      const lateral = (door.alongX ? x : z) - door.center;
      // Must be heading toward the wall line, close to it, and roughly in front of the door.
      if (Math.abs(across) > DOOR_ASSIST_RANGE || Math.abs(lateral) > DOOR_ASSIST_LATERAL) continue;
      if (Math.sign(moveAcross) === Math.sign(across) || Math.abs(moveAcross) < len * 0.5) continue;
      const nudge = -Math.sign(lateral) * Math.min(Math.abs(lateral), len);
      return door.alongX ? { dx: nudge, dz: 0 } : { dx: 0, dz: nudge };
    }
    return null;
  };

  return {
    boxes,
    doors,
    radius,

    /** Adds a solid obstacle (furniture). @param {Box2} box */
    addBox(box) {
      boxes.push(box);
    },

    /** True if a circle at (x, z) overlaps nothing. @param {number} x @param {number} z */
    isFree(x, z) {
      return boxes.every((b) => {
        const cx = Math.min(Math.max(x, b.x0), b.x1);
        const cz = Math.min(Math.max(z, b.z0), b.z1);
        return (x - cx) ** 2 + (z - cz) ** 2 >= radius * radius - 1e-9;
      });
    },

    /**
     * Moves the circle by (dx, dz) with sliding, in small sub-steps.
     * @param {number} x @param {number} z @param {number} dx @param {number} dz
     * @returns {{ x: number, z: number }}
     */
    move(x, z, dx, dz) {
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / MAX_STEP));
      let p = { x, z };
      for (let i = 0; i < steps; i++) {
        const sx = dx / steps;
        const sz = dz / steps;
        const before = p;
        p = pushOut(p.x + sx, p.z + sz);
        // Little progress → probably pressing into a wall next to a door: guide toward the opening.
        const progress = Math.hypot(p.x - before.x, p.z - before.z);
        if (progress < Math.hypot(sx, sz) * 0.5) {
          const nudge = doorAssist(before.x, before.z, sx, sz);
          if (nudge) p = pushOut(p.x + nudge.dx, p.z + nudge.dz);
        }
      }
      return p;
    },
  };
}
