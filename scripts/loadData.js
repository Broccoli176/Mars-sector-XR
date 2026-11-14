// Node-side loader for headless scripts (same merge rules as src/data/index.js).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mergeObjects } from '../src/data/merge.js';

const dataDir = fileURLToPath(new URL('../src/data/', import.meta.url));
const readJson = (/** @type {string} */ p) => JSON.parse(readFileSync(dataDir + p, 'utf8'));

/** @param {string} folder */
const folder = (folder) =>
  readdirSync(dataDir + folder)
    .filter((f) => f.endsWith('.json'))
    .map((f) => /** @type {[string, any]} */ ([f, readJson(`${folder}/${f}`)]));

/** Simulation data only (no layout/strings needed headless). */
export function loadSimData() {
  return {
    resources: readJson('resources.json'),
    balance: mergeObjects(folder('balance'), 'balance'),
    events: readJson('events.json'),
    real: Object.fromEntries(folder('real').map(([f, d]) => [f.replace(/\.json$/, ''), d])),
  };
}
