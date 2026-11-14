// @ts-check
/**
 * Telecom system (Persona B).
 * Manages the Martian communications link with Earth / Mission Control.
 * Signal depends on electrical power, antenna alignment and antenna motor state.
 * Emits and responds to 'antenna:align' intent.
 */
export class Telecom {
  /**
   * @param {any} [cfg] balance.telecom
   * @param {import('mitt').Emitter<any>} [bus]
   * @param {import('./ResourceManager.js').ResourceManager} [resources]
   */
  constructor(cfg = {}, bus, resources) {
    this.cfg = {
      nominalSignal: 95,
      stormDriftPerHour: 6,
      brokenMotorCap: 25,
      alignStep: 0.15,
      ...cfg,
    };
    this.bus = bus;
    this.resources = resources;
    this.alignment = 0.95;
    this.motorBroken = false;

    bus?.on('antenna:align', () => this.align());
    bus?.on('component:damaged', (e) => {
      if (e?.componentId === 'antenna_motor') this.motorBroken = true;
    });
    bus?.on('system:repaired', (e) => {
      if (e?.partId === 'antenna_motor' || e?.systemId === 'telecom') this.motorBroken = false;
    });
  }

  reset() {
    this.alignment = 0.95;
    this.motorBroken = false;
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
    this.alignment = Math.min(1.0, this.alignment + this.cfg.alignStep);
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
      this.alignment = Math.max(0.1, this.alignment - this.cfg.stormDriftPerHour * dt * 0.05);
    }

    if (!this.resources) return;

    let targetSignal = powered ? this.cfg.nominalSignal * this.alignment : 0;
    if (this.motorBroken) {
      targetSignal = Math.min(targetSignal, this.cfg.brokenMotorCap);
    }
    const current = this.resources.value('signal');
    const target = Math.round(targetSignal);
    if (current !== target) {
      this.resources.add('signal', target - current);
    }
  }

  snapshot() {
    return { alignment: this.alignment, motorBroken: this.motorBroken };
  }
}
