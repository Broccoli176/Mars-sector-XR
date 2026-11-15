// @ts-check
/**
 * Single-axis (east–west) sun tracker for the solar field (SIMULATION_SPEC §2.6). Headless.
 *
 * Simplified real physics — cosine law: output ∝ max(0, cos(h − θ)), where h is the sun's hour angle
 * ((hour − 12) × 15°, negative = east/morning) and θ the panel angle (same sign convention). Real
 * single-axis trackers swing about ±60°. No air mass or season (documented simplification).
 *
 * Modes (intents from the Energía solar console):
 * - manual (`solar:turn { dir: -1 | 1 }`): steps the target by stepDeg; free.
 * - auto (`solar:auto { on }`): the target follows the sun; its motor draws autoKw in daylight (PowerGrid
 *   adds it as a load). Without power it stops (`solar:rejected { reason: 'tracker' }`).
 * - stow (`solar:stow { on }`): panels edge-on (90°): no output, much less dust settles in a storm.
 * The panel moves towards its target at slewDegPerMin. Emits `solar:tracker { mode, angleDeg, targetDeg }`.
 */
export class SolarTracker {
  /**
   * @param {any} cfg balance.tracker
   * @param {{ solarStartHour: number, solarEndHour: number }} powerCfg balance.power
   * @param {import('mitt').Emitter<any>} bus
   */
  constructor(cfg, powerCfg, bus) {
    this.cfg = cfg;
    this.powerCfg = powerCfg;
    this.bus = bus;
    /** @type {'manual' | 'auto' | 'stow'} */
    this.mode = 'manual';
    this.angleDeg = cfg.initialDeg ?? 0;
    this.targetDeg = this.angleDeg;
    /** Whether the AUTO motor had power last tick. */
    this.powered = true;

    bus.on('solar:turn', (/** @type {any} */ e) => this.turn(e?.dir < 0 ? -1 : 1));
    bus.on('solar:auto', (/** @type {any} */ e) => this.setMode(e?.on === false ? 'manual' : 'auto'));
    bus.on('solar:stow', (/** @type {any} */ e) => this.setMode(e?.on === false ? 'manual' : 'stow'));
  }

  /** Sun hour angle in degrees (negative = east). @param {number} hourFloat */
  static sunAngle(hourFloat) {
    return (hourFloat - 12) * 15;
  }

  /** Fraction of clean full-sun output for a panel angle and time (0 at night). @param {number} hourFloat @param {number} [angleDeg] */
  factor(hourFloat, angleDeg = this.angleDeg) {
    if (hourFloat < this.powerCfg.solarStartHour || hourFloat >= this.powerCfg.solarEndHour) return 0;
    if (Math.abs(angleDeg) >= 89.9) return 0; // stowed edge-on
    const diff = ((SolarTracker.sunAngle(hourFloat) - angleDeg) * Math.PI) / 180;
    return Math.max(0, Math.cos(diff));
  }

  /** @param {-1 | 1} dir */
  turn(dir) {
    if (this.mode !== 'manual') this.mode = 'manual';
    const max = this.cfg.maxDeg;
    const base = Math.abs(this.targetDeg) > max ? Math.sign(this.targetDeg) * max : this.targetDeg;
    this.targetDeg = Math.max(-max, Math.min(max, base + dir * this.cfg.stepDeg));
    this.#emit();
  }

  /** @param {'manual' | 'auto' | 'stow'} mode */
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'stow') this.targetDeg = this.cfg.stowDeg;
    if (mode === 'manual' && Math.abs(this.targetDeg) > this.cfg.maxDeg) this.targetDeg = 0;
    this.#emit();
  }

  /** kW the AUTO motor wants this tick (daylight only). @param {{ hourFloat: number }} clock */
  demandKw(clock) {
    const day = clock.hourFloat >= this.powerCfg.solarStartHour && clock.hourFloat < this.powerCfg.solarEndHour;
    return this.mode === 'auto' && day ? this.cfg.autoKw : 0;
  }

  /**
   * Moves the panels one tick. In AUTO the target follows the sun only while the motor is powered.
   * @param {{ hourFloat: number }} clock @param {number} dtHours @param {boolean} powered
   */
  update(clock, dtHours, powered) {
    if (this.mode === 'auto') {
      if (powered !== this.powered && !powered) this.bus.emit('solar:rejected', { reason: 'tracker' });
      this.powered = powered;
      if (powered) {
        const max = this.cfg.maxDeg;
        const day = clock.hourFloat >= this.powerCfg.solarStartHour && clock.hourFloat < this.powerCfg.solarEndHour;
        // Night: park facing east, ready for sunrise (real trackers backtrack overnight).
        this.targetDeg = day ? Math.max(-max, Math.min(max, SolarTracker.sunAngle(clock.hourFloat))) : -max;
      }
    } else {
      this.powered = true;
    }
    if (this.mode === 'auto' && !this.powered) return;
    const step = this.cfg.slewDegPerMin * dtHours * 60;
    const d = this.targetDeg - this.angleDeg;
    this.angleDeg = Math.abs(d) <= step ? this.targetDeg : this.angleDeg + Math.sign(d) * step;
  }

  get stowed() {
    return this.mode === 'stow' && Math.abs(this.angleDeg) >= this.cfg.stowDeg - 1;
  }

  #emit() {
    this.bus.emit('solar:tracker', { mode: this.mode, angleDeg: this.angleDeg, targetDeg: this.targetDeg });
  }
}
