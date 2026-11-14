import { isInFailZone } from './ResourceManager.js';

/**
 * Player health (SIMULATION_SPEC §4): damage from critical/fail zones, regen, dominant cause.
 */
export class Crew {
  /**
   * @param {any} cfg balance.health
   * @param {number} ticksPerHour
   * @param {import('./ResourceManager.js').ResourceManager} resources
   * @param {import('mitt').Emitter<any>} bus
   */
  constructor(cfg, ticksPerHour, resources, bus) {
    this.cfg = cfg;
    this.resources = resources;
    this.bus = bus;
    this.windowTicks = cfg.causeWindowHours * ticksPerHour;
    /** @type {Record<string, number>[]} damage per cause for each recent tick */
    this.history = [];
    /** @type {Record<string, number>} cause → damage per hour this tick */
    this.activeCauses = {};
    this.activeKey = '';
  }

  /** @param {number} dtHours */
  update(dtHours) {
    const rm = this.resources;
    /** @type {Record<string, number>} */
    const causes = {};
    for (const rule of this.cfg.damage) {
      const r = rm.get(rule.resource);
      let perHour = 0;
      if (rule.zeroPerHour !== undefined) {
        if (r.value <= 0) perHour = rule.zeroPerHour;
      } else if (isInFailZone(r)) {
        perHour = rule.failPerHour;
      } else if (r.status === 'critical') {
        perHour = rule.criticalPerHour;
      }
      if (perHour > 0) causes[rule.cause] = (causes[rule.cause] ?? 0) + perHour;
    }

    const damage = Object.values(causes).reduce((a, b) => a + b, 0);
    const blocked = this.cfg.regenBlockers.some((id) => rm.get(id).status === 'critical');
    const canRegen = !blocked && rm.value('food') > 0 && rm.value('water') > 0;
    rm.addRate('health', (canRegen ? this.cfg.regenPerHour : 0) - damage);

    /** @type {Record<string, number>} */
    const tickDamage = {};
    for (const [cause, perHour] of Object.entries(causes)) tickDamage[cause] = perHour * dtHours;
    this.history.push(tickDamage);
    if (this.history.length > this.windowTicks) this.history.shift();

    const key = Object.keys(causes).sort().join(',');
    if (key !== this.activeKey) {
      this.activeKey = key;
      for (const [cause, ratePerHour] of Object.entries(causes)) this.bus.emit('crew:damage', { cause, ratePerHour });
    }
    this.activeCauses = causes;
  }

  /** Cause with the most damage over the recent window. */
  dominantCause() {
    /** @type {Record<string, number>} */
    const totals = {};
    for (const entry of this.history) {
      for (const [cause, dmg] of Object.entries(entry)) totals[cause] = (totals[cause] ?? 0) + dmg;
    }
    let best = 'suffocation';
    let bestValue = -1;
    for (const [cause, value] of Object.entries(totals)) {
      if (value > bestValue) {
        best = cause;
        bestValue = value;
      }
    }
    return best;
  }
}
