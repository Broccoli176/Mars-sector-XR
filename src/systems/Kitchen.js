// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Hours accumulate in 1/60 steps; compare with a tolerance to avoid float drift.
const EPS = 1e-6;

/**
 * @typedef {'protein' | 'carb' | 'fresh'} ItemKind
 * @typedef {{ itemId: string, kind: ItemKind, kcal: number, ageHours: number }} Lot
 * @typedef {{ id: string, inputs: Partial<Record<ItemKind, number>>, multiplier: number, hours: number, drawKw: number }} Recipe
 */

/**
 * Pantry + food processor (SIMULATION_SPEC §3.6.1). Harvests (`food:harvested`) arrive here as raw lots
 * that spoil after `rawShelfHours`; the processor turns them into bars worth more kcal, using power from
 * the hydro circuit and time. Eating raw is the no-power emergency path (100 % kcal, no bonus).
 * Owns no resource: it adds kcal to `food` through the ResourceManager.
 */
export class Kitchen {
  /**
   * @param {any} cfg balance.kitchen
   * @param {import('./ResourceManager.js').ResourceManager} resources
   * @param {import('mitt').Emitter<any>} bus
   */
  constructor(cfg, resources, bus) {
    this.cfg = cfg;
    this.resources = resources;
    this.bus = bus;
    /** @type {Record<string, ItemKind>} */
    this.kinds = cfg.items;
    /** @type {Recipe[]} */
    this.recipes = cfg.recipes;
    /** @type {Lot[]} oldest first */
    this.pantry = [];
    /** @type {string} */
    this.selected = this.recipes[0].id;
    /** @type {{ recipeId: string, hours: number, progressHours: number, kcal: number } | null} */
    this.job = null;
    /** @type {Record<string, number>} bars made this run, per recipe */
    this.bars = Object.fromEntries(this.recipes.map((r) => [r.id, 0]));
    this.powered = true;

    bus.on('food:harvested', (/** @type {any} */ e) => this.store(e?.cropId, Number(e?.kcal) || 0));
    bus.on('kitchen:select', (/** @type {any} */ e) => this.select(e?.recipeId));
    bus.on('kitchen:process', () => this.process());
    bus.on('kitchen:auto', () => this.auto());
    bus.on('kitchen:eat', () => this.eatRaw());
  }

  /** @param {string} id */
  recipe(id) {
    return this.recipes.find((r) => r.id === id) ?? null;
  }

  get busy() {
    return this.job !== null;
  }

  /** Raw lots per kind. */
  get stock() {
    /** @type {Record<ItemKind, number>} */
    const out = { protein: 0, carb: 0, fresh: 0 };
    for (const lot of this.pantry) out[lot.kind]++;
    return out;
  }

  /** Units still missing for a recipe (empty object ⇒ can process). @param {string} recipeId */
  missing(recipeId) {
    const r = this.recipe(recipeId);
    /** @type {Partial<Record<ItemKind, number>>} */
    const out = {};
    if (!r) return out;
    const stock = this.stock;
    for (const [kind, n] of Object.entries(r.inputs)) {
      const lack = (n ?? 0) - stock[/** @type {ItemKind} */ (kind)];
      if (lack > 0) out[/** @type {ItemKind} */ (kind)] = lack;
    }
    return out;
  }

  /** @param {string} recipeId */
  canProcess(recipeId) {
    return Object.keys(this.missing(recipeId)).length === 0;
  }

