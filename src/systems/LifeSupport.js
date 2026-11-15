/**
 * Life support (SIMULATION_SPEC §3.1–3.5): O₂, CO₂, temperature/thermostat, pressure, drinking water.
 */
export class LifeSupport {
  /**
   * @param {any} balance full balance.json
   * @param {import('./ResourceManager.js').ResourceManager} resources
   * @param {import('mitt').Emitter<any>} bus
   * @param {{ filters: number, o2Tanks: number }} inventory
   */
  constructor(balance, resources, bus, inventory) {
    this.cfg = balance.lifeSupport;
    this.thermal = balance.thermal;
    this.water = balance.water;
    this.resources = resources;
    this.bus = bus;
    this.inventory = inventory;

    this.filterLifeHours = this.cfg.filterLifeHours * this.cfg.initialFilterFraction;
    this.setpointC = this.thermal.setpointDefault;
    this.coolingK = this.thermal.lossPerHourAtReference / (this.thermal.referenceC - this.thermal.externalC);
    this.heaterOn = false;
    /** @type {string[]} */
    this.leaks = [];
    this.recyclerStuck = false;
    this.pumpThermalBroken = false;
    this.electrolyzerBroken = false;
    this.scrubberFanBroken = false;
    /** @type {Record<string, boolean>} tank valve id → used */
    this.o2TanksUsed = { valve_o2_tank_1: false, valve_o2_tank_2: false };

    this.electrolyzerWanted = false;
    this.scrubberWanted = false;
    this.electrolyzerRunning = false;
    this.scrubberRunning = false;
    this.heaterRunning = false;

    bus.on('thermostat:set', (e) => {
      const v = Number(e?.setpointC);
      if (Number.isFinite(v)) {
        this.setpointC = Math.min(this.thermal.setpointMax, Math.max(this.thermal.setpointMin, v));
      }
    });
    bus.on('valve:turn', (e) => this.#onValve(e));
    // Scripted faults (IncidentRunner) and hand-tool repairs (Repairs).
    bus.on('component:damaged', (e) => {
      if (e?.componentId === 'scrubber_fan') this.scrubberFanBroken = true;
      if (e?.componentId === 'pump_thermal') this.pumpThermalBroken = true;
      if (e?.componentId === 'valve_recycler') this.recyclerStuck = true;
    });
    bus.on('system:repaired', (e) => {
      if (e?.partId === 'scrubber_fan') this.scrubberFanBroken = false;
      if (e?.partId === 'pump_thermal') this.pumpThermalBroken = false;
      if (e?.partId === 'valve_recycler') this.recyclerStuck = false;
    });
    bus.on('leak:started', (e) => {
      if (e?.leakId && !this.leaks.includes(e.leakId)) this.leaks.push(e.leakId);
    });
    bus.on('leak:sealed', (e) => {
      this.leaks = this.leaks.filter((id) => id !== e?.leakId);
    });
    bus.on('filter:swap', () => this.#onFilterSwap());
  }

  /** @param {any} e */
  #onValve(e) {
    if (!e || !(e.valveId in this.o2TanksUsed) || !e.open) return;
    if (this.o2TanksUsed[e.valveId] || this.inventory.o2Tanks <= 0) {
      this.bus.emit('hint', { key: 'hint.o2tank.empty' });
      return;
    }
    this.o2TanksUsed[e.valveId] = true;
    this.inventory.o2Tanks -= 1;
    this.resources.add('oxygen', this.cfg.o2TankBoost);
    this.bus.emit('hint', { key: 'hint.o2tank.opened', params: { boost: this.cfg.o2TankBoost } });
  }

  #onFilterSwap() {
    if (this.inventory.filters <= 0) {
      this.bus.emit('filter:rejected', { reason: 'noSpare' });
      return;
    }
    this.inventory.filters -= 1;
    this.filterLifeHours = this.cfg.filterLifeHours;
    this.bus.emit('filter:swapped', { filtersLeft: this.inventory.filters });
  }

  get filterFraction() {
    return this.filterLifeHours / this.cfg.filterLifeHours;
  }

  /** Power wanted this tick (kW per circuit). */
  wants() {
    const rm = this.resources;
    const o2 = rm.get('oxygen');
    this.electrolyzerWanted = !this.electrolyzerBroken && o2.value < o2.max && rm.value('water') > 0;
    this.scrubberWanted = !this.scrubberFanBroken && rm.value('co2') > rm.get('co2').min && this.filterLifeHours > 0;

    const t = rm.value('temperature');
    if (t < this.setpointC - this.thermal.hysteresis) this.heaterOn = true;
    else if (t > this.setpointC + this.thermal.hysteresis) this.heaterOn = false;

    return {
      lifeSupport: (this.electrolyzerWanted ? this.cfg.electrolyzerKw : 0) + (this.scrubberWanted ? this.cfg.scrubberKw : 0),
      heating: this.heaterOn ? 1 : 0, // multiplied by circuit drawKw in Simulation
    };
  }

  /** @param {Record<string, boolean>} served @param {number} dtHours */
  update(served, dtHours) {
    const rm = this.resources;
    const c = this.cfg;
    const lsPowered = served.lifeSupport;
    const leakCount = this.leaks.length;

    // Oxygen
    rm.addRate('oxygen', -c.o2ConsumptionPerHour - leakCount * c.leakO2PerHour);
    this.electrolyzerRunning = lsPowered && this.electrolyzerWanted;
    if (this.electrolyzerRunning) {
      rm.addRate('oxygen', c.o2ProductionPerHour);
      rm.addRate('water', -c.electrolyzerWaterPerHour);
    }

    // CO₂
    rm.addRate('co2', c.co2ProductionPerHour);
    this.scrubberRunning = lsPowered && this.scrubberWanted;
    if (this.scrubberRunning) {
      rm.addRate('co2', -c.co2ScrubPerHour);
      this.filterLifeHours = Math.max(0, this.filterLifeHours - dtHours);
    }

    // Temperature (Newton cooling toward the regolith)
    const t = rm.value('temperature');
    rm.addRate('temperature', -this.coolingK * (t - this.thermal.externalC) - leakCount * c.leakTempPerHour);
    this.heaterRunning = served.heating && this.heaterOn;
    if (this.heaterRunning) {
      rm.addRate('temperature', this.pumpThermalBroken ? this.thermal.heaterPerHour / 2 : this.thermal.heaterPerHour);
    }

    // Pressure
    if (leakCount > 0) {
      rm.addRate('pressure', -leakCount * c.leakPressurePerHour);
    } else if (lsPowered && rm.value('pressure') < rm.get('pressure').max) {
      rm.addRate('pressure', c.pressureRecoveryPerHour);
    }

    // Drinking water (recycled while life support is powered and the recycler valve is free)
    const recycling = lsPowered && !this.recyclerStuck;
    rm.addRate('water', -this.water.drinkingPerHour * (recycling ? 1 - this.water.recycleFraction : 1));
  }
}
