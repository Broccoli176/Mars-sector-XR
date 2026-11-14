// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Telecom receiver power supply (SIMULATION_SPEC §6.6): a real linear supply, repaired at the hub
// electronics bench. AC in → bridge of 4 diodes (D1–D4) → filter capacitor (C1) → 5 V regulator → receiver.
// Headless: no rendering imports. Presentation emits intents (electronics:heat/remove/insert).
import { TimeManager } from './TimeManager.js';

/**
 * @typedef {{ kind: 'diode', ratingA: number, labelKey: string } | { kind: 'cap', uF: number, ratedV: number, labelKey: string }} PartDef
 * @typedef {{ id: string, kind: 'diode' | 'cap', partId: string | null, reversed: boolean, soldered: boolean,
 *   health: 'ok' | 'open' | 'short' | 'dried', wearHours: number }} Slot
 * @typedef {{ mode: 'full' | 'half' | 'off', vdcPeak: number, rippleVpp: number, vmin: number, vout: number,
 *   quality: 'ok' | 'noisy' | 'half' | 'brownout' | 'off', signalCap: number | null }} PsuOutput
 */

/**
 * Pure model of the supply output from the slots (also used by the bench to draw the oscilloscope).
 * Full-wave ripple ≈ I / (2 f C), half-wave ≈ I / (f C) (capacitor-input filter approximation).
 * @param {Slot[]} slots @param {any} c balance.electronics.circuit @param {Record<string, PartDef>} parts
 * @returns {PsuOutput}
 */
export function psuOutput(slots, c, parts) {
  const off = /** @type {PsuOutput} */ ({ mode: 'off', vdcPeak: 0, rippleVpp: 0, vmin: 0, vout: 0, quality: 'off', signalCap: c.signalCaps.off });
  const diodes = slots.filter((s) => s.kind === 'diode');
  const cap = slots.find((s) => s.kind === 'cap');
  // A conducting part needs to be there AND soldered (a loose part makes no contact).
  const present = (/** @type {Slot} */ s) => s.partId !== null && s.soldered;

  // Shorted or reversed diode in a bridge: it shorts the transformer every half cycle → the PTC fuse opens.
  if (diodes.some((d) => present(d) && (d.health === 'short' || d.reversed))) return off;
  // Reversed or shorted electrolytic: it conducts (and vents) → fuse opens.
  if (cap && present(cap) && (cap.health === 'short' || cap.reversed)) return off;

  const working = diodes.filter((d) => present(d) && d.health === 'ok').length;
  // Each half cycle needs its pair: D1+D2 (positive) and D3+D4 (negative).
  const pos = ['D1', 'D2'].every((id) => diodes.some((d) => d.id === id && present(d) && d.health === 'ok'));
  const neg = ['D3', 'D4'].every((id) => diodes.some((d) => d.id === id && present(d) && d.health === 'ok'));
  if (working === 0 || (!pos && !neg)) return off;
  const mode = pos && neg ? 'full' : 'half';

  const vdcPeak = c.acPeakV - 2 * c.diodeDropV;
  let uF = 0;
  if (cap && present(cap) && cap.partId) {
    const def = /** @type {any} */ (parts[cap.partId]);
    uF = cap.health === 'dried' ? c.driedUF : cap.health === 'open' ? 0 : def.uF;
  }
  const f = mode === 'full' ? 2 * c.mainsHz : c.mainsHz;
  const rippleVpp = uF > 0 ? Math.min(vdcPeak, c.loadA / (f * uF * 1e-6)) : vdcPeak;
  const vmin = vdcPeak - rippleVpp;
  const brownout = vmin < c.regulatorV + c.regulatorDropoutV;
  const vout = brownout ? Math.max(0, vmin - c.regulatorDropoutV) : c.regulatorV;

  /** @type {PsuOutput['quality']} */
  let quality = 'ok';
  if (brownout) quality = 'brownout';
  else if (mode === 'half') quality = 'half';
  else if (rippleVpp > c.noisyRippleV) quality = 'noisy';
  const signalCap = quality === 'ok' ? null : c.signalCaps[quality];
  return { mode, vdcPeak, rippleVpp, vmin, vout, quality, signalCap };
}

