// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Hours accumulate in 1/60 steps; compare with a tolerance to avoid float drift.
const EPS = 1e-6;

/**
 * @typedef {{ id: string, cropId: string | null, growthHours: number, moisture: number,
 *   ready: boolean, readyHours: number, neglectHours: number }} Tray
 * @typedef {'unharvested' | 'noLight' | 'noWater' | 'overwatered'} SpoilReason
 */

/**
 * Rations + hydroponics (SIMULATION_SPEC §3.6): 4 sowable trays watered by hand (moisture band),
 * plus a spirulina bioreactor that only needs light. Owns no resource: it adds rates/deltas through
 * the ResourceManager (food consumption, water, oxygen). Harvests become raw pantry lots (Kitchen.js).
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
    /** @type {Record<string, { id: string, growthHours: number, kcal: number, drinkPerHour: number }>} */
    this.crops = Object.fromEntries(this.cfg.crops.map((/** @type {any} */ c) => [c.id, c]));

    /** @type {Tray[]} */
    this.trays = this.cfg.trays.map((/** @type {any} */ t) => ({
      id: t.id,
      cropId: t.cropId ?? null,
      growthHours: t.growthHours ?? 0,
      moisture: t.moisture ?? this.cfg.initialMoisture,
      ready: false,
      readyHours: 0,
      neglectHours: 0,
    }));
    const bio = this.cfg.bioreactor;
    this.bioreactor = { growthHours: bio.initialGrowthHours ?? 0, ready: false, o2Total: 0 };
    this.lightsScheduled = false;
    this.lightsOn = false;
    // Shared nutrient solution (0..1): feeds every channel; low level slows growth, never kills.
    const nut = this.cfg.nutrients;
    this.nutrients = nut?.initial ?? 1;
    this.cartridges = nut?.cartridges ?? 0;
    this.nutrientsLow = false;

    bus.on('food:harvest', (/** @type {any} */ e) => this.harvest(e?.trayId));
    bus.on('hydro:sow', (/** @type {any} */ e) => this.sow(e?.trayId, e?.cropId));
    bus.on('hydro:water', (/** @type {any} */ e) => this.waterTray(e?.trayId, Number(e?.liters) || 0));
    bus.on('hydro:feed', () => this.feed());
  }

  /** @param {string} id */
  tray(id) {
    return this.trays.find((t) => t.id === id) ?? null;
  }

  /** Any tray (or the bioreactor) ready to harvest. */
  get anyReady() {
    return this.bioreactor.ready || this.trays.some((t) => t.ready);
  }

  /** @param {{ hourFloat: number }} clock */
  wants(clock) {
    const { activeStartHour, activeEndHour, drawKw } = this.hydroCircuit;
    this.lightsScheduled = clock.hourFloat >= activeStartHour && clock.hourFloat < activeEndHour;
    return { hydro: this.lightsScheduled ? drawKw : 0 };
  }

  /** @param {string} trayId @param {string} cropId */
  sow(trayId, cropId) {
    const tray = this.tray(trayId);
    if (!tray || !this.crops[cropId]) return;
    if (tray.cropId) {
      this.bus.emit('hydro:rejected', { trayId, reason: 'notEmpty' });
      return;
    }
    Object.assign(tray, { cropId, growthHours: 0, ready: false, readyHours: 0, neglectHours: 0 });
    this.bus.emit('hydro:sown', { trayId, cropId });
  }

  /** Hose intent: liters leave the tank; moisture is capped at 1 (the excess spills). @param {string} trayId @param {number} liters */
  waterTray(trayId, liters) {
    const tray = this.tray(trayId);
    if (!tray || liters <= 0) return;
    const available = this.resources.value('water');
    if (available <= 0) {
      this.bus.emit('hydro:rejected', { trayId, reason: 'noWater' });
      return;
    }
    const used = Math.min(liters, available);
    this.resources.add('water', -used);
    tray.moisture = Math.min(1, tray.moisture + used / this.cfg.trayCapacityL);
  }

  /** Adds one nutrient cartridge to the shared solution. */
  feed() {
    const nut = this.cfg.nutrients;
    if (!nut) return;
    if (this.cartridges <= 0) {
      this.bus.emit('hydro:rejected', { reason: 'noCartridge' });
      return;
    }
    if (this.nutrients > 1 - nut.perCartridge / 2) {
      this.bus.emit('hydro:rejected', { reason: 'full' });
      return;
    }
    this.cartridges--;
    this.nutrients = Math.min(1, this.nutrients + nut.perCartridge);
    this.nutrientsLow = this.nutrients < nut.lowAt;
    this.bus.emit('hydro:fed', { level: this.nutrients, cartridgesLeft: this.cartridges });
  }

  /** Growth speed from the nutrient level: 1 normally, slowFactor when the solution is depleted. */
  get growthFactor() {
    const nut = this.cfg.nutrients;
    return nut && this.nutrients < nut.lowAt ? nut.slowFactor : 1;
  }

  /** @param {string} [trayId] omitted ⇒ harvest everything ready */
  harvest(trayId) {
    if (trayId === undefined) {
      for (const t of this.trays) if (t.ready) this.#harvestTray(t);
      if (this.bioreactor.ready) this.#harvestBio();
      return;
    }
    if (trayId === 'bioreactor') {
      if (this.bioreactor.ready) this.#harvestBio();
      return;
    }
    const tray = this.tray(trayId);
    if (tray?.ready) this.#harvestTray(tray);
  }

  /** @param {Tray} tray */
  #harvestTray(tray) {
    const crop = this.crops[/** @type {string} */ (tray.cropId)];
    // The produce goes raw to the pantry (src/systems/Kitchen.js listens to food:harvested); no kcal yet.
    this.bus.emit('food:harvested', { trayId: tray.id, cropId: crop.id, kcal: crop.kcal });
    this.#empty(tray);
  }

  #harvestBio() {
    const { kcal } = this.cfg.bioreactor;
    this.bioreactor.ready = false;
    this.bioreactor.growthHours = 0;
    this.bus.emit('food:harvested', { trayId: 'bioreactor', cropId: 'spirulina', kcal });
  }

  /** @param {Tray} tray */
  #empty(tray) {
    Object.assign(tray, { cropId: null, growthHours: 0, ready: false, readyHours: 0, neglectHours: 0 });
  }

  /** @param {Tray} tray @param {SpoilReason} reason */
  spoil(tray, reason) {
    const cropId = tray.cropId;
    this.#empty(tray);
    this.bus.emit('food:spoiled', { trayId: tray.id, cropId, reason });
  }

  /** @param {Record<string, boolean>} served @param {number} dtHours */
  update(served, dtHours) {
    const rm = this.resources;
    const cfg = this.cfg;
    rm.addRate('food', -cfg.consumptionPerHour);

    const circuitUp = served.hydro;
    this.lightsOn = circuitUp && this.lightsScheduled;

    const nut = cfg.nutrients;
    const photo = cfg.photosynthesis;
    const growthFactor = this.growthFactor;
    for (const tray of this.trays) {
      if (!tray.cropId) continue;
      const crop = this.crops[tray.cropId];
      if (this.lightsOn) {
        // Transpiration: the tray dries; part of that water is recovered as condensate.
        const drunk = Math.min(tray.moisture, crop.drinkPerHour * dtHours);
        tray.moisture -= drunk;
        rm.addRate('water', (drunk / dtHours) * cfg.trayCapacityL * this.water.hydroCondensateFraction);
      }
      if (tray.ready) {
        tray.readyHours += dtHours;
        if (tray.readyHours >= cfg.spoilAfterReadyHours - EPS) this.spoil(tray, 'unharvested');
        continue;
      }
      /** @type {SpoilReason | null} */
      const problem = !circuitUp ? 'noLight' : tray.moisture < cfg.dryAt ? 'noWater' : tray.moisture > cfg.floodAt ? 'overwatered' : null;
      if (problem) {
        tray.neglectHours += dtHours;
        if (tray.neglectHours >= cfg.spoilWithoutCareHours - EPS) this.spoil(tray, problem);
        continue;
      }
      tray.neglectHours = 0;
      tray.growthHours += dtHours * growthFactor;
      if (this.lightsOn) {
        // A healthy plant under light takes up nutrients and photosynthesises (CO₂ in, O₂ out).
        if (nut) this.nutrients = Math.max(0, this.nutrients - nut.usePerTrayHour * dtHours);
        if (photo) {
          rm.addRate('co2', -photo.co2PerTrayHour);
          rm.addRate('oxygen', photo.o2PerTrayHour);
        }
      }
      if (tray.growthHours >= crop.growthHours - EPS) {
        tray.ready = true;
        tray.readyHours = 0;
        this.bus.emit('food:ready', { trayId: tray.id, cropId: tray.cropId });
      }
    }

    if (nut && !this.nutrientsLow && this.nutrients < nut.lowAt) {
      this.nutrientsLow = true;
      this.bus.emit('hydro:nutrientsLow', {});
    }

    // Spirulina photobioreactor: grows and releases O₂ only under light; it waits (no spoilage) when ready.
    const bio = cfg.bioreactor;
    if (this.lightsOn) {
      rm.addRate('water', -bio.waterPerHour);
      rm.addRate('oxygen', bio.o2PerHour);
      this.bioreactor.o2Total += bio.o2PerHour * dtHours;
      if (!this.bioreactor.ready) {
        this.bioreactor.growthHours += dtHours;
        if (this.bioreactor.growthHours >= bio.growthHours - EPS) {
          this.bioreactor.ready = true;
          this.bus.emit('food:ready', { trayId: 'bioreactor', cropId: 'spirulina' });
        }
      }
    }
  }
}
