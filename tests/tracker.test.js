import { describe, it, expect } from 'vitest';
import { SolarTracker } from '../src/systems/SolarTracker.js';
import { gameData } from '../src/data/index.js';
import { newSim, runTicks } from './helpers/sim.js';

const cfg = gameData.balance.tracker;

describe('Sun tracker for the solar field (spec §2.6)', () => {
  it('cosine law: full output facing the sun, none at 90° or at night', () => {
    const sim = newSim({ events: [] });
    const tr = sim.solarTracker;
    expect(SolarTracker.sunAngle(9)).toBe(-45);
    expect(tr.factor(9, -45)).toBeCloseTo(1);
    expect(tr.factor(12, 0)).toBeCloseTo(1);
    expect(tr.factor(9, 45)).toBeCloseTo(0);
    expect(tr.factor(9, 0)).toBeCloseTo(Math.SQRT1_2);
    expect(tr.factor(2, 0)).toBe(0);
    expect(tr.factor(12, 90)).toBe(0); // stowed edge-on
  });

  it('manual buttons step the target, clamp at ±60° and the panels slew towards it', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('game:start');
    for (let i = 0; i < 9; i++) sim.bus.emit('solar:turn', { dir: -1 });
    expect(sim.solarTracker.targetDeg).toBe(-cfg.maxDeg);
    runTicks(sim, 5);
    expect(sim.solarTracker.angleDeg).toBeCloseTo(-5 * cfg.slewDegPerMin);
    runTicks(sim, 60);
    expect(sim.solarTracker.angleDeg).toBe(-cfg.maxDeg);
  });

  it('AUTO follows the sun and its motor draws power; a full AUTO day beats fixed panels', () => {
    const energy = (/** @type {boolean} */ auto) => {
      const sim = newSim({ events: [], balance: { dust: { calmLossPerSol: 0 } } });
      if (auto) sim.bus.emit('solar:auto', { on: true });
      sim.bus.emit('game:start');
      let kwh = 0;
      for (let i = 0; i < 1440; i++) {
        sim.step();
        kwh += (sim.power.generationKw - sim.power.cfg.rtgKw) / 60;
      }
      return { kwh, sim };
    };
    const fixed = energy(false);
    const auto = energy(true);
    expect(auto.kwh).toBeGreaterThan(fixed.kwh * 1.4);
    const sim = newSim({ events: [] });
    sim.bus.emit('solar:auto', { on: true });
    sim.bus.emit('game:start');
    runTicks(sim, 4 * 60); // 10:00
    expect(sim.solarTracker.angleDeg).toBeCloseTo(-30, 0);
    expect(sim.solarTracker.demandKw(sim.time.clock())).toBe(cfg.autoKw);
  });

  it('AUTO stops when the relay is open', () => {
    const sim = newSim({ events: [] });
    /** @type {any[]} */
    const rejected = [];
    sim.bus.on('solar:rejected', (e) => rejected.push(e));
    sim.bus.emit('solar:auto', { on: true });
    sim.bus.emit('game:start');
    runTicks(sim, 60);
    sim.power.trip(sim.time.tick, { guided: true });
    runTicks(sim, 1);
    const frozen = sim.solarTracker.angleDeg;
    runTicks(sim, 60);
    expect(sim.solarTracker.angleDeg).toBe(frozen);
    expect(rejected).toEqual([{ reason: 'tracker' }]);
  });

  it('PROTEGER: stowed panels produce nothing and collect much less storm dust', () => {
    const storm = [{ id: 's', day: 1, time: '06:00', type: 'storm', durationHours: 10 }];
    const run = (/** @type {boolean} */ stow) => {
      const sim = newSim({ events: storm });
      if (stow) sim.bus.emit('solar:stow', { on: true });
      sim.bus.emit('game:start');
      runTicks(sim, 9 * 60);
      return sim;
    };
    const open = run(false);
    const stowed = run(true);
    expect(stowed.solarTracker.stowed).toBe(true);
    expect(stowed.power.generationKw).toBeCloseTo(stowed.power.cfg.rtgKw);
    expect(1 - stowed.power.dustFactor).toBeLessThan((1 - open.power.dustFactor) * 0.4);
  });
});
