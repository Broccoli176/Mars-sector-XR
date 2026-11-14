// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
/**
 * Real Mars-surface radiation, replayed from an embedded NASA OSDR RadLab snapshot
 * (src/data/real/radlab.json, MSL RAD on Curiosity). See SIMULATION_SPEC §6.5.
 *
 * - The game clock's time of day maps to the real 24 h record (UTC timestamps), looping each day.
 * - Accumulates the dose a person would receive ON THE SURFACE during the shift.
 * - INFORMATIONAL ONLY: it does not damage health. The sources give no threshold for this game,
 *   and the crew lives in a regolith-shielded basement (no shielding factor is invented).
 */
export class Radiation {
  /** @param {any} radlab contents of src/data/real/radlab.json */
  constructor(radlab) {
    /** @type {{ minute: number, rate: number }[]} */
    this.samples = radlab.mars.samples
      .map((/** @type {{ t: string, uGyPerHour: number }} */ s) => ({ minute: utcMinuteOfDay(s.t), rate: s.uGyPerHour }))
      .sort((a, b) => a.minute - b.minute);
    if (this.samples.length === 0) throw new Error('radlab.json has no Mars samples');
    this.day = radlab.day;
    this.marsMean = radlab.mars.summary.meanUGyPerHour;
    this.issTypical = radlab.iss?.summary.medianUGyPerHour ?? null;
    this.rate = this.samples[0].rate;
    this.doseMicroGy = 0;
  }

  /**
   * Real dose rate (µGy/h) at a time of day: the last sample at or before that minute (wraps around).
   * @param {number} minuteOfDay 0…1439
   */
  rateAt(minuteOfDay) {
    let best = this.samples[this.samples.length - 1]; // before the first sample → previous day's last
    for (const s of this.samples) {
      if (s.minute <= minuteOfDay) best = s;
      else break;
    }
    return best.rate;
  }

  /** @param {{ hour: number, minute: number }} clock @param {number} dtHours */
  update(clock, dtHours) {
    this.rate = this.rateAt(clock.hour * 60 + clock.minute);
    this.doseMicroGy += this.rate * dtHours;
  }
}

/** @param {string} iso e.g. "2023-01-01T13:45:10" (UTC) */
function utcMinuteOfDay(iso) {
  const time = iso.split('T')[1] ?? '00:00';
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
