import { describe, it, expect } from 'vitest';
import { newSim, runTicks } from './helpers/sim.js';

describe('Telecom system (Persona B)', () => {
  it('initializes with nominal signal and alignment', () => {
    const sim = newSim({ events: [] });
    expect(sim.telecom).toBeDefined();
    expect(sim.telecom.alignment).toBeCloseTo(0.95);
    expect(sim.resources.value('signal')).toBe(95);
  });

  it('drifts alignment during a storm', () => {
    const sim = newSim({ events: [] });
    sim.power.stormActive = true;
    sim.bus.emit('game:start');
    runTicks(sim, 60);
    expect(sim.telecom.alignment).toBeLessThan(0.95);
  });

  it('aligns antenna upon antenna:align intent', () => {
    const sim = newSim({ events: [] });
    sim.telecom.alignment = 0.5;
    sim.bus.emit('antenna:align');
    expect(sim.telecom.alignment).toBeCloseTo(0.65);
  });

  it('loses signal when telecom breaker is turned off', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('game:start');
    sim.bus.emit('breaker:toggle', { circuitId: 'telecom', on: false });
    runTicks(sim, 1);
    expect(sim.resources.value('signal')).toBe(0);
  });

  it('caps signal when antenna_motor is damaged', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('game:start');
    sim.bus.emit('component:damaged', { componentId: 'antenna_motor' });
    runTicks(sim, 1);
    expect(sim.telecom.motorBroken).toBe(true);
    expect(sim.resources.value('signal')).toBeLessThanOrEqual(25);
  });
});
