// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
import { describe, it, expect } from 'vitest';
import { newSim, runTicks } from './helpers/sim.js';
import { nextRecipe, freshnessLines, bestRecipe } from '../src/rooms/hydro/kitchenRules.js';

/** @param {any} sim @param {string} type */
const collect = (sim, type) => {
  /** @type {any[]} */
  const out = [];
  sim.bus.on(type, (/** @type {any} */ e) => out.push(e));
  return out;
};

/** Sim at 06:00 day 1 (lights on) with these crops already harvested into the pantry. @param {string[]} items */
function withPantry(items) {
  const sim = newSim({ events: [] });
  sim.bus.emit('game:start');
  for (const id of items) {
    const kcal = id === 'spirulina' ? 300 : sim.food.crops[id].kcal;
    sim.bus.emit('food:harvested', { trayId: 'tray_1', cropId: id, kcal });
  }
  return sim;
}

describe('Kitchen: pantry + food processor', () => {
  it('stores harvests as raw lots with their kind', () => {
    const sim = withPantry(['soybean', 'carrot', 'lettuce']);
    expect(sim.kitchen.stock).toEqual({ protein: 1, carb: 1, fresh: 1 });
  });

  it('an energy bar turns soybean + carrot into (1500 + 2200) × 1.4 kcal after 2 lit hours', () => {
    const sim = withPantry(['soybean', 'carrot']);
    const done = collect(sim, 'kitchen:done');
    sim.bus.emit('kitchen:select', { recipeId: 'bar_energy' });
    expect(sim.kitchen.previewKcal('bar_energy')).toBe(5180);
    sim.bus.emit('kitchen:process');
    expect(sim.kitchen.pantry).toHaveLength(0);
    expect(sim.kitchen.wants().hydro).toBeCloseTo(0.3);
    runTicks(sim, 119);
    expect(done).toHaveLength(0);
    const food = sim.resources.value('food');
    runTicks(sim, 1);
    expect(done[0]).toEqual({ recipeId: 'bar_energy', kcal: 5180 });
    // +5180 from the bar, minus one tick of crew consumption.
    expect(sim.resources.value('food')).toBeCloseTo(food + 5180 - sim.balance.food.consumptionPerHour / 60, 0);
    expect(sim.kitchen.bars.bar_energy).toBe(1);
    expect(sim.kitchen.busy).toBe(false);
  });

  it('rejects an empty pantry, missing ingredients and a busy processor', () => {
    const empty = withPantry([]);
    const r0 = collect(empty, 'kitchen:rejected');
    empty.bus.emit('kitchen:process');
    expect(r0[0]).toMatchObject({ reason: 'empty' });

    const sim = withPantry(['soybean', 'carrot', 'quinoa']);
    const rejected = collect(sim, 'kitchen:rejected');
    sim.bus.emit('kitchen:select', { recipeId: 'ration_fresh' });
    sim.bus.emit('kitchen:process');
    expect(rejected[0]).toEqual({ recipeId: 'ration_fresh', reason: 'missing' });
    expect(sim.kitchen.missing('ration_fresh')).toEqual({ fresh: 2 });
    sim.bus.emit('kitchen:select', { recipeId: 'bar_energy' });
    sim.bus.emit('kitchen:process');
    sim.bus.emit('kitchen:select', { recipeId: 'bar_single' });
    sim.bus.emit('kitchen:process');
    expect(rejected[1]).toEqual({ recipeId: 'bar_single', reason: 'busy' });
  });

  it('pauses without power on the hydro circuit and keeps its progress', () => {
    const sim = withPantry(['soybean', 'carrot']);
    sim.bus.emit('kitchen:process');
    runTicks(sim, 60);
    sim.bus.emit('breaker:toggle', { circuitId: 'hydro', on: false });
    runTicks(sim, 180);
    expect(sim.kitchen.job.progressHours).toBeCloseTo(1, 1);
    sim.bus.emit('breaker:toggle', { circuitId: 'hydro', on: true });
    const done = collect(sim, 'kitchen:done');
    runTicks(sim, 61);
    expect(done).toHaveLength(1);
  });

  it('raw lots spoil after rawShelfHours; eating raw gives 100 % kcal without power', () => {
    const sim = withPantry(['lettuce']);
    const spoiled = collect(sim, 'kitchen:spoiled');
    runTicks(sim, sim.balance.kitchen.rawShelfHours * 60);
    expect(spoiled).toEqual([{ itemId: 'lettuce', kcal: 700 }]);
    expect(sim.kitchen.pantry).toHaveLength(0);

    const eat = withPantry(['tomato', 'carrot']);
    eat.bus.emit('breaker:toggle', { circuitId: 'hydro', on: false });
    const eaten = collect(eat, 'kitchen:eaten');
    const food = eat.resources.value('food');
    eat.bus.emit('kitchen:eat');
    expect(eaten[0]).toEqual({ kcal: 4000 });
    expect(eat.resources.value('food')).toBeCloseTo(food + 4000);
  });
});

describe('kitchenRules', () => {
  it('cycles recipes and picks the best one that can be made', () => {
    const sim = withPantry(['soybean', 'quinoa', 'carrot']);
    const ids = sim.kitchen.recipes.map((/** @type {any} */ r) => r.id);
    expect(nextRecipe(ids, ids[ids.length - 1])).toBe(ids[0]);
    expect(bestRecipe(sim.kitchen)).toBe('bar_energy');
    expect(bestRecipe(withPantry(['lettuce']).kitchen)).toBeNull();
  });

  it('groups pantry lots by item with the time left before the oldest spoils', () => {
    const sim = withPantry(['soybean', 'soybean', 'lettuce']);
    runTicks(sim, 60);
    expect(freshnessLines(sim.kitchen.pantry, 36)).toEqual([
      { itemId: 'soybean', count: 2, hoursLeft: 35 },
      { itemId: 'lettuce', count: 1, hoursLeft: 35 },
    ]);
  });
});
