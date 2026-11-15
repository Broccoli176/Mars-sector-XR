// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
/**
 * Real Mars-surface radiation, replayed from embedded NASA OSDR RadLab snapshots (MSL RAD on Curiosity).
 * See SIMULATION_SPEC §6.5.
 *
 * - Normal days: the game clock's time of day maps to a real 24 h record (src/data/real/radlab.json).
 * - Solar particle event (SEP, `spaceWeather:impact { kind: 'sep' }`): the rate follows the REAL storm that
 *   RAD measured on 20 May 2024 (src/data/real/radlab_sep.json), minute by minute from its onset.
 * - Shelter: NASA-STD-3001 asks to protect the crew from SPEs (250 mSv per event limit) by alerting them
 *   to seek shelter; on a planetary surface the guideline is ~10 g/cm² of water-equivalent shielding around
 *   the astronaut (OCHMO-TB-020). The game's shelter is the bunk in Personal, walled with water tanks.
 *   Presentation reports where the player is with the intent `crew:shelter { inside }`.
 * - Consequence (GAME RULE, not a medical model): while the real storm rate is above `shelterAboveUGyPerHour`
 *   and the player is outside the shelter, health drops by `unshelteredDamagePerHour` (cause 'radiation').
 *   Outside a storm radiation never harms health: the basement sits under regolith and the dose is small.
 */
export class Radiation {
  /**
   * @param {any} radlab contents of src/data/real/radlab.json
   * @param {{ sep?: any, cfg?: any, bus?: import('mitt').Emitter<any> }} [opts]
   *   sep: src/data/real/radlab_sep.json · cfg: balance.radiation
   */
  constructor(radlab, { sep = null, cfg = null, bus } = {}) {
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

    this.cfg = cfg;
    this.sepData = sep;
    /** Real storm profile, minutes after its onset. @type {{ minute: number, rate: number }[]} */
    this.sepProfile = [];
    if (sep?.event?.onsetUtc) {
      const onset = Date.parse(`${sep.event.onsetUtc}Z`);
      this.sepProfile = sep.mars.samples
        .map((/** @type {{ t: string, uGyPerHour: number }} */ s) => ({ minute: (Date.parse(`${s.t}Z`) - onset) / 60000, rate: s.uGyPerHour }))
        .filter((/** @type {{ minute: number }} */ s) => s.minute >= 0);
    }
    /** Minutes since the storm began, or null when there is no storm. @type {number | null} */
    this.stormMinute = null;
    this.stormDoseMicroGy = 0;
    this.stormPeak = 0;
    /** Game minutes spent outside the shelter while the storm rate was dangerous. */
    this.exposedMinutes = 0;
    this.sheltered = false;

    bus?.on('spaceWeather:impact', (/** @type {any} */ e) => {
      if (e?.kind === 'sep' && this.sepProfile.length) this.startStorm();
    });
    bus?.on('crew:shelter', (/** @type {any} */ e) => {
      this.sheltered = Boolean(e?.inside);
    });
  }

  startStorm() {
    this.stormMinute = 0;
    this.stormDoseMicroGy = 0;
    this.stormPeak = 0;
    this.exposedMinutes = 0;
  }

  get stormActive() {
    return this.stormMinute !== null;
  }

  /** Storm rate above the shelter threshold: stay in the shelter now. */
  get shelterNeeded() {
    return this.stormActive && this.cfg !== null && this.rate >= this.cfg.shelterAboveUGyPerHour;
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

  /** Real storm rate this many minutes after its onset (last sample at or before). @param {number} minute */
  stormRateAt(minute) {
    let best = this.sepProfile[0];
    for (const s of this.sepProfile) {
      if (s.minute <= minute) best = s;
      else break;
    }
    return best.rate;
  }

  /** @param {{ hour: number, minute: number }} clock @param {number} dtHours */
  update(clock, dtHours) {
    const background = this.rateAt(clock.hour * 60 + clock.minute);
    if (this.stormMinute !== null) {
      const last = this.sepProfile[this.sepProfile.length - 1];
      const ended = this.stormMinute > last.minute || (this.cfg && this.stormMinute > this.cfg.stormMaxHours * 60);
      if (ended) {
        this.stormMinute = null;
      } else {
        // The storm adds its excess over the record's own background to today's real background.
        const excess = Math.max(0, this.stormRateAt(this.stormMinute) - this.sepData.event.backgroundUGyPerHour);
        this.rate = background + excess;
        this.stormDoseMicroGy += this.rate * dtHours;
        this.stormPeak = Math.max(this.stormPeak, this.rate);
        if (this.shelterNeeded && !this.sheltered) this.exposedMinutes += dtHours * 60;
        this.stormMinute += dtHours * 60;
        this.doseMicroGy += this.rate * dtHours;
        return;
      }
    }
    this.rate = background;
    this.doseMicroGy += this.rate * dtHours;
  }

  /** Health damage per hour by cause for Crew (empty unless a storm catches the player outside the shelter). */
  crewDamage() {
    if (this.shelterNeeded && !this.sheltered) return { radiation: this.cfg.unshelteredDamagePerHour };
    return {};
  }
}

/** @param {string} iso e.g. "2023-01-01T13:45:10" (UTC) */
function utcMinuteOfDay(iso) {
  const time = iso.split('T')[1] ?? '00:00';
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
