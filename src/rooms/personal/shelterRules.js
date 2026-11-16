// @ts-check
// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Pure rule for the storm shelter: the sleep capsule in Personal (tested in tests/shelter.test.js).

/**
 * True when a head position, in the capsule's station-local space (x across the back wall, +z into the room,
 * back wall at z = 0), is inside the sleep capsule: between its water-filled side walls and under its roof.
 * @param {number} x @param {number} z @param {{ widthM: number, depthM: number, wallM: number }} cfg balance.shelter
 */
export function insideCapsule(x, z, cfg) {
  return Math.abs(x) <= cfg.widthM / 2 - cfg.wallM + 0.05 && z >= 0 && z <= cfg.depthM + 0.05;
}
