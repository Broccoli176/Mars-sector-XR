// @ts-check

/**
 * Headless simulation for the secondary rover: MARS-CLEANER (Autonomous Solar Maintenance Vehicle).
 * Completely independent of the Perseverance exploration rover (Rover.js).
 *
 * Responsibilities:
 * - Independent battery (2400 Wh).
 * - External charging dock outside the habitat.
 * - Dispatched by player from Energy room console.
 * - Navigates to individual solar panels (0..11) and cleans settled dust.
 * - Progressively recovers PowerGrid.dustFactor.
 * - Recharges from the base power grid via the repairBay circuit when docked.
 */
export class MaintenanceRover {
  /**
   * @param {any} cfg
   * @param {import('mitt').Emitter<any>} bus
   * @param {import('./PowerGrid.js').PowerGrid} powerGrid
   */
  constructor(cfg, bus, powerGrid) {
    this.bus = bus;
    this.powerGrid = powerGrid;

    this.maxBatteryWh = cfg?.batteryWh ?? 2400;
    this.batteryWh = this.maxBatteryWh;
    this.dockKw = cfg?.dockKw ?? 0.3; // 300 W charging draw
    this.driveW = cfg?.driveW ?? 150;
    this.cleanW = cfg?.cleanW ?? 280;

    /** Dock coordinates (world space, outside east window near solar array) */
    this.dockPos = { x: 22.0, z: 1.5 };
    this.x = this.dockPos.x;
    this.z = this.dockPos.z;

    /** World coordinates of each of the 12 panels (row 0: 0..5, row 1: 6..11) */
    this.panelCoords = [];
    const ROW_X = [25.0, 28.5];
    const ROW_Z_OFFSET = [0, 1.5];
    for (let k = 0; k < 12; k++) {
      const row = Math.floor(k / 6);
      const col = k % 6;
      const pz = 7.0 - 7.5 + col * 3.0 + ROW_Z_OFFSET[row];
      const px = ROW_X[row];
      this.panelCoords.push({ x: px, z: pz });
    }

    /** @type {'docked' | 'ready' | 'traveling' | 'cleaning' | 'returning' | 'charging' | 'broken'} */
    this.status = 'docked';

    /** Panels queued for cleaning */
    /** @type {number[]} */
    this.targets = [];
    this.currentTargetIdx = -1;
    this.cleaningTimer = 0;
    this.cleaningDurationPerPanel = cfg?.cleanTimeS ?? 8.0; // game seconds per panel

    /** Individual dust level per panel (0 = clean, 1 = filthy) */
    this.panelDust = new Float32Array(12).fill(0.3);

    // Intent listeners
    bus.on('cleaner:dispatch', (/** @type {any} */ e) => {
      this.dispatch(e?.panels);
    });
    bus.on('cleaner:return', () => {
      this.recall();
    });
  }

  get batteryPct() {
    return (100 * this.batteryWh) / this.maxBatteryWh;
  }

  get isDocked() {
    return this.status === 'docked' || this.status === 'charging' || this.status === 'ready';
  }

  /** Power demanded from base grid when docked and battery needs charging. */
  chargeKw() {
    return this.isDocked && this.batteryWh < this.maxBatteryWh - 1e-4 ? this.dockKw : 0;
  }

  /**
   * Dispatches rover to clean selected panels.
   * @param {number[]} [panelIndices]
   */
  dispatch(panelIndices) {
    if (this.status === 'broken' || this.batteryPct < 15) {
      this.bus.emit('cleaner:rejected', { reason: 'batteryLow' });
      return false;
    }
    const selection = Array.isArray(panelIndices) && panelIndices.length > 0
      ? panelIndices.filter((idx) => idx >= 0 && idx < 12)
      : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

    if (selection.length === 0) return false;

    this.targets = [...selection];
    this.currentTargetIdx = this.targets.shift() ?? -1;
    this.status = 'traveling';
    this.cleaningTimer = 0;
    this.bus.emit('cleaner:dispatched', { targetsCount: selection.length });
    return true;
  }

  /** Recalls rover immediately back to dock. */
  recall() {
    if (this.status === 'docked' || this.status === 'charging') return;
    this.targets = [];
    this.currentTargetIdx = -1;
    this.status = 'returning';
    this.bus.emit('cleaner:returning', {});
  }

  /**
   * Advances simulation by dt (hours).
   * @param {number} dtHours
   * @param {boolean} chargingPowerAvailable
   */
  update(dtHours, chargingPowerAvailable) {
    const dtSeconds = dtHours * 3600;

    // A. Recharging at dock
    if (this.isDocked) {
      if (this.batteryWh < this.maxBatteryWh - 1e-3) {
        if (chargingPowerAvailable) {
          this.status = 'charging';
          this.batteryWh = Math.min(this.maxBatteryWh, this.batteryWh + this.dockKw * 1000 * dtHours);
        } else {
          this.status = 'docked';
        }
      } else {
        this.status = 'ready';
      }
      return;
    }

    // Battery check while working
    if (this.batteryWh <= 0) {
      this.batteryWh = 0;
      this.status = 'broken';
      this.bus.emit('cleaner:stranded', { x: this.x, z: this.z });
      return;
    }

    // B. Traveling towards current target or returning to dock
    const dest = this.currentTargetIdx >= 0
      ? this.panelCoords[this.currentTargetIdx]
      : this.dockPos;

    const dx = dest.x - this.x;
    const dz = dest.z - this.z;
    const dist = Math.hypot(dx, dz);

    if (this.status === 'traveling' || this.status === 'returning') {
      // Consume drive energy
      this.batteryWh -= (this.driveW * dtSeconds) / 3600;
      const moveDist = 1.2 * dtSeconds; // 1.2 m/s rover speed

      if (dist <= moveDist || dist < 0.2) {
        this.x = dest.x;
        this.z = dest.z;
        if (this.status === 'returning') {
          this.status = 'docked';
          this.bus.emit('cleaner:docked', {});
        } else if (this.currentTargetIdx >= 0) {
          this.status = 'cleaning';
          this.cleaningTimer = 0;
        }
      } else {
        this.x += (dx / dist) * moveDist;
        this.z += (dz / dist) * moveDist;
      }
    } else if (this.status === 'cleaning') {
      // Consume cleaning energy
      this.batteryWh -= (this.cleanW * dtSeconds) / 3600;
      this.cleaningTimer += dtSeconds;

      if (this.cleaningTimer >= this.cleaningDurationPerPanel) {
        // Clean current panel: restore 1/12th of total potential dust recovery
        const panelIdx = this.currentTargetIdx;
        this.panelDust[panelIdx] = 0.05;
        const recovered = this.powerGrid.cleanPanelPortion(1 / 12, 0.95);
        this.bus.emit('cleaner:panelCleaned', { panelIndex: panelIdx, recovered });

        // Next target or return
        if (this.targets.length > 0) {
          this.currentTargetIdx = this.targets.shift() ?? -1;
          this.status = 'traveling';
          this.cleaningTimer = 0;
        } else {
          this.currentTargetIdx = -1;
          this.status = 'returning';
        }
      }
    }
  }
}
