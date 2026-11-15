// Scripted player policies for headless runs (tests + scripts/simulate.js).
// They act only through bus intents, like the VR presentation does.
import { bestRecipe } from '../../src/rooms/hydro/kitchenRules.js';

/** @param {import('../../src/systems/Simulation.js').Simulation} sim */
export function idlePolicy(sim) {
  void sim;
}

/** Keeps every breaker on and only resets the relay / harvests. */
export function greedyPolicy(sim) {
  if (sim.power.relayTripped && !sim.power.relayBurned) sim.bus.emit('relay:resetRequest');
  if (sim.lifeSupport.filterLifeHours <= 0.25 && sim.inventory.filters > 0) sim.bus.emit('filter:swap');
  if (sim.food.anyReady) {
    sim.bus.emit('food:harvest');
    sim.bus.emit('kitchen:eat'); // eats the harvest raw, never processes
  }
  // Greedy gardener: always lettuce, and floods a tray whenever it looks dry.
  for (const tray of sim.food.trays) {
    if (!tray.cropId) sim.bus.emit('hydro:sow', { trayId: tray.id, cropId: 'lettuce' });
    else if (tray.moisture < 0.25) sim.bus.emit('hydro:water', { trayId: tray.id, liters: 2 });
  }
}

/** Resets, swaps, harvests and sheds load by battery level and weather. */
export function competentPolicy(sim) {
  const { bus, power, lifeSupport, food, resources } = sim;
  if (power.relayTripped && !power.relayBurned) bus.emit('relay:resetRequest');
  if (lifeSupport.filterLifeHours <= 0.25 && sim.inventory.filters > 0) bus.emit('filter:swap');
  if (food.anyReady) bus.emit('food:harvest');
  tendTrays(sim);
  cook(sim);
  repairReceiver(sim);
  if (resources.value('oxygen') < 20) {
    for (const [valveId, used] of Object.entries(lifeSupport.o2TanksUsed)) {
      if (!used) {
        bus.emit('valve:turn', { valveId, open: true });
        break;
      }
    }
  }

  // Solar storm: stay in the Personal shelter while the real rate is dangerous.
  const shelter = Boolean(sim.radiation?.shelterNeeded);
  if (sim.radiation && sim.radiation.sheltered !== shelter) bus.emit('crew:shelter', { inside: shelter });
  // Sun tracker: AUTO normally, panels stowed edge-on while a dust storm blows.
  const tracker = sim.solarTracker;
  if (tracker) {
    const want = power.stormActive ? 'stow' : 'auto';
    if (tracker.mode !== want) bus.emit(want === 'stow' ? 'solar:stow' : 'solar:auto', { on: true });
  }
  // Clean the panels once the storm is over and enough dust has settled.
  if (!power.stormActive && power.dustFactor < 0.9 && resources.value('power') > 2) bus.emit('solar:clean');

  const battery = resources.value('power');
  setBreaker(sim, 'telecom', !power.stormActive && battery > 30);
  setBreaker(sim, 'lighting', battery > 25);
  setBreaker(sim, 'hydro', battery > 2);
  const setpoint = battery < 20 || power.stormActive ? 16 : 21;
  if (lifeSupport.setpointC !== setpoint) bus.emit('thermostat:set', { setpointC: setpoint });
}

/** @param {any} sim @param {string} circuitId @param {boolean} on */
function setBreaker(sim, circuitId, on) {
  if (sim.power.breakers[circuitId] !== on) sim.bus.emit('breaker:toggle', { circuitId, on });
}

/**
 * Runs a full session with a policy applied every tick.
 * @param {any} sim @param {(sim: any) => void} policy @param {number} [maxTicks]
 */
export function runSession(sim, policy, maxTicks = sim.time.totalTicks + 1) {
  sim.bus.emit('game:start');
  while (sim.phase === 'playing' && sim.time.tick < maxTicks) {
    policy(sim);
    sim.step();
  }
  return sim.game.result;
}

/**
 * Competent gardener: sows the crop with the best kcal per hour that can still be harvested before the end
 * (day 8 06:00), and waters each tray back to ≈ 0.6 when it drops below 0.4 during lit hours.
 * @param {any} sim
 */
function tendTrays(sim) {
  const { food, bus, time } = sim;
  const clock = time.clock();
  const hoursLeft = (8 - clock.day) * 24 + (6 - clock.hourFloat);
  for (const tray of food.trays) {
    if (!tray.cropId) {
      const fits = Object.values(food.crops)
        .filter((/** @type {any} */ c) => c.growthHours * 1.25 < hoursLeft)
        .sort((/** @type {any} */ a, /** @type {any} */ b) => b.kcal / b.growthHours - a.kcal / a.growthHours)[0];
      if (fits) bus.emit('hydro:sow', { trayId: tray.id, cropId: fits.id });
    } else if (tray.moisture < 0.4 && food.lightsScheduled) {
      bus.emit('hydro:water', { trayId: tray.id, liters: (0.6 - tray.moisture) * food.cfg.trayCapacityL });
    }
  }
}

/**
 * Competent cook: processes the best recipe while there is battery to spare, and eats raw whatever
 * is about to spoil and cannot be processed.
 * @param {any} sim
 */
function cook(sim) {
  const kitchen = sim.kitchen;
  if (!kitchen || kitchen.pantry.length === 0) return;
  const best = bestRecipe(kitchen);
  if (best && !kitchen.busy && sim.power.served.hydro && sim.resources.value('power') > 5) {
    if (kitchen.selected !== best) sim.bus.emit('kitchen:select', { recipeId: best });
    sim.bus.emit('kitchen:process');
    return;
  }
  const oldest = kitchen.pantry[0];
  if (oldest.ageHours >= kitchen.cfg.rawShelfHours - 1) sim.bus.emit('kitchen:eat');
}

/**
 * Competent technician: replaces every bad part of the Telecom receiver supply with the right one
 * (desolder → remove → insert, correct orientation → solder).
 * @param {any} sim
 */
function repairReceiver(sim) {
  const el = sim.electronics;
  if (!el || el.output.quality === 'ok') return;
  const right = { diode: '1N4007', cap: 'C470u25V' };
  for (const s of el.slots) {
    if (s.partId === right[s.kind] && s.health === 'ok' && !s.reversed && s.soldered) continue;
    const partId = right[s.kind];
    if ((el.stock[partId] ?? 0) <= 0) continue;
    if (s.partId && s.soldered) sim.bus.emit('electronics:heat', { slotId: s.id });
    if (s.partId) sim.bus.emit('electronics:remove', { slotId: s.id });
    sim.bus.emit('electronics:insert', { slotId: s.id, partId, reversed: false });
    sim.bus.emit('electronics:heat', { slotId: s.id });
  }
}