export class Electronics {
  /**
   * @param {any} cfg balance.electronics
   * @param {any} timeCfg balance.time
   * @param {import('mitt').Emitter<any>} bus
   */
  constructor(cfg, timeCfg, bus) {
    this.cfg = cfg;
    this.bus = bus;
    /** @type {Record<string, PartDef>} */
    this.parts = cfg.parts;
    /** @type {Record<string, number>} */
    this.stock = { ...cfg.stock };
    /** @type {Slot[]} */
    this.slots = cfg.slots.map((/** @type {any} */ s) => ({
      id: s.id,
      kind: s.kind,
      partId: s.partId,
      reversed: false,
      soldered: true,
      health: 'ok',
      wearHours: 0,
    }));
    /** Scripted faults by tick (day/time from config). */
    this.scheduled = (cfg.faults.scheduled ?? []).map((/** @type {any} */ f) => ({ ...f, tick: TimeManager.tickOf(f.day, f.time, timeCfg), done: false }));
    this.output = psuOutput(this.slots, cfg.circuit, this.parts);
    /** @type {number | null} last cap reported to Telecom */
    this.reportedCap = null;

    bus.on('electronics:heat', (/** @type {any} */ e) => this.heat(e?.slotId));
    bus.on('electronics:remove', (/** @type {any} */ e) => this.remove(e?.slotId));
    bus.on('electronics:insert', (/** @type {any} */ e) => this.insert(e?.slotId, e?.partId, Boolean(e?.reversed)));
    bus.on('weather:changed', (/** @type {any} */ e) => {
      if (e?.state === 'dustStorm') this.damage(cfg.faults.dustStorm);
    });
    // Hook for Person B's space-weather incidents (DONKI CME snapshot): no-op until they emit it.
    bus.on('spaceWeather:impact', (/** @type {any} */ e) => {
      if (e?.kind === 'cme') this.damage(cfg.faults.cme);
    });
  }

  /** @param {string} id */
  slot(id) {
    return this.slots.find((s) => s.id === id) ?? null;
  }

  /** @param {{ slotId: string, health: Slot['health'], reason: string, hintKey?: string }} fault */
  damage(fault) {
    const s = fault && this.slot(fault.slotId);
    if (!s || !s.partId) return;
    s.health = fault.health;
    if (fault.hintKey) this.bus.emit('hint', { key: fault.hintKey });
    this.#recompute(fault.reason, s.id);
  }

  /** Soldering iron on a joint: melts it (part becomes removable) or solders a loose part. @param {string} slotId */
  heat(slotId) {
    const s = this.slot(slotId);
    if (!s || !s.partId) return;
    s.soldered = !s.soldered;
    this.#recompute('rework', s.id);
  }

  /** Pulls a desoldered part out (it goes to the scrap bin). @param {string} slotId */
  remove(slotId) {
    const s = this.slot(slotId);
    if (!s || !s.partId) return;
    if (s.soldered) {
      this.bus.emit('electronics:rejected', { slotId, reason: 'soldered' });
      return;
    }
    Object.assign(s, { partId: null, reversed: false, health: 'ok', wearHours: 0 });
    this.#recompute('removed', s.id);
  }

  /** New part from the bin into an empty slot (not soldered yet). @param {string} slotId @param {string} partId @param {boolean} reversed */
  insert(slotId, partId, reversed) {
    const s = this.slot(slotId);
    const def = this.parts[partId];
    if (!s || !def) return;
    /** @type {string | null} */
    let reason = null;
    if (s.partId) reason = 'occupied';
    else if (def.kind !== s.kind) reason = 'wrongKind';
    else if ((this.stock[partId] ?? 0) <= 0) reason = 'noStock';
    if (reason) {
      this.bus.emit('electronics:rejected', { slotId, partId, reason });
      return;
    }
    this.stock[partId]--;
    Object.assign(s, { partId, reversed, soldered: false, health: 'ok', wearHours: 0 });
    this.#recompute('inserted', s.id);
  }

  /** @param {number} tick @param {number} dtHours */
  update(tick, dtHours) {
    for (const f of this.scheduled) {
      if (!f.done && tick >= f.tick) {
        f.done = true;
        this.damage(f);
      }
    }
    // Wrong parts fail with use: weak diodes overheat (open), under-rated capacitors swell (dried).
    if (this.output.mode === 'off') return;
    const c = this.cfg.circuit;
    for (const s of this.slots) {
      if (!s.partId || !s.soldered || s.health !== 'ok') continue;
      const def = /** @type {any} */ (this.parts[s.partId]);
      const stressed = def.kind === 'diode' ? def.ratingA < c.diodePeakA : def.ratedV < this.output.vdcPeak;
      if (!stressed) continue;
      s.wearHours += dtHours;
      if (s.wearHours >= c.wrongPartFailHours) {
        s.health = def.kind === 'diode' ? 'open' : 'dried';
        this.bus.emit('hint', { key: def.kind === 'diode' ? 'hint.elec.weak_diode' : 'hint.elec.cap_swollen' });
        this.#recompute('wrongPart', s.id);
      }
    }
  }

  /** @param {string} reason @param {string} [slotId] */
  #recompute(reason, slotId) {
    this.output = psuOutput(this.slots, this.cfg.circuit, this.parts);
    const cap = this.output.signalCap;
    if (cap !== this.reportedCap) {
      if (cap === null) {
        this.bus.emit('system:repaired', { systemId: 'telecom_rx', partId: 'rx_psu' });
        this.bus.emit('hint', { key: 'hint.elec.repaired' });
      } else {
        this.bus.emit('component:damaged', { componentId: 'rx_psu', reason, slotId, signalCap: cap, quality: this.output.quality });
      }
      this.reportedCap = cap;
    }
    this.bus.emit('electronics:changed', { quality: this.output.quality });
  }
}
