// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
import { describe, it, expect } from 'vitest';
import { Radiation } from '../src/systems/Radiation.js';
import { gameData } from '../src/data/index.js';
import { newSim, runTicks } from './helpers/sim.js';

const fixture = {
  day: '2023-01-01',
  mars: {
    summary: { meanUGyPerHour: 6 },
    samples: [
      { t: '2023-01-01T00:10:00', uGyPerHour: 5 },
      { t: '2023-01-01T12:00:00', uGyPerHour: 7 },
    ],
  },
  iss: { summary: { medianUGyPerHour: 4.7 } },
};

describe('Radiation replay (real MSL RAD data)', () => {
  it('maps the time of day to the last real sample, wrapping around midnight', () => {
    const r = new Radiation(fixture);
    expect(r.rateAt(0)).toBe(7); // before 00:10 → previous day's last sample
    expect(r.rateAt(10)).toBe(5);
    expect(r.rateAt(11 * 60)).toBe(5);
    expect(r.rateAt(12 * 60)).toBe(7);
  });

  it('accumulates dose in µGy from the replayed rate', () => {
    const r = new Radiation(fixture);
    r.update({ hour: 1, minute: 0 }, 2); // 5 µGy/h × 2 h
    expect(r.doseMicroGy).toBeCloseTo(10);
    expect(r.issTypical).toBe(4.7);
  });

  it('runs inside the simulation from the embedded snapshot and never touches health', () => {
    expect(gameData.real.radlab.mars.samples.length).toBeGreaterThan(50);
    const sim = newSim({ events: [] });
    sim.bus.emit('game:start');
    runTicks(sim, 60);
    expect(sim.radiation).not.toBeNull();
    expect(sim.radiation.doseMicroGy).toBeGreaterThan(3); // ≈ 5–8 µGy/h on the Mars surface
    expect(sim.radiation.doseMicroGy).toBeLessThan(10);
    expect(sim.resources.value('health')).toBe(100);
  });

  it('the simulation works without the snapshot (radiation disabled)', () => {
    const sim = newSim({ events: [] });
    const bare = new (/** @type {any} */ (sim.constructor))({
      resources: gameData.resources, balance: gameData.balance, events: [],
    });
    expect(bare.radiation).toBeNull();
  });
});
