import { describe, it, expect } from 'vitest';
import { gameData } from '../src/data/index.js';
import { newSim, runTicks } from './helpers/sim.js';

// Every player decision must cost something (docs/SIMULATION_SPEC.md §10).
describe('trade-offs', () => {
  it('lighting off: health stops regenerating', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('game:start');
    sim.resources.get('health').value = 50;
    runTicks(sim, 60);
    const lit = sim.resources.value('health');
    expect(lit).toBeCloseTo(50 + gameData.balance.health.regenPerHour, 1);
    expect(sim.crew.regenBlocked).toBeNull();

    sim.bus.emit('breaker:toggle', { circuitId: 'lighting', on: false });
    runTicks(sim, 60);
    expect(sim.resources.value('health')).toBeCloseTo(lit, 1);
    expect(sim.crew.regenBlocked).toBe('dark');
  });

  it('a cold room slows the crops but never kills them', () => {
    const { cold } = gameData.balance.food;
    const grow = (/** @type {number} */ celsius) => {
      const sim = newSim({ events: [] });
      sim.bus.emit('game:start');
      const tray = sim.food.trays[0];
      Object.assign(tray, { cropId: 'lettuce', growthHours: 0, ready: false, moisture: 0.6 });
      sim.resources.get('temperature').value = celsius;
      sim.step();
      return { growth: tray.growthHours, cold: sim.food.cold };
    };
    const warm = grow(cold.belowC + 3);
    const chilly = grow(cold.belowC - 1.5);
    expect(warm.cold).toBe(false);
    expect(chilly.cold).toBe(true);
    expect(chilly.growth).toBeCloseTo(warm.growth * cold.growthFactor);
    expect(chilly.growth).toBeGreaterThan(0);
  });

  it('a burned relay is replaced with a spare, and refused without one', () => {
    const sim = newSim({ events: [] });
    /** @type {string[]} */
    const seen = [];
    sim.bus.on('relay:rejected', (e) => seen.push(`rejected:${e.reason}`));
    sim.bus.on('system:repaired', (e) => seen.push(`repaired:${e.partId}`));
    sim.bus.on('relay:reset', () => seen.push('reset'));
    sim.power.relayTripped = true;
    sim.power.relayBurned = true;

    sim.resources.get('spares').value = 0;
    sim.bus.emit('relay:resetRequest');
    expect(sim.power.relayClosed).toBe(false);

    sim.resources.get('spares').value = 2;
    sim.bus.emit('relay:resetRequest');
    expect(sim.power.relayClosed).toBe(true);
    expect(sim.resources.value('spares')).toBe(2 - gameData.balance.power.relayRepairSpares);
    expect(seen).toEqual(['rejected:noSpare', 'repaired:relay_main', 'reset']);
  });

  it('cleaning the panels costs real battery and leaves dust behind, so stowing in a storm pays off', () => {
    const { dust, tracker } = gameData.balance;
    expect(dust.cleanKwh).toBeGreaterThanOrEqual(1);
    expect(dust.cleanRecovery).toBeLessThan(0.75);
    // Dust that a stowed field avoids in a storm hour must be worth more than what a later clean leaves behind.
    expect(tracker.stowDustFactor).toBeLessThan(1 - dust.cleanRecovery);
  });

  it('skipping the shelter in a solar storm outpaces regeneration by a wide margin', () => {
    const { radiation, health } = gameData.balance;
    expect(radiation.unshelteredDamagePerHour).toBeGreaterThanOrEqual(health.regenPerHour * 5);
  });
});
