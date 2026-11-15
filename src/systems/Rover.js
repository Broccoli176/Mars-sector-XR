// Perseverance-class rover teleoperated from the Sala de control (SIMULATION_SPEC §3.10).
// Headless. Commands are discrete, like real rover driving (drive N m, turn N°), and run in game time.
// Needs the Telecom link (signal ≥ minSignal) to accept commands. Recharges at the base dock through the
// `repairBay` circuit; landing debris brought back to base becomes spares.

/**
 * @typedef {{ type: 'drive', remaining: number, dir: 1 | -1 } | { type: 'turn', remaining: number, dir: 1 | -1 } | { type: 'core', remaining: number, siteId: string }} Action
 */

const DEG = Math.PI / 180;

export class Rover {
  /**
   * @param {any} cfg balance.rover
   * @param {import('mitt').Emitter<any>} bus
   * @param {import('./ResourceManager.js').ResourceManager} resources
   */
  constructor(cfg, bus, resources) {
    this.cfg = cfg;
    this.bus = bus;
    this.resources = resources;
    this.x = cfg.start.x;
    this.y = cfg.start.y;
    /** Radians, 0 = map north (+y), positive = clockwise (right). */
    this.heading = cfg.start.headingDeg * DEG;
    this.batteryWh = cfg.batteryWh;
    /** @type {Action | null} */
    this.action = null;
    this.stuck = false;
    this.stranded = false;
    this.docked = true;
    /** @type {{ siteId: string, kind: 'core' | 'salvage', spares: number }[]} */
    this.cargo = [];
    /** Site ids already sampled. @type {Set<string>} */
    this.visited = new Set();
    this.delivered = { cores: 0, spares: 0 };
    /** @type {string | null} last stop reason (for the status screen) */
    this.lastStop = null;
    /** @type {[number, number][]} */
    this.trail = [[this.x, this.y]];
    this.odometerM = 0;

    bus.on('rover:command', (/** @type {any} */ e) => this.command(e?.cmd));
  }

  get batteryPct() {
    return (100 * this.batteryWh) / this.cfg.batteryWh;
  }

  /** @returns {'docked' | 'idle' | 'driving' | 'turning' | 'coring' | 'stuck' | 'stranded'} */
  get mode() {
    if (this.stranded) return 'stranded';
    if (this.stuck && !this.action) return 'stuck';
    if (this.action?.type === 'drive') return 'driving';
    if (this.action?.type === 'turn') return 'turning';
    if (this.action?.type === 'core') return 'coring';
    return this.docked ? 'docked' : 'idle';
  }

  /** Site within reach that has not been sampled yet. */
  siteInReach() {
    return this.cfg.sites.find((/** @type {any} */ s) => !this.visited.has(s.id) && Math.hypot(s.x - this.x, s.y - this.y) <= this.cfg.siteRadiusM) ?? null;
  }

  distanceToBase() {
    return Math.hypot(this.x - this.cfg.start.x, this.y - this.cfg.start.y);
  }

  /** kW the dock asks from the base (repairBay circuit) this tick. */
  chargeKw() {
    return this.docked && this.batteryWh < this.cfg.batteryWh - 1e-6 ? this.cfg.dockChargeKw : 0;
  }

