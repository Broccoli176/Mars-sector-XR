import { gameData } from '../../src/data/index.js';
import { Simulation } from '../../src/systems/Simulation.js';

/**
 * New simulation with optional deep-merged balance overrides and event list.
 * @param {{ balance?: any, events?: any[] }} [overrides]
 */
export function newSim(overrides = {}) {
  const balance = deepMerge(structuredClone(gameData.balance), overrides.balance ?? {});
  const events = overrides.events ?? structuredClone(gameData.events);
  return new Simulation({ resources: structuredClone(gameData.resources), balance, events, real: gameData.real });
}

/** @param {any} target @param {any} source */
function deepMerge(target, source) {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) target[k] = deepMerge(target[k] ?? {}, v);
    else target[k] = v;
  }
  return target;
}

/** @param {any} sim @param {number} n */
export function runTicks(sim, n) {
  for (let i = 0; i < n && sim.phase === 'playing'; i++) sim.step();
}