  /** kcal a recipe would yield with the current (oldest-first) lots, or 0 if ingredients are missing. @param {string} recipeId */
  previewKcal(recipeId) {
    const r = this.recipe(recipeId);
    if (!r || !this.canProcess(recipeId)) return 0;
    return Math.round(this.#pick(r).reduce((s, lot) => s + lot.kcal, 0) * r.multiplier);
  }

  /** @param {string | undefined} itemId @param {number} kcal */
  store(itemId, kcal) {
    if (!itemId || kcal <= 0) return;
    const kind = this.kinds[itemId];
    if (!kind) return;
    this.pantry.push({ itemId, kind, kcal, ageHours: 0 });
    this.bus.emit('kitchen:stored', { itemId, kcal });
  }

  /** @param {string | undefined} recipeId */
  select(recipeId) {
    if (recipeId && this.recipe(recipeId)) this.selected = recipeId;
  }

  /** Recipe that yields the most kcal with the current pantry, or null if none can be made. */
  best() {
    let best = null;
    let bestKcal = 0;
    for (const r of this.recipes) {
      const kcal = this.previewKcal(r.id);
      if (kcal > bestKcal) {
        best = r.id;
        bestKcal = kcal;
      }
    }
    return best;
  }

  /** One-button cooking: picks the best recipe and starts it. Lone ingredients no recipe uses are rejected as 'missing'. */
  auto() {
    const best = this.best();
    if (best && !this.job) this.selected = best;
    this.process();
  }

  process() {
    const recipeId = this.selected;
    const r = /** @type {Recipe} */ (this.recipe(recipeId));
    if (this.job) return this.#reject(recipeId, 'busy');
    if (this.pantry.length === 0) return this.#reject(recipeId, 'empty');
    if (!this.canProcess(recipeId)) return this.#reject(recipeId, 'missing');
    if (!this.powered) return this.#reject(recipeId, 'noPower');
    const lots = this.#pick(r);
    this.pantry = this.pantry.filter((lot) => !lots.includes(lot));
    const kcal = Math.round(lots.reduce((s, lot) => s + lot.kcal, 0) * r.multiplier);
    this.job = { recipeId, hours: r.hours, progressHours: 0, kcal };
    this.bus.emit('kitchen:started', { recipeId, hours: r.hours });
  }

  /** Emergency: eat every raw lot now at 100 % kcal, no power needed. */
  eatRaw() {
    if (this.pantry.length === 0) return this.#reject(undefined, 'empty');
    const kcal = this.pantry.reduce((s, lot) => s + lot.kcal, 0);
    this.pantry = [];
    this.resources.add('food', kcal);
    this.bus.emit('kitchen:eaten', { kcal });
  }

  /** Oldest lots that satisfy the recipe inputs. @param {Recipe} r */
  #pick(r) {
    /** @type {Lot[]} */
    const lots = [];
    for (const [kind, n] of Object.entries(r.inputs)) {
      lots.push(...this.pantry.filter((lot) => lot.kind === kind).slice(0, n ?? 0));
    }
    return lots;
  }

  /** @param {string | undefined} recipeId @param {'missing' | 'busy' | 'noPower' | 'empty'} reason */
  #reject(recipeId, reason) {
    this.bus.emit('kitchen:rejected', { recipeId, reason });
  }

  /** Power request on the hydro circuit while a job runs. */
  wants() {
    const r = this.job ? this.recipe(this.job.recipeId) : null;
    return { hydro: r ? r.drawKw : 0 };
  }

  /** @param {Record<string, boolean>} served @param {number} dtHours */
  update(served, dtHours) {
    this.powered = Boolean(served.hydro);

    // Raw produce ages whether or not there is power (no refrigeration modelled).
    for (const lot of this.pantry) lot.ageHours += dtHours;
    const shelf = this.cfg.rawShelfHours;
    const spoiled = this.pantry.filter((lot) => lot.ageHours >= shelf - EPS);
    if (spoiled.length) {
      this.pantry = this.pantry.filter((lot) => lot.ageHours < shelf - EPS);
      for (const lot of spoiled) this.bus.emit('kitchen:spoiled', { itemId: lot.itemId, kcal: lot.kcal });
    }

    // The processor pauses (keeps its progress) without power.
    if (!this.job || !this.powered) return;
    this.job.progressHours += dtHours;
    if (this.job.progressHours >= this.job.hours - EPS) {
      const { recipeId, kcal } = this.job;
      this.job = null;
      this.resources.add('food', kcal);
      this.bars[recipeId] = (this.bars[recipeId] ?? 0) + 1;
      this.bus.emit('kitchen:done', { recipeId, kcal });
    }
  }
}
