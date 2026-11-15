// @ts-check
import { describe, it, expect } from 'vitest';
import { MaintenanceRover } from '../src/systems/MaintenanceRover.js';
import { MissionDirector } from '../src/systems/MissionDirector.js';
import { Simulation } from '../src/systems/Simulation.js';
import { gameData } from '../src/data/index.js';

describe('Maintenance Rover (MARS-CLEANER) & Mission Director', () => {
  it('maintains absolute independence from the exploration rover (Rover.js)', () => {
    const sim = new Simulation({
      resources: structuredClone(gameData.resources),
      balance: structuredClone(gameData.balance),
      events: structuredClone(gameData.events),
      real: gameData.real,
    });

    expect(sim.rover).toBeDefined();
    expect(sim.cleaner).toBeDefined();

    const initialRoverBattery = sim.rover?.batteryWh;
    const initialCleanerBattery = sim.cleaner.batteryWh;

    // Dispatch MARS-CLEANER to clean panels 0 and 1
    sim.bus.emit('cleaner:dispatch', { panels: [0, 1] });
    expect(sim.cleaner.status).toBe('traveling');
    expect(sim.cleaner.targets).toEqual([1]);
    expect(sim.cleaner.currentTargetIdx).toBe(0);

    // Advance simulation
    sim.step();
    sim.step();

    // Exploration rover remains 100% untouched
    expect(sim.rover?.batteryWh).toBe(initialRoverBattery);
    expect(sim.rover?.mode).toBe('docked');
    expect(sim.rover?.odometerM).toBe(0);

    // Cleaner rover consumed its own battery
    expect(sim.cleaner.batteryWh).toBeLessThan(initialCleanerBattery);
  });

  it('MARS-CLEANER cleans panels and recovers PowerGrid dustFactor', () => {
    const sim = new Simulation({
      resources: structuredClone(gameData.resources),
      balance: structuredClone(gameData.balance),
      events: structuredClone(gameData.events),
      real: gameData.real,
    });

    // Make panels dirty
    sim.power.dustFactor = 0.6;
    expect(sim.power.dustFactor).toBe(0.6);

    // Dispatch to clean panels 0, 1, 2
    sim.cleaner.dispatch([0, 1, 2]);
    expect(sim.cleaner.status).toBe('traveling');

    // Simulate ticks until cleaning is performed
    for (let i = 0; i < 40; i++) {
      sim.step();
    }

    // Panel cleaning must have improved dustFactor
    expect(sim.power.dustFactor).toBeGreaterThan(0.6);
  });

  it('MARS-CLEANER charges from the base grid when docked without affecting exploration rover', () => {
    const sim = new Simulation({
      resources: structuredClone(gameData.resources),
      balance: structuredClone(gameData.balance),
      events: structuredClone(gameData.events),
      real: gameData.real,
    });

    // Drain cleaner battery slightly
    sim.cleaner.batteryWh = 1800;
    expect(sim.cleaner.chargeKw()).toBe(0.3);

    const roverBatteryBefore = sim.rover?.batteryWh;

    // Simulate charging tick
    sim.step();

    expect(sim.cleaner.batteryWh).toBeGreaterThan(1800);
    // Exploration rover battery remains untouched
    expect(sim.rover?.batteryWh).toBe(roverBatteryBefore);
  });

  it('MissionDirector creates dynamic objectives based on real telemetry without duplicates', () => {
    const sim = new Simulation({
      resources: structuredClone(gameData.resources),
      balance: structuredClone(gameData.balance),
      events: structuredClone(gameData.events),
      real: gameData.real,
    });

    expect(sim.missionDirector).toBeDefined();

    // Drain base battery to critical level (< 15 kWh)
    const currentPower = sim.resources.value('power');
    sim.resources.add('power', 10.0 - currentPower);
    sim.step();

    const activeMissions = sim.missionDirector.getActiveMissions();
    expect(activeMissions.some((m) => m.id === 'mission_power_saving')).toBe(true);

    // Antirebound: running more steps does not duplicate active mission
    sim.step();
    sim.step();
    const powerMissions = sim.missionDirector.getActiveMissions().filter((m) => m.id === 'mission_power_saving');
    expect(powerMissions.length).toBe(1);

    // Recover power (> 15 kWh)
    const nowPower = sim.resources.value('power');
    sim.resources.add('power', 40.0 - nowPower);
    sim.step();
    expect(sim.missionDirector.getActiveMissions().some((m) => m.id === 'mission_power_saving')).toBe(false);
  });
});
