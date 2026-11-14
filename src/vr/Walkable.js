const ROOM_MARGIN = 0.3; // metres kept from a wall's centre line (≈ 0.2 m from its surface)
const DOOR_INSET = 0.15; // metres trimmed from each side of a door opening

/**
 * Walkable area for smooth (keyboard) locomotion, derived from layout.json:
 * every room shrunk by a margin, plus a rectangle through each door opening.
 * Pure data → testable headlessly.
 * @param {{ rooms: { x: number[], z: number[] }[], walls: { from: number[], to: number[], gaps?: number[][] }[] }} layout
 */
export function buildWalkable(layout) {
  /** @type {{ x0: number, x1: number, z0: number, z1: number }[]} */
  const rects = layout.rooms.map((r) => ({
    x0: r.x[0] + ROOM_MARGIN,
    x1: r.x[1] - ROOM_MARGIN,
    z0: r.z[0] + ROOM_MARGIN,
    z1: r.z[1] - ROOM_MARGIN,
  }));

  const reach = ROOM_MARGIN + 0.05; // overlap the shrunk rooms on both sides of the wall
  for (const wall of layout.walls) {
    const alongX = wall.from[1] === wall.to[1];
    const fixed = alongX ? wall.from[1] : wall.from[0];
    for (const [g0, g1] of wall.gaps ?? []) {
      rects.push(
        alongX
          ? { x0: g0 + DOOR_INSET, x1: g1 - DOOR_INSET, z0: fixed - reach, z1: fixed + reach }
          : { x0: fixed - reach, x1: fixed + reach, z0: g0 + DOOR_INSET, z1: g1 - DOOR_INSET },
      );
    }
  }

  return {
    rects,
    /** @param {number} x @param {number} z */
    contains(x, z) {
      return rects.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
    },
  };
}
