import { describe, it, expect } from 'vitest';
import { newSim, runTicks } from './helpers/sim.js';

/** Fresh sim with a custom rover map (no rocks/sand unless given). @param {any} [rover] */
const sim = (rover = {}) => {
  const s = newSim({ events: [], balance: { rover: { rocks: [], sand: [], ...rover } } });
  s.bus.emit('game:start');
  return s;
};
/** @param {any} s @param {string} type */
const collect = (s, type) => {
  /** @type {any[]} */
  const list = [];
  s.bus.on(type, (/** @type {any} */ e) => list.push(e));
  return list;
};
/** Issue a command and let it finish (1 game hour). @param {any} s @param {string} cmd */
const run = (s, cmd, ticks = 60) => {
  s.bus.emit('rover:command', { cmd });
  runTicks(s, ticks);
};

describe('Rover (Perseverance-class teleoperation)', () => {
  it('drives 10 m per «forward» at 152 m/h and turns 30° per «right»', () => {
    const s = sim();
    s.bus.emit('rover:command', { cmd: 'forward' });
    runTicks(s, 2); // 2 game minutes ≈ 5 m
    expect(s.rover.y).toBeCloseTo((152 * 2) / 60, 3);
    runTicks(s, 10);
    expect(s.rover.y).toBeCloseTo(10, 6);
    expect(s.rover.docked).toBe(false);
    run(s, 'right');
    expect((s.rover.heading * 180) / Math.PI).toBeCloseTo(30, 6);
    run(s, 'forward');
    expect(s.rover.x).toBeCloseTo(5, 6);
  });

  it('hazard cameras stop it in front of a rock', () => {
    const s = sim({ rocks: [{ x: 0, y: 14, r: 4 }] });
    const stops = collect(s, 'rover:stopped');
    run(s, 'forward');
    run(s, 'forward');
    expect(stops.at(-1)).toEqual({ reason: 'obstacle' });
    expect(s.rover.y).toBeLessThan(14 - 4 - 1.5 + 1e-6);
  });

  it('gets stuck in sand: forward is refused, «back» frees it', () => {
    const s = sim({ sand: [{ x: 0, y: 20, r: 5 }] });
    const rejected = collect(s, 'rover:rejected');
    run(s, 'forward');
    run(s, 'forward');
    expect(s.rover.mode).toBe('stuck');
    run(s, 'forward');
    expect(rejected.at(-1)).toEqual({ cmd: 'forward', reason: 'stuck' });
    run(s, 'back');
    expect(s.rover.stuck).toBe(false);
  });

  it('needs the Telecom link: below 20 % signal commands are rejected', () => {
    const s = sim();
    const rejected = collect(s, 'rover:rejected');
    s.bus.emit('breaker:toggle', { circuitId: 'telecom', on: false });
    runTicks(s, 1);
    run(s, 'forward');
    expect(rejected[0]).toEqual({ cmd: 'forward', reason: 'noLink' });
    expect(s.rover.y).toBe(0);
  });

  it('driving drains the battery; with no charge left it is stranded until the MMRTG recovers it', () => {
    const s = sim();
    run(s, 'forward');
    expect(s.rover.batteryWh).toBeLessThan(2000 - 10 * 4 + 60);
    s.rover.batteryWh = 5;
    s.rover.docked = false;
    s.rover.x = 50;
    run(s, 'forward', 5);
    expect(s.rover.mode).toBe('stranded');
    runTicks(s, 5 * 60); // MMRTG 110 W − 60 W load = +50 Wh/h → 200 Wh after 4 h
    expect(s.rover.stranded).toBe(false);
  });

  it('salvage brought back to base becomes spares; cores count as science', () => {
    const s = sim({ sites: [{ id: 'debris', kind: 'salvage', nameKey: 'rover.site.backshell', x: 0, y: 20, spares: 1 }, { id: 'rock', kind: 'core', nameKey: 'rover.site.seitah', x: 0, y: 30 }] });
    const delivered = collect(s, 'rover:delivered');
    const spares0 = s.resources.value('spares');
    run(s, 'forward');
    run(s, 'forward');
    run(s, 'sample', 90);
    run(s, 'forward');
    run(s, 'sample', 90);
    expect(s.rover.cargo).toHaveLength(2);
    run(s, 'sample');
    for (let i = 0; i < 6; i++) run(s, 'back');
    expect(s.rover.docked).toBe(true);
    expect(delivered[0]).toEqual({ cores: 1, spares: 1 });
    expect(s.resources.value('spares')).toBe(spares0 + 1);
    expect(s.rover.delivered.cores).toBe(1);
  });

  it('a docked rover with a low battery asks the repairBay circuit for power', () => {
    const s = sim();
    s.rover.batteryWh = 1000;
    runTicks(s, 1);
    expect(s.power.demand.repairBay).toBeCloseTo(0.4);
    runTicks(s, 60);
    expect(s.rover.batteryWh).toBeGreaterThan(1000 + 400);
    s.rover.batteryWh = 2000;
    runTicks(s, 1);
    expect(s.power.demand.repairBay).toBe(0);
  });
});
