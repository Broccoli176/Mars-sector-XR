// @ts-check
/**
 * Hand-tool repairs (SIMULATION_SPEC §6.1, §9.3). Headless.
 *
 * A repair target is a broken component id (`antenna_motor`, `scrubber_fan`, …) or a hull leak id
 * (`hull_seal_*`, component `hull_seal`). Presentation sends `repair:work { componentId, seconds }` in small
 * batches while the player aims the right tool at it and holds the trigger; this system decides:
 * - the target must be broken, time must not be paused, the tool must be carried (Toolbelt) and a spare or a
 *   sealant charge must be available — otherwise `repair:rejected { componentId, reason }`;
 * - work accumulates in real seconds up to `holdSeconds` (× slower with low health), kept if the player lets go;
 * - on completion it consumes the spare / charge and emits `system:repaired { systemId, partId }`, or
 *   `leak:sealed { leakId }` for a leak. Other systems (LifeSupport, Telecom) clear their own state.
 */
export class Repairs {
  /**
   * @param {{ id: string, system: string, toolId: string, spares: number, charges?: number, holdSeconds: number }[]} components
   * @param {{ bus: import('mitt').Emitter<any>, resources: import('./ResourceManager.js').ResourceManager,
   *   inventory: Record<string, number>, time: { speed: number }, tools: import('./Toolbelt.js').Toolbelt,
   *   health?: { slowBelow: [number, number][] } }} ctx
   */
  constructor(components, ctx) {
    this.ctx = ctx;
    /** @type {Record<string, any>} */
    this.components = Object.fromEntries((components ?? []).map((c) => [c.id, c]));
    /** @type {Set<string>} broken targets (component ids and leak ids) */
    this.broken = new Set();
    /** @type {Record<string, number>} target → real seconds of work done */
    this.work = {};
    const { bus } = ctx;
    bus.on('component:damaged', (/** @type {any} */ e) => {
      if (e?.componentId && this.components[e.componentId]) this.broken.add(e.componentId);
    });
    bus.on('system:repaired', (/** @type {any} */ e) => {
      if (e?.partId) this.#clear(e.partId);
    });
    bus.on('leak:started', (/** @type {any} */ e) => {
      if (e?.leakId) this.broken.add(e.leakId);
    });
    bus.on('leak:sealed', (/** @type {any} */ e) => {
      if (e?.leakId) this.#clear(e.leakId);
    });
    bus.on('repair:work', (/** @type {any} */ e) => this.addWork(e?.componentId, Number(e?.seconds) || 0));
  }

  /** Component definition behind a target (leaks map to `hull_seal`). @param {string} targetId */
  componentOf(targetId) {
    if (this.components[targetId]) return this.components[targetId];
    if (targetId?.startsWith('hull_seal')) return this.components.hull_seal ?? null;
    return null;
  }

  /** @param {string} targetId */
  isBroken(targetId) {
    return this.broken.has(targetId);
  }

  /** Real seconds this repair takes now (slower when the player is hurt, spec §4). @param {string} targetId */
  holdSeconds(targetId) {
    const c = this.componentOf(targetId);
    if (!c) return Infinity;
    const health = this.ctx.resources.value('health');
    const factor = health < 25 ? 1.5 : health < 50 ? 1.25 : 1;
    return c.holdSeconds * factor;
  }

  /** 0..1 progress of a repair in course. @param {string} targetId */
  progress(targetId) {
    const total = this.holdSeconds(targetId);
    return Number.isFinite(total) ? Math.min(1, (this.work[targetId] ?? 0) / total) : 0;
  }

  /**
   * @param {string} targetId @param {number} seconds real seconds of tool work
   * @returns {'ok' | 'done' | 'notBroken' | 'paused' | 'noTool' | 'noSpare' | 'noCharge' | 'unknown'}
   */
  addWork(targetId, seconds) {
    const { bus, resources, inventory, time, tools } = this.ctx;
    const c = this.componentOf(targetId);
    const reject = (/** @type {'notBroken' | 'paused' | 'noTool' | 'noSpare' | 'noCharge'} */ reason) => {
      bus.emit('repair:rejected', { componentId: targetId, reason, ...(reason === 'noTool' ? { toolId: c?.toolId } : {}) });
      return reason;
    };
    if (!c) return 'unknown';
    if (!this.broken.has(targetId)) return reject('notBroken');
    if (time.speed === 0) return reject('paused');
    if (!tools.has(c.toolId)) return reject('noTool');
    if ((c.spares ?? 0) > 0 && resources.value('spares') < c.spares) return reject('noSpare');
    if ((c.charges ?? 0) > 0 && (inventory.sealantCharges ?? 0) < c.charges) return reject('noCharge');

    this.work[targetId] = (this.work[targetId] ?? 0) + Math.max(0, seconds);
    const progress = this.progress(targetId);
    bus.emit('repair:progress', { componentId: targetId, progress });
    if (progress < 1) return 'ok';

    if ((c.spares ?? 0) > 0) resources.add('spares', -c.spares);
    if ((c.charges ?? 0) > 0) inventory.sealantCharges -= c.charges;
    if (c.id === 'hull_seal') bus.emit('leak:sealed', { leakId: targetId });
    else bus.emit('system:repaired', { systemId: c.system, partId: c.id });
    return 'done';
  }

  /** @param {string} targetId */
  #clear(targetId) {
    this.broken.delete(targetId);
    delete this.work[targetId];
  }
}
