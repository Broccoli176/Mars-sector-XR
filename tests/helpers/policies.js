// Scripted player policies for headless runs (tests + scripts/simulate.js).
// They act only through bus intents, like the VR presentation does.

/** @param {import('../../src/systems/Simulation.js').Simulation} sim */
export function idlePolicy(sim) {
  void sim;
}

/** Keeps every breaker on and only resets the relay / harvests. */
export function greedyPolicy(sim) {
  if (sim.power.relayTripped && !sim.power.relayBurned) sim.bus.emit('relay:resetRequest');
  if (sim.lifeSupport.filterLifeHours <= 0.25 && sim.inventory.filters > 0) sim.bus.emit('filter:swap');
  if (sim.food.ready) sim.bus.emit('food:harvest');
}

/** Resets, swaps, harvests and sheds load by battery level and weather. */
export function competentPolicy(sim) {
  const { bus, power, lifeSupport, food, resources } = sim;
  if (power.relayTripped && !power.relayBurned) bus.emit('relay:resetRequest');
  if (lifeSupport.filterLifeHours <= 0.25 && sim.inventory.filters > 0) bus.emit('filter:swap');
  if (food.ready) bus.emit('food:harvest');
  if (resources.value('oxygen') < 20) {
    for (const [valveId, used] of Object.entries(lifeSupport.o2TanksUsed)) {
      if (!used) {
        bus.emit('valve:turn', { valveId, open: true });
        break;
      }
    }
  }

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
