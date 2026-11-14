const EPSILON = 1e-9;

/**
 * Power grid (SIMULATION_SPEC §2): battery + RTG + solar, binary breakers,
 * priority service at empty battery, overload relay trips.
 */
export class PowerGrid {
  /**
   * @param {any} cfg balance.power
   * @param {Record<string, any>} circuits balance.circuits
   * @param {import('./ResourceManager.js').ResourceManager} resources
   * @param {import('mitt').Emitter<any>} bus
   */
  constructor(cfg, circuits, resources, bus) {
    this.cfg = cfg;
    this.circuits = circuits;
    this.resources = resources;
    this.bus = bus;
    this.order = Object.keys(circuits).sort((a, b) => circuits[a].priority - circuits[b].priority);

    /** @type {Record<string, boolean>} */
    this.breakers = Object.fromEntries(this.order.map((id) => [id, true]));
    /** @type {Record<string, boolean>} */
    this.served = Object.fromEntries(this.order.map((id) => [id, true]));
    /** @type {Record<string, number>} */
    this.demand = Object.fromEntries(this.order.map((id) => [id, 0]));

    this.relayTripped = false;
    this.relayBurned = false;
    this.guidedTrip = false;
    /** @type {number[]} */
    this.tripTicks = [];
    this.overloadTicks = 0;
    this.stormActive = false;

    this.totalDemandKw = 0;
    this.servedLoadKw = 0;
    this.generationKw = 0;

    bus.on('breaker:toggle', (e) => {
      if (e && e.circuitId in this.breakers) this.breakers[e.circuitId] = Boolean(e.on);
    });
    bus.on('relay:resetRequest', () => this.resetRelay());
  }

  get relayClosed() {
    return !this.relayTripped && !this.relayBurned;
  }

  /**
   * Opens the main relay. Guided (scripted tutorial) trips do not count toward burning it.
   * @param {number} tick @param {{ guided?: boolean }} [opts]
   */
  trip(tick, { guided = false } = {}) {
    if (this.relayBurned) return;
    this.relayTripped = true;
    this.overloadTicks = 0;
    if (guided) {
      this.guidedTrip = true;
    } else {
      this.tripTicks = this.tripTicks.filter((t) => t > tick - this.cfg.relayTripWindowTicks);
      this.tripTicks.push(tick);
      if (this.tripTicks.length >= this.cfg.relayBurnTrips) {
        this.relayBurned = true;
        this.bus.emit('component:damaged', { componentId: 'relay_main', reason: 'overload' });
        this.bus.emit('system:failed', { systemId: 'power', reason: 'relay_main' });
      }
    }
    this.bus.emit('relay:tripped', { guided, burned: this.relayBurned });
  }

  resetRelay() {
    if (!this.relayTripped || this.relayBurned) return;
    this.relayTripped = false;
    this.guidedTrip = false;
    this.bus.emit('relay:reset', {});
  }

  /** @param {{ hourFloat: number }} clock */
  generation(clock) {
    const daylight = clock.hourFloat >= this.cfg.solarStartHour && clock.hourFloat < this.cfg.solarEndHour;
    const solar = daylight ? this.cfg.solarKw * (this.stormActive ? this.cfg.stormSolarFactor : 1) : 0;
    return this.cfg.rtgKw + solar;
  }

  /**
   * Resolves one tick of supply/demand and adds the battery rate.
   * @param {Record<string, number>} requests kW wanted per circuit (before breakers)
   * @param {{ hourFloat: number }} clock
   * @param {number} tick
   */
  resolve(requests, clock, tick) {
    let total = 0;
    for (const id of this.order) {
      const kw = this.breakers[id] && this.relayClosed ? requests[id] ?? 0 : 0;
      this.demand[id] = kw;
      total += kw;
    }

    if (this.relayClosed && total > this.cfg.busLimitKw + EPSILON) {
      this.overloadTicks += 1;
      if (this.overloadTicks === 1) {
        this.bus.emit('power:overloadWarning', { demandKw: total, limitKw: this.cfg.busLimitKw });
      }
      if (this.overloadTicks >= this.cfg.overloadTicks) this.trip(tick);
    } else {
      this.overloadTicks = 0;
    }

    const gen = this.generation(clock);
    const battery = this.resources.value('power');
    /** @type {Record<string, boolean>} */
    const served = {};
    let servedLoad = 0;

    if (!this.relayClosed) {
      for (const id of this.order) served[id] = false;
    } else if (battery > EPSILON) {
      for (const id of this.order) {
        served[id] = this.breakers[id];
        if (served[id]) servedLoad += this.demand[id];
      }
    } else {
      let available = gen;
      for (const id of this.order) {
        if (!this.breakers[id]) {
          served[id] = false;
        } else if (this.demand[id] <= available + EPSILON) {
          served[id] = true;
          available -= this.demand[id];
          servedLoad += this.demand[id];
        } else {
          served[id] = false;
        }
      }
    }

    for (const id of this.order) {
      if (served[id] !== this.served[id]) {
        this.bus.emit(served[id] ? 'power:restored' : 'power:lost', { circuitId: id });
      }
    }
    this.served = served;
    this.totalDemandKw = this.relayClosed ? total : 0;
    this.servedLoadKw = servedLoad;
    this.generationKw = gen;
    this.resources.addRate('power', gen - servedLoad);
  }
}
