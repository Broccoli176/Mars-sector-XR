import { describe, it, expect } from 'vitest';
import { newSim, runTicks } from './helpers/sim.js';

describe('PowerGrid', () => {
  it('serves circuits by priority when the battery is empty', () => {
    const sim = newSim({ events: [] });
    sim.resources.get('power').value = 0;
    sim.bus.emit('game:start');
    // Night: only the RTG (0.5 kW). Life support wants 0.8 kW at most.
    sim.time.tick = 20 * 60; // day 1, 02:00
    sim.resources.get('oxygen').value = 90;
    sim.resources.get('co2').value = 800;
    sim.step();
    expect(sim.power.generationKw).toBeCloseTo(0.5);
    expect(sim.power.served.lifeSupport).toBe(false);
    expect(sim.power.served.lighting).toBe(true);
  });

  it('trips the relay after 5 ticks above the bus limit and burns it on the 3rd trip', () => {
    const sim = newSim({ events: [], balance: { power: { busLimitKw: 0.1 } } });
    sim.bus.emit('game:start');
    runTicks(sim, 5);
    expect(sim.power.relayTripped).toBe(true);
    expect(sim.power.served.heating).toBe(false);

    sim.bus.emit('relay:resetRequest');
    runTicks(sim, 5);
    sim.bus.emit('relay:resetRequest');
    runTicks(sim, 5);
    expect(sim.power.relayBurned).toBe(true);
  });

  it('a guided trip does not count toward burning the relay', () => {
    const sim = newSim({ events: [] });
    sim.power.trip(0, { guided: true });
    expect(sim.power.tripTicks).toHaveLength(0);
    expect(sim.power.guidedTrip).toBe(true);
    sim.bus.emit('relay:resetRequest');
    expect(sim.power.relayClosed).toBe(true);
  });

  it('daily balance matches the reconciled budget (spec §2.3)', () => {
    const run = (/** @type {string[]} */ off) => {
      const sim = newSim({ events: [], balance: { lifeSupport: { initialFilterFraction: 1 } } });
      for (const id of off) sim.bus.emit('breaker:toggle', { circuitId: id, on: false });
      sim.bus.emit('game:start');
      const start = sim.resources.value('power');
      runTicks(sim, 1440);
      return sim.resources.value('power') - start;
    };
    const essentials = run(['telecom', 'hydro']);
    const everything = run([]);
    expect(essentials).toBeGreaterThan(1);
    expect(essentials).toBeLessThan(6);
    expect(everything).toBeLessThan(-10);
    expect(everything).toBeGreaterThan(-16);
  });
});
