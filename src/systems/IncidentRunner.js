import { TimeManager } from './TimeManager.js';

/**
 * Fires the scripted incidents of events.json (SIMULATION_SPEC §6.2).
 * Prototype scope: guided relay trip, hints, dust storm (+ forecast).
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
    this.ticksPerHour = 60;
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
  }

  /** @param {any} event @param {number} tick @param {any} clock */
  #trigger(event, tick, clock) {
    this.fired.push(event.id);
    switch (event.type) {
      case 'relayTrip':
        this.power.trip(tick, { guided: Boolean(event.guided) });
        break;
      case 'storm':
        this.power.stormActive = true;
        this.stormEndTick = tick + event.durationHours * this.ticksPerHour;
        this.bus.emit('weather:changed', { state: 'dustStorm', solarFactor: this.power.cfg.stormSolarFactor });
        this.#comms('comms.storm.start', {}, clock);
        break;
      default:
        break;
    }
    if (event.hintKey) this.bus.emit('hint', { key: event.hintKey });
    this.bus.emit('incident:triggered', { incidentId: event.id });
  }

  /** @param {string} key @param {Record<string, any>} params @param {any} clock */
  #comms(key, params, clock) {
    this.bus.emit('comms:message', { channel: 'mission', key, params, day: clock.day, hour: clock.hour });
  }
}
