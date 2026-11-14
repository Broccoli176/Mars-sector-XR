// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
import { describe, it, expect } from 'vitest';
import { moistureState, nextSeed, soilColor, moistureBar, createWaterBatcher } from '../src/rooms/hydro/hydroRules.js';
import { gameData } from '../src/data/index.js';

const cfg = { dryAt: 0.2, floodAt: 0.85 };

describe('hydro presentation rules', () => {
  it('classifies moisture into dry / ok / flooded', () => {
    expect(moistureState(0.1, cfg)).toBe('dry');
    expect(moistureState(0.5, cfg)).toBe('ok');
    expect(moistureState(0.95, cfg)).toBe('flooded');
  });

  it('cycles seeds and wraps around', () => {
    expect(nextSeed(['a', 'b', 'c'], 'a')).toBe('b');
    expect(nextSeed(['a', 'b', 'c'], 'c')).toBe('a');
  });

  it('soil darkens when wet and turns bluish when flooded', () => {
    const dry = soilColor(0, cfg);
    const wet = soilColor(0.85, cfg);
    const flood = soilColor(1, cfg);
    expect(wet[0]).toBeLessThan(dry[0]);
    expect(flood[2]).toBeGreaterThan(wet[2]);
    expect(moistureBar(0.6)).toBe('▮▮▮▮▮▮▯▯▯▯');
  });

  it('batches hose water per tray and flushes on aim change or stop', () => {
    /** @type {[string, number][]} */
    const sent = [];
    const b = createWaterBatcher({ flow: 0.25, flushEvery: 0.25 }, (id, l) => sent.push([id, l]));
    b.update('tray_1', 0.1);
    b.update('tray_1', 0.2); // 0.3 s ⇒ flush 0.075 L
    b.update('tray_2', 0.1); // aim changed ⇒ flush the rest of tray_1 (none) and start tray_2
    b.stop();
    expect(sent.map(([id]) => id)).toEqual(['tray_1', 'tray_2']);
    expect(sent[0][1]).toBeCloseTo(0.075);
    expect(sent[1][1]).toBeCloseTo(0.025);
  });

  it('every sowable crop has a Spanish name and NASA/CSA real data where claimed', () => {
    for (const c of gameData.balance.food.crops) expect(gameData.strings[`real.crop.${c.id}`], c.id).toBeDefined();
    const nasa = gameData.real.bioregen_crops;
    expect(nasa.quinoa.url).toMatch(/^https:\/\/ntrs\.nasa\.gov\/citations\//);
    for (const u of nasa.spirulina.urls) expect(u).toMatch(/^https:\/\/ntrs\.nasa\.gov\/citations\//);
  });
});
