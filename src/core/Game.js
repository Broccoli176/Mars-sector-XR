import { Simulation } from '../systems/Simulation.js';
import { formatClock } from '../utils/strings.js';

const MAX_LOG = 6;

/**
 * Owns the current Simulation and a player-facing message log fed by bus events.
 * Presentation reads `game.sim` and emits intents through `game.intent()`.
 */
export class Game {
  /**
   * @param {any} data gameData
   * @param {(key: string, params?: Record<string, any>) => string} t
   */
  constructor(data, t) {
    this.data = data;
    this.t = t;
    /** @type {{ text: string, kind: string }[]} */
    this.log = [];
    this.sim = this.#createSim();
  }

  #createSim() {
    const sim = new Simulation({
      resources: structuredClone(this.data.resources),
      balance: structuredClone(this.data.balance),
      events: structuredClone(this.data.events),
      real: this.data.real,
    });
    this.log = [];
    this.#wireLog(sim);
    this.#push(this.t('hint.training.start'), 'hint', sim);
    return sim;
  }

  restart() {
    this.sim = this.#createSim();
  }

  /** Emit an intent on the simulation bus. @param {string} type @param {any} [payload] */
  intent(type, payload = {}) {
    this.sim.bus.emit(type, payload);
  }

  /** @param {string} text @param {string} kind @param {Simulation} [sim] */
  #push(text, kind, sim = this.sim) {
    const c = sim.time.clock();
    this.log.unshift({ text: `D${c.day} ${formatClock(c.hour, c.minute)} · ${text}`, kind });
    if (this.log.length > MAX_LOG) this.log.length = MAX_LOG;
  }

  /** @param {Simulation} sim */
  #wireLog(sim) {
    const { bus } = sim;
    const t = this.t;
    const push = (/** @type {string} */ text, kind = 'info') => this.#push(text, kind, sim);

    bus.on('hint', (e) => push(t(e.key, e.params), 'hint'));
    // Mission messages arrive through Comms after the real Earth–Mars light time (src/systems/Comms.js).
    bus.on('comms:message', (e) => {
      const sent = e.sentHour !== undefined ? ` ${t('ui.log.comms_sent', { time: formatClock(e.sentHour, e.sentMinute ?? 0), min: e.delayMin })}` : '';
      push(`${t(e.key, e.params)}${sent}`, 'comms');
    });
    bus.on('comms:linkLost', (e) => push(t(`ui.log.link_lost.${e.reason}`, { min: sim.telecom.cfg.linkThreshold }), 'warning'));
    bus.on('comms:linkRestored', () => push(t('ui.log.link_restored')));
    bus.on('solar:cleaned', (e) => push(t(`ui.log.solar_cleaned.${e.by}`, { pct: Math.round(e.gained * 100) })));
    bus.on('solar:rejected', (e) => push(t(`ui.log.solar_rejected.${e.reason}`), 'warning'));
    let trackerMode = 'manual';
    bus.on('solar:tracker', (e) => {
      if (e.mode !== trackerMode) push(t(`ui.log.solar_tracker.${e.mode}`));
      trackerMode = e.mode;
    });
    bus.on('power:overloadWarning', (e) =>
      push(t('ui.log.overload', { demand: e.demandKw.toFixed(1), limit: e.limitKw.toFixed(1) }), 'warning'));
    bus.on('relay:tripped', (e) => push(t(e.burned ? 'ui.log.relay_burned' : 'ui.log.relay_tripped'), 'critical'));
    bus.on('relay:reset', () => push(t('ui.log.relay_reset')));
    bus.on('relay:rejected', (e) => push(t(e.reason === 'noTool' ? 'ui.log.relay_no_tool' : 'ui.log.relay_no_spare'), 'critical'));
    bus.on('system:repaired', (e) => {
      if (e.partId === 'relay_main') push(t('ui.log.relay_replaced'), 'warning');
      else if (e.partId && e.partId !== 'rx_psu') push(t('ui.log.repaired', { name: t(`hub.comp.${e.partId}`) }));
    });
    bus.on('leak:started', () => push(t('ui.log.leak_started'), 'critical'));
    bus.on('leak:sealed', () => push(t('ui.log.leak_sealed', { left: sim.inventory.sealantCharges })));
    bus.on('food:ready', () => push(t('ui.log.food_ready'), 'warning'));
    bus.on('food:harvested', (e) => push(t('ui.log.food_harvested', { kcal: e.kcal })));
    bus.on('food:spoiled', (e) => push(t(`ui.log.food_spoiled.${e.reason}`), 'critical'));
    bus.on('hydro:fed', (e) => push(t('ui.log.hydro_fed', { count: e.cartridgesLeft })));
    bus.on('hydro:nutrientsLow', () => push(t('ui.log.hydro_nutrients_low'), 'warning'));
    bus.on('hydro:rejected', (e) => {
      if (!e.trayId) push(t(`ui.log.hydro_rejected.${e.reason}`), 'warning');
    });
    bus.on('kitchen:done', (e) => push(t('ui.log.kitchen_done', { name: t(`real.recipe.${e.recipeId}`), kcal: e.kcal })));
    bus.on('kitchen:eaten', (e) => push(t('ui.log.kitchen_eaten', { kcal: e.kcal })));
    bus.on('kitchen:spoiled', (e) => push(t('ui.log.kitchen_spoiled', { name: t(`real.crop.${e.itemId}`), kcal: e.kcal }), 'warning'));
    bus.on('kitchen:rejected', (e) => push(t(`ui.log.kitchen_rejected.${e.reason}`), 'warning'));
    bus.on('filter:swapped', (e) => push(t('ui.log.filter_swapped', { count: e.filtersLeft })));
    bus.on('filter:rejected', () => push(t('ui.log.filter_none'), 'warning'));
    bus.on('time:autoPaused', () => push(t('ui.log.autopaused'), 'warning'));
  }
}
