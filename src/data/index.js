// SHARED loader (browser + Vitest). Per-owner files are discovered automatically — adding a room's
// stations/strings/balance file never requires editing this file. See docs/COLLABORATION.md.
// Node scripts load the same folders with fs (scripts/loadData.js).
import resources from './resources.json';
import events from './events.json';
import layoutGeometry from './layout.json';
import { mergeObjects, mergeStationLists } from './merge.js';

/** @param {Record<string, any>} globbed @returns {[string, any][]} */
const entries = (globbed) => Object.entries(globbed).map(([p, mod]) => [p.split('/').pop() ?? p, mod.default ?? mod]);

const balance = mergeObjects(entries(import.meta.glob('./balance/*.json', { eager: true })), 'balance');
const strings = mergeObjects(entries(import.meta.glob('./strings/es/*.json', { eager: true })), 'strings');
const stations = mergeStationLists(entries(import.meta.glob('./stations/*.json', { eager: true })));

const layout = { ...layoutGeometry, stations };

// Real-world datasets (embedded snapshots, NOT live): real/<name>.json → gameData.real.<name>
const real = Object.fromEntries(
  entries(import.meta.glob('./real/*.json', { eager: true })).map(([file, data]) => [file.replace(/\.json$/, ''), data]),
);

export const gameData = { resources, balance, events, layout, strings, real };
