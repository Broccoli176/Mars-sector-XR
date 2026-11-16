// @ts-check
// SHARED (see docs/COLLABORATION.md): which faults and pending jobs the alert banner shows, and in which room.
// Pure and read-only: it only reads the simulation (no DOM, no Three.js). Tested in tests/alerts.test.js.

/**
 * @typedef {{ id: string, level: 'critical' | 'warning', roomId: string, key: string, params?: Record<string, string | number> }} Alert
 */

/**
 * Active faults (red) and pending jobs (amber), faults first. Each alert names the room where it is.
 * @param {any} sim Simulation
 * @param {{ filterLowHours: number }} cfg balance.alerts
 * @returns {Alert[]}
 */
export function activeAlerts(sim, cfg) {
  /** @type {Alert[]} */
  const out = [];
  const comps = Object.fromEntries((sim.balance.components ?? []).map((/** @type {any} */ c) => [c.id, c]));
  const roomOf = (/** @type {string} */ id, /** @type {string} */ fallback) => comps[id]?.room ?? fallback;

  // ---- Faults ----
  const power = sim.power;
  if (power.relayBurned) out.push({ id: 'relay_burned', level: 'critical', roomId: roomOf('relay_main', 'room_energy'), key: 'alert.relay_burned' });
  else if (power.relayTripped) out.push({ id: 'relay_tripped', level: 'critical', roomId: roomOf('relay_main', 'room_energy'), key: 'alert.relay_tripped' });

  const repairs = sim.repairs;
  for (const target of repairs ? [...repairs.broken] : []) {
    const comp = repairs.componentOf(target);
    if (!comp) continue;
    out.push({ id: `fault_${target}`, level: 'critical', roomId: roomOf(comp.id, 'room_hub'), key: `alert.fault.${comp.id}` });
  }
  if (sim.electronics && sim.electronics.output.quality !== 'ok') {
    out.push({ id: 'fault_rx_psu', level: 'critical', roomId: roomOf('rx_psu', 'room_hub'), key: 'alert.fault.rx_psu' });
  }

  // ---- Pending jobs ----
  const ls = sim.lifeSupport;
  if (ls.filterLifeHours <= cfg.filterLowHours) {
    out.push({ id: 'filter_low', level: 'warning', roomId: 'room_energy', key: ls.filterLifeHours <= 0 ? 'alert.filter_empty' : 'alert.filter_low', params: { left: sim.inventory.filters } });
  }
  const food = sim.food;
  const dryAt = sim.balance.food.dryAt;
  const thirsty = food.trays.filter((/** @type {any} */ t) => t.cropId && !t.ready && t.moisture < dryAt).length;
  if (thirsty > 0) out.push({ id: 'crop_dry', level: 'warning', roomId: 'room_hydro', key: 'alert.crop_dry', params: { n: thirsty } });
  if (food.anyReady) out.push({ id: 'crop_ready', level: 'warning', roomId: 'room_hydro', key: 'alert.crop_ready' });
  if (power.relayClosed) {
    const dark = power.order.filter((/** @type {string} */ id) => power.breakers[id] && !power.served[id]);
    if (dark.length > 0) out.push({ id: 'circuits_dark', level: 'warning', roomId: 'room_energy', key: 'alert.circuits_dark', params: { n: dark.length } });
  }
  return out;
}