  /** @param {string} cmd @param {string} reason */
  #reject(cmd, reason) {
    this.bus.emit('rover:rejected', { cmd, reason });
    return false;
  }

  /** @param {string} cmd 'forward' | 'back' | 'left' | 'right' | 'stop' | 'sample' */
  command(cmd) {
    const c = this.cfg;
    if (this.resources.value('signal') < c.minSignal) return this.#reject(cmd, 'noLink');
    if (cmd === 'stop') {
      this.action = null;
      return true;
    }
    if (this.stranded) return this.#reject(cmd, 'battery');
    if (this.action?.type === 'core') return this.#reject(cmd, 'busy');
    switch (cmd) {
      case 'forward':
        if (this.stuck) return this.#reject(cmd, 'stuck');
        this.action = { type: 'drive', remaining: c.forwardStepM, dir: 1 };
        break;
      case 'back':
        this.stuck = false; // backing out the way it came frees the wheels
        this.action = { type: 'drive', remaining: c.backStepM, dir: -1 };
        break;
      case 'left':
      case 'right':
        if (this.stuck) return this.#reject(cmd, 'stuck');
        this.action = { type: 'turn', remaining: c.turnStepDeg, dir: cmd === 'right' ? 1 : -1 };
        break;
      case 'sample': {
        const site = this.siteInReach();
        if (!site) return this.#reject(cmd, 'noSite');
        this.action = { type: 'core', remaining: c.coreHours, siteId: site.id };
        break;
      }
      default:
        return false;
    }
    this.lastStop = null;
    return true;
  }

  /** @param {string} reason */
  #stop(reason) {
    this.action = null;
    this.lastStop = reason;
    this.bus.emit('rover:stopped', { reason });
  }

  /** @param {number} x @param {number} y */
  #blockedByRock(x, y) {
    return this.cfg.rocks.some((/** @type {any} */ r) => Math.hypot(r.x - x, r.y - y) < r.r + this.cfg.radiusM);
  }

  /** @param {number} x @param {number} y */
  #inSand(x, y) {
    return this.cfg.sand.some((/** @type {any} */ s) => Math.hypot(s.x - x, s.y - y) < s.r);
  }

  /**
   * @param {number} dtHours
   * @param {boolean} dockPowered repairBay circuit served this tick
   */
  update(dtHours, dockPowered) {
    const c = this.cfg;
    // Power: MMRTG trickle in, avionics/heaters out, dock charging when at base.
    let wh = (c.mmrtgW - c.loadW) * dtHours;
    if (this.docked && dockPowered) wh += c.dockChargeKw * 1000 * dtHours;
    const a = this.action;
    if (a && !this.stranded) {
      if (a.type === 'drive') {
        const step = Math.min(a.remaining, c.speedMPerHour * dtHours);
        const nx = this.x + Math.sin(this.heading) * step * a.dir;
        const ny = this.y + Math.cos(this.heading) * step * a.dir;
        const m = c.map;
        if (this.#blockedByRock(nx, ny)) {
          this.#stop('obstacle'); // hazard cameras: the rover refuses to drive into a rock
        } else if (nx < m.xMin || nx > m.xMax || ny < m.yMin || ny > m.yMax) {
          this.#stop('edge');
        } else {
          this.x = nx;
          this.y = ny;
          a.remaining -= step;
          this.odometerM += step;
          wh -= step * c.driveWhPerM;
          const [lx, ly] = this.trail[this.trail.length - 1];
          if (Math.hypot(nx - lx, ny - ly) >= c.trailStepM) {
            this.trail.push([nx, ny]);
            if (this.trail.length > 400) this.trail.shift();
          }
          if (a.dir === 1 && this.#inSand(nx, ny)) {
            this.stuck = true;
            this.#stop('sand');
          } else if (a.remaining <= 1e-6) {
            this.action = null;
          }
        }
      } else if (a.type === 'turn') {
        const step = Math.min(a.remaining, c.turnDegPerHour * dtHours);
        this.heading = (this.heading + step * a.dir * DEG + 2 * Math.PI) % (2 * Math.PI);
        a.remaining -= step;
        wh -= step * c.turnWhPerDeg;
        if (a.remaining <= 1e-6) this.action = null;
      } else {
        const share = Math.min(a.remaining, dtHours);
        a.remaining -= share;
        wh -= (c.coreWh * share) / c.coreHours;
        if (a.remaining <= 1e-6) this.#finishCore(a.siteId);
      }
    }

    this.batteryWh = Math.max(0, Math.min(c.batteryWh, this.batteryWh + wh));
    if (!this.stranded && this.batteryWh <= 0) {
      this.stranded = true;
      this.#stop('battery');
    } else if (this.stranded && this.batteryWh >= c.batteryWh * c.strandedResumeFraction) {
      this.stranded = false;
      this.bus.emit('hint', { key: 'rover.hint.recovered' });
    }

    const atBase = this.distanceToBase() <= c.dockRadiusM;
    if (atBase && !this.docked && !this.action) {
      this.docked = true;
      this.#deliver();
    } else if (!atBase) {
      this.docked = false;
    }
  }

  /** @param {string} siteId */
  #finishCore(siteId) {
    this.action = null;
    const site = this.cfg.sites.find((/** @type {any} */ s) => s.id === siteId);
    this.visited.add(siteId);
    this.cargo.push({ siteId, kind: site.kind, spares: site.spares ?? 0 });
    this.bus.emit('rover:sampled', { siteId, kind: site.kind });
    this.bus.emit('hint', { key: site.kind === 'core' ? 'rover.hint.cored' : 'rover.hint.salvaged' });
  }

  #deliver() {
    if (this.cargo.length === 0) return;
    const cores = this.cargo.filter((c) => c.kind === 'core').length;
    const spares = this.cargo.reduce((n, c) => n + c.spares, 0);
    if (spares > 0) this.resources.add('spares', spares);
    this.delivered.cores += cores;
    this.delivered.spares += spares;
    this.cargo = [];
    this.bus.emit('rover:delivered', { cores, spares });
    this.bus.emit('hint', { key: 'rover.hint.delivered', params: { cores, spares } });
  }
}
