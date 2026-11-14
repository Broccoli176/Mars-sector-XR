/**
 * Single owner of all resource state (AGENTS.md §3, §4.1).
 * Systems only call addRate (per in-game hour, applied on commit) or add (instant change).
 */
export class ResourceManager {
  /**
   * @param {Record<string, any>} defs resources.json
   * @param {import('mitt').Emitter<any>} bus
   */
  constructor(defs, bus) {
    this.bus = bus;
    /** @type {Record<string, any>} */
    this.resources = {};
    /** @type {Record<string, number>} */
    this.pendingRates = {};
    for (const [id, d] of Object.entries(defs)) {
      const r = {
        id,
        value: d.start,
        min: d.min,
        max: d.max,
        unit: d.unit,
        ratePerHour: 0,
        status: 'nominal',
        direction: d.direction,
        warnAt: d.warnAt,
        criticalAt: d.criticalAt,
        failAt: d.failAt,
      };
      r.status = computeStatus(r);
      this.resources[id] = r;
      this.pendingRates[id] = 0;
    }
  }

  /** @param {string} id */
  get(id) {
    const r = this.resources[id];
    if (!r) throw new Error(`Unknown resource: ${id}`);
    return r;
  }

  /** @param {string} id */
  value(id) {
    return this.get(id).value;
  }

  /** @param {string} id @param {number} perHour */
  addRate(id, perHour) {
    this.get(id);
    this.pendingRates[id] += perHour;
  }

  /** Instant change (O₂ tank, harvest…). @param {string} id @param {number} delta */
  add(id, delta) {
    const r = this.get(id);
    this.#setValue(r, r.value + delta);
  }

  /** Applies accumulated rates for one tick. @param {number} dtHours */
  commit(dtHours) {
    for (const r of Object.values(this.resources)) {
      const rate = this.pendingRates[r.id];
      r.ratePerHour = rate;
      this.pendingRates[r.id] = 0;
      if (rate !== 0) this.#setValue(r, r.value + rate * dtHours);
    }
  }

  /** @param {any} r @param {number} v */
  #setValue(r, v) {
    const clamped = Math.min(r.max, Math.max(r.min, v));
    const changed = clamped !== r.value;
    r.value = clamped;
    const status = computeStatus(r);
    const statusChanged = status !== r.status;
    r.status = status;
    if (changed || statusChanged) {
      this.bus.emit('resource:changed', { id: r.id, value: r.value, ratePerHour: r.ratePerHour, status });
    }
    if (statusChanged && status === 'critical') {
      this.bus.emit('resource:critical', { id: r.id, value: r.value });
    }
  }
}

/** @param {any} r */
export function computeStatus(r) {
  if (r.direction === 'high') {
    if (r.value >= r.criticalAt) return 'critical';
    if (r.value >= r.warnAt) return 'warning';
    return 'nominal';
  }
  if (r.value <= r.criticalAt) return 'critical';
  if (r.value <= r.warnAt) return 'warning';
  return 'nominal';
}

/** @param {any} r */
export function isInFailZone(r) {
  if (r.failAt === undefined) return false;
  return r.direction === 'high' ? r.value >= r.failAt : r.value <= r.failAt;
}
