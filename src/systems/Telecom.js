// @ts-check
/**
 * Telecom system (SIMULATION_SPEC §3.8).
 * signal = nominalSignal × alignment when the telecom circuit is powered, 0 otherwise.
 * Dust storms drift the alignment; 'antenna:align' restores it; a broken antenna motor
 * caps the signal and makes realignment impossible. Tunables come from balance.telecom.
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
      ...cfg,
    };
    this.bus = bus;
    this.resources = resources;
    this.alignment = this.cfg.initialAlignment;
    this.motorBroken = false;
    /** Signal cap from the receiver power supply (null = healthy), see src/systems/Electronics.js. */
    /** @type {number | null} */
    this.rxCap = null;

    bus?.on('antenna:align', () => this.align());
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
    this.motorBroken = false;
    this.rxCap = null;
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
    this.bus?.emit('hint', {
      key: 'hint.aligned',
      params: { pct: Math.round(this.alignment * 100) },
    });
    return 'ok';
  }

  /**
   * Updates telecom signal state per tick.
   * @param {boolean} powered whether the telecom circuit is powered
   * @param {boolean} stormActive whether a dust storm is in progress
   * @param {number} dt in-game hours elapsed this tick
   */
  update(powered, stormActive, dt) {
    if (stormActive) {
      this.alignment = Math.max(this.cfg.minAlignment, this.alignment - this.cfg.stormDriftPerHour * dt);
    }

    if (!this.resources) return;

    let targetSignal = powered ? this.cfg.nominalSignal * this.alignment : 0;
    if (this.motorBroken) {
      targetSignal = Math.min(targetSignal, this.cfg.brokenMotorCap);
    }
    if (this.rxCap !== null) targetSignal = Math.min(targetSignal, this.rxCap);
    const current = this.resources.value('signal');
    const target = Math.round(targetSignal);
    if (current !== target) {
      this.resources.add('signal', target - current);
    }
  }

  snapshot() {
    return { alignment: this.alignment, motorBroken: this.motorBroken, rxCap: this.rxCap };
  }
}
