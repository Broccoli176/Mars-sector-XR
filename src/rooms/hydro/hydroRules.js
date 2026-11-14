// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Pure presentation rules for the hydroponics trays and the watering hose (tested in tests/hydroRules.test.js).

/**
 * @param {number} moisture 0..1 @param {{ dryAt: number, floodAt: number }} cfg
 * @returns {'dry' | 'ok' | 'flooded'}
 */
export function moistureState(moisture, cfg) {
  if (moisture < cfg.dryAt) return 'dry';
  if (moisture > cfg.floodAt) return 'flooded';
  return 'ok';
}

/** Next seed in the list (wraps around). @param {string[]} ids @param {string} current */
export function nextSeed(ids, current) {
  const i = ids.indexOf(current);
  return ids[(i + 1) % ids.length];
}

const DRY = [0.55, 0.42, 0.3];
const WET = [0.2, 0.13, 0.08];
const FLOOD = [0.22, 0.3, 0.42];

/**
 * Soil colour: light brown (dry) → dark (wet) → bluish (flooded). Returns linear-ish RGB 0..1.
 * @param {number} moisture @param {{ dryAt: number, floodAt: number }} cfg
 * @returns {[number, number, number]}
 */
export function soilColor(moisture, cfg) {
  const m = Math.max(0, Math.min(1, moisture));
  if (m <= cfg.floodAt) {
    const k = m / cfg.floodAt;
    return /** @type {[number, number, number]} */ (DRY.map((d, i) => d + (WET[i] - d) * k));
  }
  const k = (m - cfg.floodAt) / (1 - cfg.floodAt);
  return /** @type {[number, number, number]} */ (WET.map((w, i) => w + (FLOOD[i] - w) * k));
}

/** Text bar with the green band marked: "▮▮▮▮▯▯▯▯▯▯". @param {number} moisture @param {number} [cells] */
export function moistureBar(moisture, cells = 10) {
  const filled = Math.round(Math.max(0, Math.min(1, moisture)) * cells);
  return '▮'.repeat(filled) + '▯'.repeat(cells - filled);
}

/**
 * Hose water accumulator: sprays `flow` L/s while aimed at a tray, and flushes one intent per tray
 * every `flushEvery` seconds (or when the aim changes / spraying stops).
 * @param {{ flow: number, flushEvery: number }} cfg
 * @param {(trayId: string, liters: number) => void} emit
 */
export function createWaterBatcher({ flow, flushEvery }, emit) {
  let trayId = /** @type {string | null} */ (null);
  let liters = 0;
  let timer = 0;
  const flush = () => {
    if (trayId && liters > 0) emit(trayId, liters);
    liters = 0;
    timer = 0;
  };
  return {
    /** @param {string | null} target tray under the spray, or null @param {number} dt seconds */
    update(target, dt) {
      if (target !== trayId) {
        flush();
        trayId = target;
      }
      if (!target) return;
      liters += flow * dt;
      timer += dt;
      if (timer >= flushEvery) flush();
    },
    stop() {
      flush();
      trayId = null;
    },
  };
}
