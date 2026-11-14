import { createBus } from '../utils/EventBus.js';
import { TimeManager } from './TimeManager.js';
import { ResourceManager } from './ResourceManager.js';
import { PowerGrid } from './PowerGrid.js';
import { LifeSupport } from './LifeSupport.js';
import { Food } from './Food.js';
import { Crew } from './Crew.js';
import { IncidentRunner } from './IncidentRunner.js';
import { GameState } from './GameState.js';
import { Telecom } from './Telecom.js';
import { Radiation } from './Radiation.js';
import { Electronics } from './Electronics.js';

const TICKS_PER_HOUR = 60;

/**
 * Headless composition of all simulation systems. No rendering imports (AGENTS.md §3).
 * Presentation talks to it only through bus intents and read-only access.
 */
export class Simulation {
  /**
   * @param {{ resources: any, balance: any, events: any[], real?: Record<string, any> }} data
   * @param {{ bus?: import('mitt').Emitter<any> }} [opts]
   */
  constructor(data, { bus = createBus() } = {}) {
    const b = data.balance;
    this.bus = bus;
    this.balance = b;
    this.inventory = { ...b.inventory };

    this.time = new TimeManager(b.time, bus);
    this.resources = new ResourceManager(data.resources, bus);
    this.power = new PowerGrid(b.power, b.circuits, this.resources, bus);
    this.lifeSupport = new LifeSupport(b, this.resources, bus, this.inventory);
    this.food = new Food(b, this.resources, bus);
    this.crew = new Crew(b.health, TICKS_PER_HOUR, this.resources, bus);
    this.incidents = new IncidentRunner(data.events, b.time, { bus, power: this.power });
    this.telecom = new Telecom(b.telecom, bus, this.resources);
    // Telecom receiver power supply, repaired at the hub electronics bench (spec §6.6).
    this.electronics = b.electronics ? new Electronics(b.electronics, b.time, bus) : null;
    // Real Mars-surface radiation replay (informational, no health effect). Only if the snapshot exists.
    this.radiation = data.real?.radlab ? new Radiation(data.real.radlab) : null;
    this.game = new GameState(b.gameRules, TICKS_PER_HOUR, {
      bus,
      time: this.time,
      resources: this.resources,
      power: this.power,
      crew: this.crew,
    });
  }

  get phase() {
    return this.game.phase;
  }

  /**
   * Advances by real elapsed time (render loop). Only runs while playing.
   * @param {number} realDt seconds
   */
  advance(realDt) {
    if (this.game.phase !== 'playing') return 0;
    const ticks = this.time.consume(realDt);
    let ran = 0;
    for (; ran < ticks && this.game.phase === 'playing'; ran++) this.step();
    return ran;
  }

  /** Runs exactly one simulation tick (1 in-game minute). */
  step() {
    const dt = 1 / TICKS_PER_HOUR;
    const clock = this.time.clock();
    const circuits = this.balance.circuits;

    this.incidents.update(this.time.tick, clock);

    const ls = this.lifeSupport.wants();
    const hydro = this.food.wants(clock);
    const requests = {
      lifeSupport: ls.lifeSupport,
      heating: ls.heating * circuits.heating.drawKw,
      lighting: circuits.lighting.drawKw,
      telecom: circuits.telecom.drawKw,
      hydro: hydro.hydro,
      repairBay: 0,
    };
    this.power.resolve(requests, clock, this.time.tick);

    this.lifeSupport.update(this.power.served, dt);
    this.food.update(this.power.served, dt);
    this.crew.update(dt);
    this.radiation?.update(clock, dt);
    this.electronics?.update(this.time.tick, dt);
    this.telecom.update(this.power.served.telecom, this.power.stormActive, dt);
    this.resources.commit(dt);

    this.time.advanceTick();
    this.game.check();
  }
}
