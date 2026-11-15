// @ts-check
/**
 * Telecom system (SIMULATION_SPEC §3.8).
 * Signal follows antenna alignment while the telecom circuit is powered.
 * Manual azimuth controls can improve or degrade alignment; a broken motor disables them.
 */
export class Telecom {
  /**
   * @param {any} [cfg] balance.telecom
   * @param {import('mitt').Emitter<any>} [bus]
   * @param {import('./ResourceManager.js').ResourceManager} [resources]
   */
  constructor(cfg = {}, bus, resources) {
    // Fallbacks only keep old saves/tests working; the source of truth is balance.json.
    this.cfg = {
      nominalSignal: 95,
      initialAlignment: 1,
      stormDriftPerHour: 0.02,
      minAlignment: 0,
      alignTarget: 1,
      brokenMotorCap: 40,
      targetAzimuthDeg: 0,
      initialAzimuthDeg: 0,
      maxAzimuthDeg: 45,
      turnStepDeg: 2.5,
      alignmentRangeDeg: 35,
      linkThreshold: 20,
      ...cfg,
    };
    this.bus = bus;
    this.resources = resources;
    this.alignment = this.cfg.initialAlignment;
    this.angle = this.cfg.initialAzimuthDeg;
    this.lastPowered = true;
    this.motorBroken = false;
    /** Signal cap from the receiver power supply (null = healthy), see src/systems/Electronics.js. */
    /** @type {number | null} */
    this.rxCap = null;

    bus?.on('antenna:align', () => this.align());
    bus?.on('antenna:turnLeft', () => this.turn(-1));
    bus?.on('antenna:turnRight', () => this.turn(1));
    bus?.on('component:damaged', (e) => {
      if (e?.componentId === 'antenna_motor') this.motorBroken = true;
      if (e?.componentId === 'rx_psu') this.rxCap = e.signalCap ?? 0;
    });
    bus?.on('system:repaired', (e) => {
      if (e?.partId === 'rx_psu') this.rxCap = null;
      else if (e?.partId === 'antenna_motor' || (e?.systemId === 'telecom' && !e?.partId)) this.motorBroken = false;
    });
  }

  reset() {
    this.alignment = this.cfg.initialAlignment;
    this.angle = this.cfg.initialAzimuthDeg;
    this.lastPowered = true;
    this.motorBroken = false;
    this.rxCap = null;
  }

  /**
   * Turns the antenna one configured step left or right.
   * @param {-1 | 1} direction
   * @returns {'ok' | 'broken'}
   */
  turn(direction) {
    if (this.motorBroken) {
      this.bus?.emit('hint', { key: 'hint.motorBroken' });
      return 'broken';
    }

    this.angle = Math.max(
      -this.cfg.maxAzimuthDeg,
      Math.min(this.cfg.maxAzimuthDeg, this.angle + direction * this.cfg.turnStepDeg),
    );
    this.alignment = this._alignmentFromAngle();
    this.bus?.emit('hint', {
      key: direction < 0 ? 'hint.turnedLeft' : 'hint.turnedRight',
      params: {
        deg: Math.round(this.angle),
        pct: Math.round(this.alignment * 100),
      },
    });
    this._syncSignal();
    return 'ok';
  }

  /**
   * Re-aligns the antenna towards Earth satellite uplink.
   * @returns {'ok' | 'broken'}
   */
  align() {
    if (this.motorBroken) {
      this.bus?.emit('hint', { key: 'hint.motorBroken' });
      return 'broken';
    }
    this.alignment = this.cfg.alignTarget;
    this.angle = this.cfg.targetAzimuthDeg;
    this.bus?.emit('hint', {
      key: 'hint.aligned',
      params: { pct: Math.round(this.alignment * 100) },
    });
    this._syncSignal();
    return 'ok';
  }

  /** Applies the current signal level immediately, including while simulation time is paused. */
  _syncSignal() {
    if (!this.resources) return;

    let targetSignal = this.lastPowered ? this.cfg.nominalSignal * this.alignment : 0;
    if (this.motorBroken) targetSignal = Math.min(targetSignal, this.cfg.brokenMotorCap);
    if (this.rxCap !== null) targetSignal = Math.min(targetSignal, this.rxCap);

    const current = this.resources.value('signal');
    const target = Math.round(targetSignal);
    if (current !== target) this.resources.add('signal', target - current);
  }

  _alignmentFromAngle() {
    const error = Math.abs(this.angle - this.cfg.targetAzimuthDeg);
    return Math.max(
      this.cfg.minAlignment,
      Math.min(1, 1 - error / this.cfg.alignmentRangeDeg),
    );
  }

  /**
   * Updates telecom signal state per tick.
   * @param {boolean} powered whether the telecom circuit is powered
   * @param {boolean} stormActive whether a dust storm is in progress
   * @param {number} dt in-game hours elapsed this tick
   */
  update(powered, stormActive, dt) {
    this.lastPowered = powered;
    if (stormActive) {
      const driftDeg = this.cfg.stormDriftPerHour * dt * this.cfg.alignmentRangeDeg;
      const awayFromTarget = this.angle >= this.cfg.targetAzimuthDeg ? 1 : -1;
      this.angle = Math.max(
        -this.cfg.maxAzimuthDeg,
        Math.min(this.cfg.maxAzimuthDeg, this.angle + awayFromTarget * driftDeg),
      );
      this.alignment = this._alignmentFromAngle();
    }

    this._syncSignal();
  }

  snapshot() {
    return {
      alignment: this.alignment,
      angle: this.angle,
      motorBroken: this.motorBroken,
      rxCap: this.rxCap,
    };
  }
}
