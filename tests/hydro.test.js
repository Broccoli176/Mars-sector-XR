// OWNER: user (Personal · Hydro · Hub) — see docs/COLLABORATION.md
import { describe, it, expect } from 'vitest';
import { newSim, runTicks } from './helpers/sim.js';

describe('Hydroponics', () => {
  it('first harvest is ready on day 2 at 06:00 and spoils 12 h later', () => {
    const sim = newSim({ events: [], balance: { lifeSupport: { initialFilterFraction: 1 } } });
    sim.bus.emit('game:start');
    runTicks(sim, 1440);
    expect(sim.food.ready).toBe(true);
    runTicks(sim, 12 * 60);
    expect(sim.food.ready).toBe(false);
    expect(sim.food.growthHours).toBeLessThan(1);
  });

  it('a crop dies after 6 h without power', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('breaker:toggle', { circuitId: 'hydro', on: false });
    let reason = '';
    sim.bus.on('food:spoiled', (e) => (reason = e.reason));
    sim.bus.emit('game:start');
    runTicks(sim, 6 * 60);
    expect(reason).toBe('noLight');
  });
});
