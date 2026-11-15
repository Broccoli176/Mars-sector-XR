// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
import { describe, it, expect } from 'vitest';
import { benchStep, isBroken, scopeTrace } from '../src/rooms/hub/electronicsRules.js';
import { psuOutput } from '../src/systems/Electronics.js';
import { gameData } from '../src/data/index.js';

const cfg = gameData.balance.electronics;
const slot = (/** @type {any} */ over) => ({ id: 'X', kind: 'diode', partId: '1N4007', reversed: false, soldered: true, health: 'ok', ...over });
const healthy = cfg.slots.map((/** @type {any} */ s) => slot({ id: s.id, kind: s.kind, partId: s.partId }));
/** @type {Record<string, string>} */
const defaults = Object.fromEntries(cfg.slots.map((/** @type {any} */ s) => [s.id, s.partId]));
/** Healthy board with per-slot overrides. @param {Record<string, any>} over */
const board = (over) => healthy.map((/** @type {any} */ s) => ({ ...s, ...over[s.id] }));
const ctx = { output: psuOutput(healthy, cfg.circuit, cfg.parts) };

describe('electronics bench: guided repair', () => {
  it('a healthy board needs nothing, scanned or not', () => {
    expect(benchStep(healthy, defaults, false)).toEqual({ step: 'ok' });
    expect(benchStep(healthy, defaults, true)).toEqual({ step: 'ok' });
  });

  it('a dried capacitor: scan first, then pull out C1', () => {
    const b = board({ C1: { health: 'dried' } });
    expect(benchStep(b, defaults, false).step).toBe('scan');
    expect(benchStep(b, defaults, true)).toEqual({ step: 'remove', slotId: 'C1' });
  });

  it('an empty slot asks for its original part', () => {
    expect(benchStep(board({ D2: { partId: null } }), defaults, true)).toEqual({ step: 'insert', slotId: 'D2', partId: '1N4007' });
  });

  it('broken parts are removed before empty slots are filled', () => {
    expect(benchStep(board({ D1: { partId: null }, D3: { health: 'open' } }), defaults, true)).toEqual({ step: 'remove', slotId: 'D3' });
  });

  it('a loose good part only needs soldering', () => {
    expect(benchStep(board({ C1: { soldered: false } }), defaults, true)).toEqual({ step: 'solder', slotId: 'C1' });
  });

  it('a decoy or reversed part counts as broken', () => {
    expect(isBroken(slot({ partId: '1N4148' }), '1N4007')).toBe(true);
    expect(isBroken(slot({ reversed: true }), '1N4007')).toBe(true);
    expect(isBroken(slot({}), '1N4007')).toBe(false);
    expect(benchStep(board({ C1: { partId: 'C1000u6V' } }), defaults, true)).toEqual({ step: 'remove', slotId: 'C1' });
  });

  it('the cards offered are the original parts of the slots', () => {
    for (const s of cfg.slots) expect(cfg.bench.cards).toContain(s.partId);
  });

  it('scope trace: the filtered output stays within the ripple band; off is flat 0', () => {
    const { input, output } = scopeTrace(ctx.output, cfg.circuit);
    expect(Math.max(...input)).toBeCloseTo(cfg.circuit.acPeakV, 0);
    expect(Math.max(...output)).toBeCloseTo(ctx.output.vdcPeak, 1);
    expect(Math.max(...output) - Math.min(...output)).toBeLessThanOrEqual(ctx.output.rippleVpp + 1e-6);
    const off = scopeTrace({ ...ctx.output, mode: 'off', vdcPeak: 0, rippleVpp: 0 }, cfg.circuit);
    expect(Math.max(...off.output)).toBe(0);
  });
});
