// @ts-check
// SHARED (see docs/COLLABORATION.md): which rooms can be seen from a point of the base.
// Top-down portal flood over layout.json: rooms are rectangles and every door gap is a portal between the two
// rooms it joins. Pure (no Three.js, no DOM): tested in tests/visibility.test.js. Used by src/world/Visibility.js
// to stop drawing the stations of rooms that are behind walls (AGENTS.md §7).

/**
 * @typedef {{ id: string, x0: number, x1: number, z0: number, z1: number }} Room
 * @typedef {{ a: string, b: string, p0: [number, number], p1: [number, number] }} Portal
 * @typedef {{ rooms: Room[], portals: Portal[], byRoom: Record<string, Portal[]> }} PortalGraph
 */

/** Distance from a wall used to find the two rooms a door joins (m). */
const PROBE = 0.3;
/** Longest chain of doors a sight line can cross (the base is a star: 6 is the real maximum). */
const MAX_DEPTH = 8;
/**
 * Safety margin (m): doors are treated as this much wider on each side and the eye as being in every room
 * closer than this. It covers the distance between the eyes, leaning into a doorway and one frame of head
 * movement, so a room is never hidden while a sliver of it is still on screen.
 */
export const EYE_MARGIN = 0.25;

/**
 * @param {{ rooms: { id: string, x: [number, number], z: [number, number] }[], walls: { from: [number, number], to: [number, number], gaps?: number[][] }[] }} layout
 * @returns {PortalGraph}
 */
export function buildPortalGraph(layout) {
  /** @type {Room[]} */
  const rooms = layout.rooms.map((r) => ({ id: r.id, x0: r.x[0], x1: r.x[1], z0: r.z[0], z1: r.z[1] }));
  /** @type {Portal[]} */
  const portals = [];
  for (const wall of layout.walls) {
    const [ax, az] = wall.from;
    const [bx, bz] = wall.to;
    const alongX = az === bz;
    const fixed = alongX ? az : ax;
    for (const [s0, s1] of wall.gaps ?? []) {
      const mid = (s0 + s1) / 2;
      const side = (/** @type {number} */ d) => roomAt(rooms, alongX ? mid : fixed + d, alongX ? fixed + d : mid);
      const a = side(-PROBE);
      const b = side(PROBE);
      if (!a || !b || a === b) continue; // a gap that does not join two rooms is not a portal
      portals.push({ a, b, p0: alongX ? [s0, fixed] : [fixed, s0], p1: alongX ? [s1, fixed] : [fixed, s1] });
    }
  }
  /** @type {Record<string, Portal[]>} */
  const byRoom = Object.fromEntries(rooms.map((r) => [r.id, []]));
  for (const p of portals) {
    byRoom[p.a].push(p);
    byRoom[p.b].push(p);
  }
  return { rooms, portals, byRoom };
}

/**
 * Room that contains a floor point, or null outside the base.
 * @param {Room[]} rooms @param {number} x @param {number} z @param {number} [tolerance]
 * @returns {string | null}
 */
export function roomAt(rooms, x, z, tolerance = 0) {
  for (const r of rooms) {
    if (x >= r.x0 - tolerance && x <= r.x1 + tolerance && z >= r.z0 - tolerance && z <= r.z1 + tolerance) return r.id;
  }
  return null;
}

/** @param {number} ax @param {number} az @param {number} bx @param {number} bz */
const cross = (ax, az, bx, bz) => ax * bz - az * bx;

/**
 * Keeps the part of t ∈ [t0, t1] where the linear function with values f0 (t = 0) and f1 (t = 1) is ≥ 0.
 * @param {[number, number]} range @param {number} f0 @param {number} f1
 */
function clip(range, f0, f1) {
  if (f0 >= 0 && f1 >= 0) return;
  if (f0 < 0 && f1 < 0) {
    range[0] = 1;
    range[1] = 0;
    return;
  }
  const tc = f0 / (f0 - f1);
  if (f0 < 0) range[0] = Math.max(range[0], tc);
  else range[1] = Math.min(range[1], tc);
}

/**
 * What can be seen from the eye at (x, z): for every room with a line of sight, either 'all' (the eye is in it)
 * or the list of sectors it is seen through. A sector is [lx, lz, rx, rz]: unit directions of its left and right
 * edges from the eye (always narrower than 180°).
 * Conservative: doors count as open at every height and are widened by `margin`.
 * Returns null when the point is outside the base (the caller then shows everything).
 * @param {PortalGraph} graph @param {number} x @param {number} z @param {number} [margin]
 * @returns {Map<string, 'all' | number[][]> | null}
 */
