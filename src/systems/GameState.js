/**
 * Phases and win/lose rules (SIMULATION_SPEC §1.1, §5).
 * Phases: boot → training → playing → over | won. Pause is time speed 0, not a phase.
 */
export class GameState {
  /**
   * @param {any} rules balance.gameRules
   * @param {number} ticksPerHour
   * @param {{ bus: any, time: any, resources: any, power: any, crew: any }} ctx
   */
  constructor(rules, ticksPerHour, ctx) {
    this.rules = rules;
    this.ticksPerHour = ticksPerHour;
    this.ctx = ctx;
    this.phase = 'training';
    this.powerLossTicks = 0;
    /** @type {null | { reason: string, tick: number, day: number, hour: number, minute: number }} */
    this.result = null;

    ctx.bus.on('game:start', () => {
      if (this.phase === 'training') this.#setPhase('playing');
    });
  }

  /** @param {string} to */
  #setPhase(to) {
    const from = this.phase;
    this.phase = to;
    this.ctx.bus.emit('game:phaseChanged', { from, to });
  }

  /** Called after every tick. */
  check() {
    if (this.phase !== 'playing') return;
    const { resources, power, crew, time } = this.ctx;

    if (resources.value('health') <= 0) {
      this.#end('over', crew.dominantCause());
      return;
    }

    // Total power loss: lifeSupport unserved for any reason (breaker off, relay open, priority offline).
    this.powerLossTicks = power.served.lifeSupport ? 0 : this.powerLossTicks + 1;
    const graceHours = this.rules.powerLossHours + (power.guidedTrip ? this.rules.guidedTripExtraHours : 0);
    if (this.powerLossTicks >= graceHours * this.ticksPerHour) {
      this.#end('over', 'powerLoss');
      return;
    }

    if (time.tick >= time.totalTicks) this.#end('won', 'survived');
  }

  /** @param {'over' | 'won'} phase @param {string} reason */
  #end(phase, reason) {
    const clock = this.ctx.time.clock();
    this.result = { reason, tick: clock.tick, day: clock.day, hour: clock.hour, minute: clock.minute };
    this.#setPhase(phase);
    this.ctx.bus.emit(phase === 'won' ? 'game:won' : 'game:over', { reason });
  }
}
