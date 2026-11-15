import { describe, it, expect } from 'vitest';
import { newSim, runTicks } from './helpers/sim.js';

describe('Telecom system (spec §3.8)', () => {
  it('initializes with nominal signal and alignment', () => {
    const sim = newSim({ events: [] });
    expect(sim.telecom).toBeDefined();
    expect(sim.telecom.alignment).toBe(1);
    expect(sim.resources.value('signal')).toBe(95);
    sim.bus.emit('game:start');
    runTicks(sim, 1);
    expect(sim.resources.value('signal')).toBe(95); // 95 × 100 % alignment
  });

  it('drifts alignment during a storm', () => {
    const sim = newSim({ events: [] });
    sim.power.stormActive = true;
    sim.bus.emit('game:start');
    runTicks(sim, 60);
    expect(sim.telecom.alignment).toBeCloseTo(0.98, 5); // −2 points per hour
  });

  it('aligns antenna upon antenna:align intent', () => {
    const sim = newSim({ events: [] });
    sim.telecom.alignment = 0.5;
    sim.telecom.angle = 12.5;
    sim.bus.emit('antenna:align');
    expect(sim.telecom.alignment).toBe(1); // realigning restores 100 %
    expect(sim.telecom.angle).toBe(0);
    expect(sim.resources.value('signal')).toBe(95);
  });

  it('turns the antenna in steps and updates signal immediately', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('antenna:turnRight');
    expect(sim.telecom.angle).toBe(2.5);
    expect(sim.telecom.alignment).toBeCloseTo(1 - 2.5 / 35);
    expect(sim.resources.value('signal')).toBe(88);

    sim.bus.emit('antenna:turnLeft');
    expect(sim.telecom.angle).toBe(0);
    expect(sim.resources.value('signal')).toBe(95);
  });

  it('clamps antenna movement and rejects turns when the motor is broken', () => {
    const sim = newSim({ events: [] });
    for (let i = 0; i < 30; i++) sim.bus.emit('antenna:turnRight');
    expect(sim.telecom.angle).toBe(45);

    sim.bus.emit('component:damaged', { componentId: 'antenna_motor' });
    sim.bus.emit('antenna:turnLeft');
    expect(sim.telecom.angle).toBe(45);
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
    expect(sim.resources.value('signal')).toBeLessThanOrEqual(40);
  });
});

describe('Telecom ← receiver power supply (hub electronics bench)', () => {
  it('a faulty receiver supply caps the signal and its repair restores it without touching the antenna motor', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('component:damaged', { componentId: 'rx_psu', reason: 'test', signalCap: 45 });
    sim.bus.emit('game:start');
    runTicks(sim, 1);
    expect(sim.resources.value('signal')).toBe(45);
    sim.bus.emit('system:repaired', { systemId: 'telecom_rx', partId: 'rx_psu' });
    runTicks(sim, 1);
    expect(sim.resources.value('signal')).toBe(95);
    expect(sim.telecom.motorBroken).toBe(false);
  });
});
