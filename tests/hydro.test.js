// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
import { describe, it, expect } from 'vitest';
import { newSim, runTicks } from './helpers/sim.js';

/** @param {any} sim */
const collect = (sim, /** @type {string} */ type) => {
  /** @type {any[]} */
  const out = [];
  sim.bus.on(type, (/** @type {any} */ e) => out.push(e));
  return out;
};

describe('Hydroponics trays', () => {
  it('the starting lettuce is ready on day 2 at 06:00 without watering, and spoils 12 h later', () => {
    const sim = newSim({ events: [], balance: { lifeSupport: { initialFilterFraction: 1 } } });
    const ready = collect(sim, 'food:ready');
    sim.bus.emit('game:start');
    runTicks(sim, 1440);
    expect(sim.food.tray('tray_1').ready).toBe(true);
    expect(ready.find((e) => e.trayId === 'tray_1')).toEqual({ trayId: 'tray_1', cropId: 'lettuce' });
    const spoiled = collect(sim, 'food:spoiled');
    runTicks(sim, 12 * 60);
    expect(spoiled[0]).toMatchObject({ trayId: 'tray_1', reason: 'unharvested' });
    expect(sim.food.tray('tray_1').cropId).toBeNull();
  });

  it('sows only on empty trays', () => {
    const sim = newSim({ events: [] });
    const rejected = collect(sim, 'hydro:rejected');
    sim.bus.emit('hydro:sow', { trayId: 'tray_2', cropId: 'quinoa' });
    expect(sim.food.tray('tray_2').cropId).toBe('quinoa');
    sim.bus.emit('hydro:sow', { trayId: 'tray_1', cropId: 'tomato' });
    expect(sim.food.tray('tray_1').cropId).toBe('lettuce');
    expect(rejected[0]).toEqual({ trayId: 'tray_1', reason: 'notEmpty' });
  });

  it('watering raises moisture and takes water from the tank (excess spills)', () => {
    const sim = newSim({ events: [] });
    const before = sim.resources.value('water');
    const tray = sim.food.tray('tray_2');
    sim.bus.emit('hydro:water', { trayId: 'tray_2', liters: 0.4 });
    expect(tray.moisture).toBeCloseTo(0.5 + 0.4 / 2);
    expect(sim.resources.value('water')).toBeCloseTo(before - 0.4);
    sim.bus.emit('hydro:water', { trayId: 'tray_2', liters: 5 });
    expect(tray.moisture).toBe(1);
  });

  it('a dry tray dies of thirst, a flooded one rots, and one without power dies of darkness', () => {
    const dry = newSim({ events: [] });
    const dryEvents = collect(dry, 'food:spoiled');
    dry.food.tray('tray_1').moisture = 0.1;
    dry.bus.emit('game:start');
    runTicks(dry, 6 * 60);
    expect(dryEvents[0]).toMatchObject({ trayId: 'tray_1', reason: 'noWater' });

    const flooded = newSim({ events: [] });
    const floodEvents = collect(flooded, 'food:spoiled');
    flooded.bus.emit('hydro:water', { trayId: 'tray_1', liters: 2 });
    flooded.bus.emit('game:start');
    // A slow drinker stays above floodAt (0.85) for the whole 6 h rot clock.
    flooded.food.crops.lettuce.drinkPerHour = 0.01;
    runTicks(flooded, 6 * 60);
    expect(floodEvents[0]).toMatchObject({ trayId: 'tray_1', reason: 'overwatered' });

    const dark = newSim({ events: [] });
    const darkEvents = collect(dark, 'food:spoiled');
    dark.bus.emit('breaker:toggle', { circuitId: 'hydro', on: false });
    dark.bus.emit('game:start');
    runTicks(dark, 6 * 60);
    expect(darkEvents[0]).toMatchObject({ trayId: 'tray_1', reason: 'noLight' });
  });

  it('harvest adds that crop\'s kcal and leaves the tray empty for the next sowing', () => {
    const sim = newSim({ events: [] });
    const harvested = collect(sim, 'food:harvested');
    const tray = sim.food.tray('tray_1');
    tray.growthHours = 35.99;
    sim.bus.emit('game:start');
    runTicks(sim, 1);
    expect(tray.ready).toBe(true);
    const food = sim.resources.value('food');
    sim.bus.emit('food:harvest', { trayId: 'tray_1' });
    expect(sim.resources.value('food')).toBeCloseTo(food + 700);
    expect(harvested[0]).toEqual({ trayId: 'tray_1', cropId: 'lettuce', kcal: 700 });
    expect(tray.cropId).toBeNull();
  });

  it('the spirulina bioreactor grows and makes O₂ only under light', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('game:start');
    runTicks(sim, 16 * 60); // 06:00 → 22:00, lights on
    expect(sim.food.bioreactor.ready).toBe(true);
    expect(sim.food.bioreactor.o2Total).toBeCloseTo(0.3 * 16, 1);
    const food = sim.resources.value('food');
    sim.bus.emit('food:harvest', { trayId: 'bioreactor' });
    expect(sim.resources.value('food')).toBeCloseTo(food + 300);
    expect(sim.food.bioreactor.ready).toBe(false);

    const dark = newSim({ events: [] });
    dark.bus.emit('breaker:toggle', { circuitId: 'hydro', on: false });
    dark.bus.emit('game:start');
    runTicks(dark, 16 * 60);
    expect(dark.food.bioreactor.growthHours).toBe(0);
  });
});
