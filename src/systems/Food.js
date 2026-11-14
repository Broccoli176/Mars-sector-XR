// Hours accumulate in 1/60 steps; compare with a tolerance to avoid float drift.
const EPS = 1e-6;

/**
 * Rations + hydroponics (SIMULATION_SPEC §3.6), including crop spoilage.
 */
export class Food {
  /**
   * @param {any} balance full balance.json
   * @param {import('./ResourceManager.js').ResourceManager} resources
   * @param {import('mitt').Emitter<any>} bus
   */
  constructor(balance, resources, bus) {
    this.cfg = balance.food;
    this.water = balance.water;
    this.hydroCircuit = balance.circuits.hydro;
    this.resources = resources;
    this.bus = bus;

    this.growthHours = this.cfg.initialGrowthHours;
    this.ready = false;
    this.readyHours = 0;
    this.neglectHours = 0;
    this.lightsScheduled = false;
    this.lightsOn = false;

    bus.on('food:harvest', () => this.harvest());
  }

  /** @param {{ hourFloat: number }} clock */
  wants(clock) {
    const { activeStartHour, activeEndHour, drawKw } = this.hydroCircuit;
    this.lightsScheduled = clock.hourFloat >= activeStartHour && clock.hourFloat < activeEndHour;
    return { hydro: this.lightsScheduled ? drawKw : 0 };
  }

  harvest() {
    if (!this.ready) return;
    this.resources.add('food', this.cfg.harvestKcal);
    this.ready = false;
    this.readyHours = 0;
    this.growthHours = 0;
    this.bus.emit('food:harvested', { kcal: this.cfg.harvestKcal });
  }

  /** @param {'unharvested' | 'noLight' | 'noWater'} reason */
  spoil(reason) {
    this.ready = false;
    this.readyHours = 0;
    this.neglectHours = 0;
    this.growthHours = 0;
    this.bus.emit('food:spoiled', { reason });
  }

  /** @param {Record<string, boolean>} served @param {number} dtHours */
  update(served, dtHours) {
    const rm = this.resources;
    rm.addRate('food', -this.cfg.consumptionPerHour);

    const circuitUp = served.hydro;
    this.lightsOn = circuitUp && this.lightsScheduled;
    if (this.lightsOn) {
      rm.addRate('water', -this.water.hydroPerHour * (1 - this.water.hydroCondensateFraction));
    }

    if (this.ready) {
      this.readyHours += dtHours;
      if (this.readyHours >= this.cfg.spoilAfterReadyHours - EPS) this.spoil('unharvested');
      return;
    }

    const hasWater = rm.value('water') > 0;
    if (circuitUp && hasWater) {
      this.neglectHours = 0;
      this.growthHours += dtHours;
      if (this.growthHours >= this.cfg.growthHoursToReady - EPS) {
        this.ready = true;
        this.readyHours = 0;
        this.bus.emit('food:ready', {});
      }
    } else {
      this.neglectHours += dtHours;
      if (this.neglectHours >= this.cfg.spoilWithoutCareHours - EPS) this.spoil(circuitUp ? 'noWater' : 'noLight');
    }
  }
}
