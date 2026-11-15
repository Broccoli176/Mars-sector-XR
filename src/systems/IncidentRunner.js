import { TimeManager } from './TimeManager.js';

/**
 * Fires the scripted incidents of events.json (SIMULATION_SPEC §6.2).
 * Prototype scope: guided relay trip, hints, dust storm (+ forecast), dust devil, solar particle event.
 * Mission messages go out as 'comms:send': Comms (src/systems/Comms.js) delivers them after the real
 * Earth–Mars light time, and only while there is a link.
 */
export class IncidentRunner {
  /**
   * @param {any[]} events events.json
   * @param {any} timeCfg balance.time
   * @param {{ bus: import('mitt').Emitter<any>, power: import('./PowerGrid.js').PowerGrid }} ctx
   */
  constructor(events, timeCfg, ctx) {
    this.bus = ctx.bus;
    this.power = ctx.power;
    this.ticksPerHour = timeCfg.minutesPerDay / 24;
    /** @type {{ tick: number, event: any, kind: 'trigger' | 'warning' }[]} */
    this.schedule = [];
    for (const event of events) {
      const tick = TimeManager.tickOf(event.day, event.time, timeCfg);
      this.schedule.push({ tick, event, kind: 'trigger' });
      if (event.warnLeadHours) {
        this.schedule.push({ tick: Math.max(0, tick - event.warnLeadHours * this.ticksPerHour), event, kind: 'warning' });
      }
    }
    this.schedule.sort((a, b) => a.tick - b.tick);
    this.next = 0;
    /** @type {number | null} */
    this.stormEndTick = null;
    /** @type {string[]} */
    this.fired = [];
  }

  /** @param {number} tick @param {{ day: number, hour: number }} clock */
  update(tick, clock) {
    if (this.stormEndTick !== null && tick >= this.stormEndTick) {
      this.stormEndTick = null;
      this.power.stormActive = false;
      this.bus.emit('weather:changed', { state: 'clear', solarFactor: 1 });
      this.#comms('comms.storm.end', {}, clock);
    }
    while (this.next < this.schedule.length && this.schedule[this.next].tick <= tick) {
      const entry = this.schedule[this.next++];
      if (entry.kind === 'warning') this.#warn(entry.event, clock);
      else this.#trigger(entry.event, tick, clock);
    }
  }

  /** @param {any} event @param {any} clock */
  #warn(event, clock) {
    this.bus.emit('incident:warning', { incidentId: event.id, etaHours: event.warnLeadHours });
    if (event.type === 'storm') {
      this.#comms('comms.storm.forecast', { hours: event.warnLeadHours, duration: event.durationHours }, clock);
    }
    if (event.type === 'sep') {
      this.bus.emit('spaceWeather:alert', { kind: 'sep', etaHours: event.warnLeadHours });
      this.#comms('comms.sep.forecast', { minutes: Math.round(event.warnLeadHours * 60) }, clock);
    }
  }

  /** @param {any} event @param {number} tick @param {any} clock */
  #trigger(event, tick, clock) {
    this.fired.push(event.id);
    switch (event.type) {
      case 'relayTrip':
        this.power.trip(tick, { guided: Boolean(event.guided) });
        break;
      case 'dustDevil':
        this.power.dustDevil();
        break;
      case 'sep':
        this.bus.emit('spaceWeather:impact', { kind: 'sep', durationHours: event.durationHours });
        break;
      case 'failure':
        this.bus.emit('component:damaged', { componentId: event.componentId, reason: 'scripted' });
        break;
      case 'leak':
        this.bus.emit('leak:started', { leakId: event.leakId });
        break;
      case 'storm':
        this.power.stormActive = true;
        this.stormEndTick = tick + event.durationHours * this.ticksPerHour;
        this.bus.emit('weather:changed', { state: 'dustStorm', solarFactor: this.power.cfg.stormSolarFactor });
        this.#comms('comms.storm.start', { pct: Math.round(this.power.cfg.stormSolarFactor * 100) }, clock);
        break;
      default:
        break;
    }
    if (event.hintKey) this.bus.emit('hint', { key: event.hintKey });
    this.bus.emit('incident:triggered', { incidentId: event.id });
  }

  /** @param {string} key @param {Record<string, any>} params @param {any} clock */
  #comms(key, params, clock) {
    void clock;
    this.bus.emit('comms:send', { channel: 'mission', key, params });
  }
}
