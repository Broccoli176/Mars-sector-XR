// @ts-check
// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Pure rule for the storm-shelter alcove (tested in tests/shelter.test.js).

/** Radius of the water tanks that line the alcove walls (m). */
export const TANK_RADIUS = 0.13;

/**
 * True when a head position, in the alcove's station-local space (x across the back wall, +z into the room,
 * back wall at z = 0), is inside the water-tank alcove: between the side tank walls and under the roof.
 * @param {number} x @param {number} z @param {{ widthM: number, depthM: number }} cfg balance.shelter
 */
export function insideAlcove(x, z, cfg) {
  return Math.abs(x) <= cfg.widthM / 2 - 2 * TANK_RADIUS + 0.05 && z >= 0 && z <= cfg.depthM + 0.05;
}
