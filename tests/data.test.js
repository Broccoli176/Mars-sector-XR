// SHARED guard for the per-owner data split (docs/COLLABORATION.md).
import { describe, it, expect } from 'vitest';
import { gameData } from '../src/data/index.js';
import { mergeObjects, mergeStationLists } from '../src/data/merge.js';
import { stationBuilders } from '../src/ui/Stations.js';

describe('Per-owner data files', () => {
  it('merge rejects the same key in two files', () => {
    expect(() => mergeObjects([['a.json', { x: 1 }], ['b.json', { x: 2 }]], 'strings')).toThrow(/a\.json and b\.json/);
    expect(() => mergeStationLists([['a.json', [{ id: 's' }]], ['b.json', [{ id: 's' }]]])).toThrow(/a\.json and b\.json/);
  });

  it('strings, balance and stations load without clashes', () => {
    expect(Object.keys(gameData.strings).length).toBeGreaterThan(100);
    for (const section of ['time', 'power', 'circuits', 'lifeSupport', 'thermal', 'food', 'water', 'telecom', 'health', 'inventory', 'gameRules']) {
      expect(gameData.balance[section], section).toBeDefined();
    }
    expect(gameData.layout.stations.length).toBeGreaterThan(0);
  });

  it('every station points to an existing room and has a builder', () => {
    const rooms = new Set(gameData.layout.rooms.map((/** @type {any} */ r) => r.id));
    for (const s of gameData.layout.stations) {
      expect(rooms.has(s.room), `${s.id} → ${s.room}`).toBe(true);
      expect(typeof stationBuilders[s.id], `builder for ${s.id}`).toBe('function');
    }
  });

  it('every room sign uses an existing room and translated name', () => {
    const rooms = Object.fromEntries(gameData.layout.rooms.map((/** @type {any} */ r) => [r.id, r]));
    for (const sign of gameData.layout.signs) {
      expect(rooms[sign.room], sign.room).toBeDefined();
      expect(gameData.strings[rooms[sign.room].nameKey], rooms[sign.room].nameKey).toBeDefined();
    }
  });
});
