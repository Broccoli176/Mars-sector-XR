// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Pure presentation/policy helpers for the pantry and the food processor (tested in tests/kitchen.test.js).

/** Next recipe in the list (wraps around). @param {string[]} ids @param {string} current */
export function nextRecipe(ids, current) {
  const i = ids.indexOf(current);
  return ids[(i + 1) % ids.length];
}

/**
 * Pantry lots grouped by item (first-seen order), with hours left before the oldest of each spoils.
 * @param {{ itemId: string, ageHours: number }[]} pantry @param {number} shelfHours
 * @returns {{ itemId: string, count: number, hoursLeft: number }[]}
 */
export function freshnessLines(pantry, shelfHours) {
  /** @type {Map<string, { itemId: string, count: number, hoursLeft: number }>} */
  const groups = new Map();
  for (const lot of pantry) {
    const left = Math.max(0, Math.round((shelfHours - lot.ageHours) * 10) / 10);
    const g = groups.get(lot.itemId);
    if (g) {
      g.count++;
      g.hoursLeft = Math.min(g.hoursLeft, left);
    } else groups.set(lot.itemId, { itemId: lot.itemId, count: 1, hoursLeft: left });
  }
  return [...groups.values()];
}

/**
 * Recipe that yields the most kcal with the current pantry, or null if none can be made.
 * @param {{ recipes: { id: string }[], previewKcal: (id: string) => number }} kitchen
 */
export function bestRecipe(kitchen) {
  let best = null;
  let bestKcal = 0;
  for (const r of kitchen.recipes) {
    const kcal = kitchen.previewKcal(r.id);
    if (kcal > bestKcal) {
      best = r.id;
      bestKcal = kcal;
    }
  }
  return best;
}
