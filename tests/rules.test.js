import { describe, it, expect } from 'vitest';
import { newSim, runTicks } from './helpers/sim.js';
import { idlePolicy, greedyPolicy, runSession } from './helpers/policies.js';

describe('Life support and health', () => {
  it('critical oxygen damages health with cause suffocation', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('breaker:toggle', { circuitId: 'lifeSupport', on: false });
    sim.resources.get('oxygen').value = 14;
    sim.bus.emit('game:start');
    runTicks(sim, 60);
    expect(sim.resources.value('health')).toBeLessThan(91);
    expect(sim.crew.activeCauses.suffocation).toBeGreaterThan(0);
  });

  it('health regenerates when nothing is critical and does not with food at 0', () => {
    const sim = newSim({ events: [] });
    sim.resources.get('health').value = 50;
    sim.bus.emit('game:start');
    runTicks(sim, 60);
    expect(sim.resources.value('health')).toBeCloseTo(52, 1);

    const starving = newSim({ events: [] });
    starving.resources.get('health').value = 50;
    starving.resources.get('food').value = 0;
    starving.bus.emit('game:start');
    runTicks(starving, 60);
    expect(starving.resources.value('health')).toBeCloseTo(48, 1);
  });

  it('thermostat setpoint is clamped to 16–22 °C', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('thermostat:set', { setpointC: 5 });
    expect(sim.lifeSupport.setpointC).toBe(16);
  });

  it('filter swap consumes a spare filter', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('filter:swap');
    expect(sim.inventory.filters).toBe(2);
    expect(sim.lifeSupport.filterFraction).toBe(1);
  });
});

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

describe('Win / lose (spec §5, §10)', () => {
  it('idle player loses by powerLoss on day 1 around 15:00', () => {
    const result = runSession(newSim(), idlePolicy);
    expect(result?.reason).toBe('powerLoss');
    expect(result?.day).toBe(1);
    expect(result?.hour).toBe(15);
  });

  it('reaching tick 10080 alive wins', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('game:start');
    sim.time.tick = sim.time.totalTicks - 1;
    sim.step();
    expect(sim.phase).toBe('won');
    expect(sim.game.result?.reason).toBe('survived');
  });

  it('greedy everything-on play loses before the end', () => {
    const result = runSession(newSim(), greedyPolicy);
    expect(result?.reason).not.toBe('survived');
  });
});
