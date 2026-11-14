/**
 * Tick-based accelerated time (SIMULATION_SPEC §1). 1 tick = 1 in-game minute.
 * Day N spans N 06:00 → N+1 05:59; tick 0 = day 1, 06:00.
 */
export class TimeManager {
  /**
   * @param {any} cfg balance.time
   * @param {import('mitt').Emitter<any>} bus
   */
  constructor(cfg, bus) {
    this.cfg = cfg;
    this.bus = bus;
    this.ticksPerSecond = cfg.minutesPerDay / cfg.secondsPerDay;
    this.totalTicks = cfg.totalDays * cfg.minutesPerDay;
    this.tick = 0;
    this.speed = 1;
    this.previousSpeed = 1;
    this.autoPaused = false;
    this.accumulator = 0;

    bus.on('time:setSpeed', (e) => this.setSpeed(e?.speed));
    bus.on('time:autoPause', () => this.autoPause());
  }

  /** @param {number} speed */
  setSpeed(speed) {
    if (!this.cfg.speeds.includes(speed)) return;
    this.speed = speed;
    this.autoPaused = false;
    this.bus.emit('time:speedChanged', { speed });
  }

  autoPause() {
    if (this.speed === 0) return;
    this.previousSpeed = this.speed;
    this.speed = 0;
    this.autoPaused = true;
    this.bus.emit('time:speedChanged', { speed: 0 });
    this.bus.emit('time:autoPaused', { previousSpeed: this.previousSpeed });
  }

  /**
   * Converts real elapsed seconds into whole ticks to run this frame.
   * Excess beyond maxTicksPerFrame is discarded (no spiral of death).
   * @param {number} realDt seconds
   */
  consume(realDt) {
    if (this.speed === 0 || realDt <= 0) return 0;
    this.accumulator += realDt * this.speed * this.ticksPerSecond;
    const whole = Math.floor(this.accumulator);
    this.accumulator -= whole;
    return Math.min(whole, this.cfg.maxTicksPerFrame);
  }

  /** @param {number} [tick] */
  clock(tick = this.tick) {
    const day = Math.floor(tick / this.cfg.minutesPerDay) + 1;
    const minuteOfDay = (this.cfg.dayStartHour * 60 + tick) % this.cfg.minutesPerDay;
    return {
      tick,
      day,
      hour: Math.floor(minuteOfDay / 60),
      minute: minuteOfDay % 60,
      hourFloat: minuteOfDay / 60,
    };
  }

  advanceTick() {
    this.tick += 1;
    const clock = this.clock();
    this.bus.emit('time:tick', { tick: clock.tick, day: clock.day, hour: clock.hour });
    if (this.tick % this.cfg.minutesPerDay === 0 && this.tick < this.totalTicks) {
      this.bus.emit('time:dayStarted', { day: clock.day });
    }
  }

  /**
   * Tick of a scripted "day N, HH:MM" time using the 06:00 day boundary.
   * @param {number} day @param {string} hhmm @param {any} cfg balance.time
   */
  static tickOf(day, hhmm, cfg) {
    const [hh, mm] = hhmm.split(':').map(Number);
    let offset = hh * 60 + mm - cfg.dayStartHour * 60;
    if (offset < 0) offset += cfg.minutesPerDay;
    return (day - 1) * cfg.minutesPerDay + offset;
  }
}