export function visibleSectors(graph, x, z, margin = EYE_MARGIN) {
  const start = graph.rooms.filter((r) => x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin);
  if (start.length === 0) return null;
  /** @type {Map<string, 'all' | number[][]>} */
  const seen = new Map(start.map((r) => [r.id, 'all']));
  /** @param {string} roomId @param {number} lx @param {number} lz @param {number} rx @param {number} rz */
  const addSector = (roomId, lx, lz, rx, rz) => {
    const current = seen.get(roomId);
    if (current === 'all') return;
    const ll = Math.hypot(lx, lz) || 1;
    const rl = Math.hypot(rx, rz) || 1;
    const sector = [lx / ll, lz / ll, rx / rl, rz / rl];
    if (current) current.push(sector);
    else seen.set(roomId, [sector]);
  };

  /**
   * @param {string} roomId @param {number} lx @param {number} lz @param {number} rx @param {number} rz
   * @param {boolean} open true = no sector yet (the eye is in this room) @param {Portal | null} from @param {number} depth
   */
  const flood = (roomId, lx, lz, rx, rz, open, from, depth) => {
    if (depth > MAX_DEPTH) return;
    for (const portal of graph.byRoom[roomId]) {
      if (portal === from) continue;
      let [ax, az] = portal.p0;
      let [bx, bz] = portal.p1;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      ax -= ux * margin;
      az -= uz * margin;
      bx += ux * margin;
      bz += uz * margin;
      /** @type {[number, number]} */
      const range = [0, 1];
      if (!open) {
        // Inside the sector: cross(left, v) ≥ 0 and cross(v, right) ≥ 0.
        clip(range, cross(lx, lz, ax - x, az - z), cross(lx, lz, bx - x, bz - z));
        clip(range, cross(ax - x, az - z, rx, rz), cross(bx - x, bz - z, rx, rz));
        if (range[0] > range[1]) continue;
      }
      const qax = ax + (bx - ax) * range[0] - x;
      const qaz = az + (bz - az) * range[0] - z;
      const qbx = ax + (bx - ax) * range[1] - x;
      const qbz = az + (bz - az) * range[1] - z;
      const c = cross(qax, qaz, qbx, qbz);
      const other = portal.a === roomId ? portal.b : portal.a;
      if (Math.abs(c) < 1e-9) {
        // The eye is on the line of the door: standing in the doorway shows the whole room behind it;
        // a door seen exactly edge-on shows nothing.
        if (qax * qbx + qaz * qbz < 0) seen.set(other, 'all');
        continue;
      }
      if (c > 0) {
        addSector(other, qax, qaz, qbx, qbz);
        flood(other, qax, qaz, qbx, qbz, false, portal, depth + 1);
      } else {
        addSector(other, qbx, qbz, qax, qaz);
        flood(other, qbx, qbz, qax, qaz, false, portal, depth + 1);
      }
    }
  };
  for (const room of start) flood(room.id, 0, 0, 0, 0, true, null, 0);
  return seen;
}

/**
 * Rooms with a line of sight from the eye at (x, z), including the room the eye is in (see `visibleSectors`).
 * @param {PortalGraph} graph @param {number} x @param {number} z @param {number} [margin]
 * @returns {Set<string> | null}
 */
export function visibleRooms(graph, x, z, margin = EYE_MARGIN) {
  const sectors = visibleSectors(graph, x, z, margin);
  return sectors ? new Set(sectors.keys()) : null;
}

/**
 * True when a circle on the floor (an object's footprint) touches what is seen of its room.
 * @param {'all' | number[][] | undefined} sectors that room's entry in `visibleSectors` (undefined = room not seen)
 * @param {number} ex eye x @param {number} ez eye z @param {number} cx circle centre x @param {number} cz @param {number} radius
 */
export function circleSeen(sectors, ex, ez, cx, cz, radius) {
  if (!sectors) return false;
  if (sectors === 'all') return true;
  const vx = cx - ex;
  const vz = cz - ez;
  for (const [lx, lz, rx, rz] of sectors) {
    // Signed distances to the two edges (positive = inside); the edges are unit vectors.
    if (cross(lx, lz, vx, vz) >= -radius && cross(vx, vz, rx, rz) >= -radius) return true;
  }
  return false;
}
