// @ts-check
import { earthMars } from './orbits.js';

/**
 * Earth ⇄ base link (SIMULATION_SPEC §3.8.1). Messages from Mission Control travel at the speed of light:
 * they are delivered after the REAL one-way light time for the game's calendar date (JPL elements,
 * src/data/real/orbits.json). Without a link (signal below the telecom threshold, or Mars in solar
 * conjunction) they wait in the queue and arrive once the link is back.
 *
 * - Intent `comms:send { channel, key, params? }` (from IncidentRunner and the daily briefing).
 * - Emits `comms:message { channel, key, params, day, hour, minute, sentDay, sentHour, sentMinute, delayMin }`,
 *   `comms:linkLost { reason: 'signal' | 'conjunction' }`, `comms:linkRestored {}`.
 * Local events (hints, the rover) never go through here: the rover is driven from the base, so its
 * command delay is under a second.
 */
export class Comms {
  /**
   * @param {any} cfg balance.comms
   * @param {any} orbits src/data/real/orbits.json (null ⇒ no delay)
   * @param {{ bus: import('mitt').Emitter<any>, time: import('./TimeManager.js').TimeManager,
   *   resources: import('./ResourceManager.js').ResourceManager, linkThreshold: number }} ctx
   */
  constructor(cfg, orbits, ctx) {
    this.cfg = cfg;
    this.orbits = orbits;
    this.bus = ctx.bus;
    this.time = ctx.time;
    this.resources = ctx.resources;
    this.linkThreshold = ctx.linkThreshold;
    this.startMs = Date.parse(cfg.startDateUtc);
    /** @type {{ channel: string, key: string, params: Record<string, any>, sentTick: number, arriveTick: number }[]} */
    this.queue = [];
    this.link = true;
    /** @type {'signal' | 'conjunction' | null} */
    this.linkDownReason = null;
    this.geometry = { distanceAu: 0, lightMin: 0, elongationDeg: 180 };
    this.geometryTick = -Infinity;
    this.#updateGeometry(0);

    this.bus.on('comms:send', (/** @type {any} */ e) => this.send(e?.channel ?? 'mission', e?.key, e?.params ?? {}));
    this.bus.on('game:phaseChanged', (/** @type {any} */ e) => {
      if (e?.to === 'playing') this.send('mission', 'comms.daily.d1', {});
    });
    this.bus.on('time:dayStarted', (/** @type {any} */ e) => this.send('mission', `comms.daily.d${e.day}`, {}));
  }

  /** Calendar date (UTC ms) of a game tick: 1 tick = 1 minute after the mission start. @param {number} tick */
  dateOf(tick) {
    return this.startMs + tick * 60000;
  }

  /** One-way light time rounded up to whole game minutes (ticks). */
  get delayTicks() {
    return Math.ceil(this.geometry.lightMin);
  }

  get conjunction() {
    return this.geometry.elongationDeg < this.cfg.conjunctionDeg;
  }

  /** @param {string} channel @param {string} key @param {Record<string, any>} params */
  send(channel, key, params) {
    if (!key) return;
    const tick = this.time.tick;
    this.queue.push({ channel, key, params, sentTick: tick, arriveTick: tick + this.delayTicks });
    this.queue.sort((a, b) => a.arriveTick - b.arriveTick);
  }

  /** @param {number} tick */
  #updateGeometry(tick) {
    if (!this.orbits) return;
    this.geometry = earthMars(this.dateOf(tick), this.orbits);
    this.geometryTick = tick;
  }

  /** Called once per tick after Telecom has set the signal. */
  update() {
    const tick = this.time.tick;
    if (tick - this.geometryTick >= this.cfg.geometryEveryTicks) this.#updateGeometry(tick);

    const reason = this.conjunction ? 'conjunction' : this.resources.value('signal') < this.linkThreshold ? 'signal' : null;
    const link = reason === null;
    if (link !== this.link) {
      this.link = link;
      this.linkDownReason = reason;
      this.bus.emit(link ? 'comms:linkRestored' : 'comms:linkLost', link ? {} : { reason });
    }
    if (!link) return;

    while (this.queue.length && this.queue[0].arriveTick <= tick) {
      const m = /** @type {(typeof this.queue)[number]} */ (this.queue.shift());
      const now = this.time.clock(tick);
      const sent = this.time.clock(m.sentTick);
      this.bus.emit('comms:message', {
        channel: m.channel,
        key: m.key,
        params: m.params,
        day: now.day,
        hour: now.hour,
        minute: now.minute,
        sentDay: sent.day,
        sentHour: sent.hour,
        sentMinute: sent.minute,
        delayMin: tick - m.sentTick,
      });
    }
  }

  /** Messages still travelling or held, and minutes until the next one arrives (null if none / no link). */
  inTransit() {
    const next = this.queue[0];
    return {
      count: this.queue.length,
      nextInMin: next && this.link ? Math.max(0, next.arriveTick - this.time.tick) : null,
    };
  }
}
