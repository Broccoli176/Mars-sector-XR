// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
import { describe, it, expect } from 'vitest';
import { psuOutput } from '../src/systems/Electronics.js';
import { newSim, runTicks } from './helpers/sim.js';
import { gameData } from '../src/data/index.js';

const cfg = gameData.balance.electronics;
/** Healthy board, with optional per-slot overrides. @param {Record<string, any>} [over] */
const board = (over = {}) =>
  cfg.slots.map((/** @type {any} */ s) => ({ id: s.id, kind: s.kind, partId: s.partId, reversed: false, soldered: true, health: 'ok', wearHours: 0, ...over[s.id] }));
const out = (/** @type {any} */ over) => psuOutput(board(over), cfg.circuit, cfg.parts);
/** @param {any} sim @param {string} type */
const collect = (sim, type) => {
  /** @type {any[]} */
  const list = [];
  sim.bus.on(type, (/** @type {any} */ e) => list.push(e));
  return list;
};
/** Desolder → remove → insert → solder. @param {any} sim @param {string} slotId @param {string} partId */
const replace = (sim, slotId, partId, reversed = false) => {
  sim.bus.emit('electronics:heat', { slotId });
  sim.bus.emit('electronics:remove', { slotId });
  sim.bus.emit('electronics:insert', { slotId, partId, reversed });
  sim.bus.emit('electronics:heat', { slotId });
};

describe('Receiver power supply model (bridge + filter + regulator)', () => {
  it('healthy board: full wave, small ripple, 5 V out, no signal cap', () => {
    const o = out();
    expect(o.mode).toBe('full');
    expect(o.vdcPeak).toBeCloseTo(15.6);
    expect(o.rippleVpp).toBeCloseTo(0.1 / (100 * 470e-6)); // I / (2 f C) ≈ 2.1 V
    expect(o.vout).toBe(5);
    expect(o.signalCap).toBeNull();
  });

  it('an open diode leaves half a bridge: half-wave and double ripple', () => {
    const o = out({ D3: { health: 'open' } });
    expect(o.mode).toBe('half');
    expect(o.rippleVpp).toBeCloseTo(0.1 / (50 * 470e-6));
    expect(o.quality).toBe('half');
  });

  it('a shorted or reversed diode, or a reversed capacitor, opens the fuse: 0 V', () => {
    expect(out({ D2: { health: 'short' } }).mode).toBe('off');
    expect(out({ D1: { reversed: true } }).mode).toBe('off');
    expect(out({ C1: { reversed: true } }).mode).toBe('off');
    expect(out({ D2: { health: 'short' } }).signalCap).toBe(0);
  });

  it('a dried capacitor gives noise; a 10 µF one or no capacitor cannot hold the regulator up', () => {
    expect(out({ C1: { health: 'dried' } }).quality).toBe('noisy');
    expect(out({ C1: { partId: 'C10u25V' } }).quality).toBe('brownout');
    expect(out({ C1: { partId: null } }).quality).toBe('brownout');
    expect(out({ C1: { soldered: false } }).quality).toBe('brownout'); // a loose part makes no contact
  });
});

describe('Electronics in the simulation', () => {
  it('guided fault on day 2 10:00 dries C1 and caps the Telecom signal', () => {
    const sim = newSim({ events: [] });
    const damaged = collect(sim, 'component:damaged');
    sim.bus.emit('game:start');
    runTicks(sim, 28 * 60 + 1); // day 1 06:00 → day 2 10:01
    expect(sim.electronics.slot('C1').health).toBe('dried');
    expect(damaged[0]).toMatchObject({ componentId: 'rx_psu', slotId: 'C1', signalCap: 60 });
    expect(sim.resources.value('signal')).toBeLessThanOrEqual(60);
  });

  it('a dust storm surge shorts a diode (signal 0)', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('weather:changed', { state: 'dustStorm', solarFactor: 0.3 });
    expect(sim.electronics.output.mode).toBe('off');
    sim.bus.emit('game:start');
    runTicks(sim, 1);
    expect(sim.resources.value('signal')).toBe(0);
  });

  it('repair flow: desolder, remove, insert the right part, solder ⇒ system:repaired and full signal', () => {
    const sim = newSim({ events: [] });
    const repaired = collect(sim, 'system:repaired');
    sim.electronics.damage({ slotId: 'C1', health: 'dried', reason: 'test' });
    sim.bus.emit('electronics:remove', { slotId: 'C1' }); // still soldered → rejected
    expect(sim.electronics.slot('C1').partId).toBe('C470u25V');
    replace(sim, 'C1', 'C470u25V');
    expect(sim.electronics.output.quality).toBe('ok');
    expect(repaired.at(-1)).toEqual({ systemId: 'telecom_rx', partId: 'rx_psu' });
    expect(sim.electronics.stock.C470u25V).toBe(1);
    sim.bus.emit('game:start');
    runTicks(sim, 1);
    expect(sim.resources.value('signal')).toBe(95);
  });

  it('repairing the receiver does not repair the antenna motor (and vice versa)', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('component:damaged', { componentId: 'antenna_motor', reason: 'test' });
    sim.electronics.damage({ slotId: 'D1', health: 'open', reason: 'test' });
    replace(sim, 'D1', '1N4007');
    expect(sim.telecom.motorBroken).toBe(true);
    expect(sim.telecom.rxCap).toBeNull();
  });

  it('wrong parts: a reversed diode kills the output, weak diodes and low-voltage capacitors fail with use', () => {
    const sim = newSim({ events: [] });
    replace(sim, 'D4', '1N4007', true);
    expect(sim.electronics.output.mode).toBe('off');
    replace(sim, 'D4', '1N4148');
    replace(sim, 'C1', 'C1000u6V');
    expect(sim.electronics.output.quality).toBe('ok'); // works… for now
    sim.bus.emit('game:start');
    runTicks(sim, 2 * 60);
    expect(sim.electronics.slot('D4').health).toBe('open');
    expect(sim.electronics.slot('C1').health).toBe('dried');
    expect(sim.electronics.output.quality).not.toBe('ok');
  });

  it('rejects inserts into an occupied slot, of the wrong kind or without stock', () => {
    const sim = newSim({ events: [] });
    const rejected = collect(sim, 'electronics:rejected');
    sim.bus.emit('electronics:insert', { slotId: 'C1', partId: 'C470u25V' });
    sim.bus.emit('electronics:heat', { slotId: 'C1' });
    sim.bus.emit('electronics:remove', { slotId: 'C1' });
    sim.bus.emit('electronics:insert', { slotId: 'C1', partId: '1N4007' });
    sim.electronics.stock.C470u25V = 0;
    sim.bus.emit('electronics:insert', { slotId: 'C1', partId: 'C470u25V' });
    expect(rejected.map((r) => r.reason)).toEqual(['occupied', 'wrongKind', 'noStock']);
  });
});
