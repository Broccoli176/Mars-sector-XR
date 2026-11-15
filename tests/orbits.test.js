import { describe, it, expect } from 'vitest';
import { earthMars } from '../src/systems/orbits.js';
import { gameData } from '../src/data/index.js';
import { newSim, runTicks } from './helpers/sim.js';

const orbits = gameData.real.orbits;

describe('Earth–Mars geometry (JPL elements) vs JPL Horizons', () => {
  it('matches Horizons distance (< 0.1 %) and elongation (< 0.2°) on the reference dates', () => {
    for (const h of orbits.horizonsCheck) {
      const g = earthMars(Date.parse(h.utc), orbits);
      expect(Math.abs(g.distanceAu - h.distanceAu) / h.distanceAu, h.utc).toBeLessThan(0.001);
      expect(Math.abs(g.elongationDeg - h.elongationDeg), h.utc).toBeLessThan(0.2);
      if (h.lightMin) expect(g.lightMin).toBeCloseTo(h.lightMin, 1);
    }
  });

  it('the game starts with the real 2026-11-14 delay (~11 min) and detects the 2028 solar conjunction', () => {
    const sim = newSim({ events: [] });
    expect(sim.comms.geometry.lightMin).toBeGreaterThan(10.9);
    expect(sim.comms.geometry.lightMin).toBeLessThan(11.2);
    expect(sim.comms.conjunction).toBe(false);
    expect(earthMars(Date.parse('2028-03-20T00:00:00Z'), orbits).elongationDeg).toBeLessThan(gameData.balance.comms.conjunctionDeg);
  });
});

describe('Comms: messages from Earth travel at the speed of light', () => {
  it('delivers a mission message after the light time, stamped with send time and delay', () => {
    const sim = newSim({ events: [] });
    /** @type {any[]} */
    const got = [];
    sim.bus.on('comms:message', (e) => got.push(e));
    sim.bus.emit('game:start'); // queues the day-1 briefing
    expect(got).toHaveLength(0);
    runTicks(sim, sim.comms.delayTicks - 1);
    expect(got).toHaveLength(0);
    runTicks(sim, 2);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ key: 'comms.daily.d1', sentHour: 6, sentMinute: 0, delayMin: sim.comms.delayTicks });
  });

  it('holds messages while the signal is below 20 % and delivers them when the link returns', () => {
    const sim = newSim({ events: [] });
    /** @type {string[]} */
    const log = [];
    sim.bus.on('comms:message', (e) => log.push(e.key));
    sim.bus.on('comms:linkLost', (e) => log.push(`lost:${e.reason}`));
    sim.bus.on('comms:linkRestored', () => log.push('restored'));
    sim.bus.emit('game:start');
    sim.bus.emit('breaker:toggle', { circuitId: 'telecom', on: false }); // no power ⇒ signal 0
    runTicks(sim, 60);
    expect(log).toEqual(['lost:signal']);
    expect(sim.comms.inTransit().count).toBe(1);
    sim.bus.emit('breaker:toggle', { circuitId: 'telecom', on: true });
    runTicks(sim, 2);
    expect(log).toEqual(['lost:signal', 'restored', 'comms.daily.d1']);
  });

  it('scripted forecasts go through the delayed link too', () => {
    const sim = newSim({ events: [{ id: 'x', day: 1, time: '08:00', type: 'storm', durationHours: 1, warnLeadHours: 1 }] });
    /** @type {any[]} */
    const got = [];
    sim.bus.on('comms:message', (e) => got.push(e));
    sim.bus.emit('game:start');
    runTicks(sim, 60 + sim.comms.delayTicks + 1);
    const forecast = got.find((e) => e.key === 'comms.storm.forecast');
    expect(forecast).toMatchObject({ sentHour: 7, sentMinute: 0, hour: 7, minute: sim.comms.delayTicks });
  });
});
