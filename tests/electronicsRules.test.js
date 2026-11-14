// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
import { describe, it, expect } from 'vitest';
import { meterReading, isReversed, scopeTrace } from '../src/rooms/hub/electronicsRules.js';
import { psuOutput } from '../src/systems/Electronics.js';
import { gameData } from '../src/data/index.js';

const cfg = gameData.balance.electronics;
const slot = (/** @type {any} */ over) => ({ id: 'X', kind: 'diode', partId: '1N4007', reversed: false, soldered: true, health: 'ok', ...over });
const healthy = cfg.slots.map((/** @type {any} */ s) => slot({ id: s.id, kind: s.kind, partId: s.partId }));
const ctx = { parts: cfg.parts, circuit: cfg.circuit, output: psuOutput(healthy, cfg.circuit, cfg.parts) };

describe('electronics bench rules', () => {
  it('diode test: good 0.62 V, open or reversed OL, short 0.00 V; wrong mode shows nothing', () => {
    expect(meterReading('diode', { type: 'slot', slot: slot({}) }, ctx)).toBe('0.62 V');
    expect(meterReading('diode', { type: 'slot', slot: slot({ health: 'open' }) }, ctx)).toBe('OL');
    expect(meterReading('diode', { type: 'slot', slot: slot({ reversed: true }) }, ctx)).toBe('OL');
    expect(meterReading('diode', { type: 'slot', slot: slot({ health: 'short' }) }, ctx)).toBe('0.00 V');
    expect(meterReading('cap', { type: 'slot', slot: slot({}) }, ctx)).toBe('—');
  });

  it('capacitance: a good 470 µF reads ≈461, a dried one the configured value', () => {
    const c1 = slot({ kind: 'cap', partId: 'C470u25V' });
    expect(meterReading('cap', { type: 'slot', slot: c1 }, ctx)).toBe('461 µF');
    expect(meterReading('cap', { type: 'slot', slot: { ...c1, health: 'dried' } }, ctx)).toBe(`${cfg.circuit.driedUF} µF`);
  });

  it('voltage at test points: AC rms in, DC average after the filter, 5 V out', () => {
    expect(meterReading('volt', { type: 'tp', id: 'TP1' }, ctx)).toBe('12.0 V~');
    expect(meterReading('volt', { type: 'tp', id: 'TP3' }, ctx)).toBe('5.00 V');
    const tp2 = parseFloat(meterReading('volt', { type: 'tp', id: 'TP2' }, ctx));
    expect(tp2).toBeGreaterThan(14);
    expect(tp2).toBeLessThan(15.6);
  });

  it('orientation from the axis dot product', () => {
    expect(isReversed({ x: 1, y: 0, z: 0 }, { x: 0.9, y: 0.1, z: 0 })).toBe(false);
    expect(isReversed({ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(true);
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
