// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
//
// Downloads ONE real day of radiation data from NASA OSDR RadLab and writes an embedded snapshot:
//   src/data/real/radlab.json
//
// Why a script (and not a live call from the game): the RadLab API sends no CORS header, so the
// Quest browser cannot call it. The snapshot is committed and labelled in-game as a replay, not live.
//
// Usage:  npm run data:radlab            (default day 2023-01-01)
//         npm run data:radlab -- 2023-06-15
//         npm run data:radlab:sep           (= 2024-05-20 --days 3 --out radlab_sep: the May 2024 solar storm)
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://visualization.osdr.nasa.gov/radlab/api/';
const args = process.argv.slice(2);
const flag = (/** @type {string} */ name, /** @type {string} */ fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const day = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? '2023-01-01';
const days = Number(flag('--days', '1'));
const outName = flag('--out', 'radlab');
if (!/^[a-z_]+$/.test(outName)) throw new Error(`--out must be a simple name, got "${outName}"`);
const next = new Date(`${day}T00:00:00Z`);
next.setUTCDate(next.getUTCDate() + days);
const dayEnd = next.toISOString().slice(0, 10);

/** Builds a RadLab key-value query (operators encoded as the docs require). */
function queryUrl(/** @type {string} */ selector) {
  return `${API}?${selector}&timestamp%3E=${day}&timestamp%3C${dayEnd}&absorbed_dose_rate&format=csv`;
}

/** @param {string} url */
async function fetchSeries(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'marsianics-data-script' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const lines = (await res.text()).trim().split(/\r?\n/);
  const header = lines.shift()?.split(',') ?? [];
  const iT = header.indexOf('timestamp');
  const iV = header.indexOf('absorbed_dose_rate');
  const iId = header.indexOf('instrument_id');
  if (iT < 0 || iV < 0) throw new Error(`Unexpected columns: ${header.join(',')}`);
  return lines
    .map((line) => line.split(',').map((c) => c.replace(/^"|"$/g, '')))
    .map((c) => ({ t: c[iT], instrument: c[iId], uGyPerHour: Number(c[iV]) }))
    .filter((r) => Number.isFinite(r.uGyPerHour));
}

/** @param {{ uGyPerHour: number }[]} rows */
function summary(rows) {
  const v = rows.map((r) => r.uGyPerHour).sort((x, y) => x - y);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  // The median is the "typical" value: ISS series contain short spikes (South Atlantic Anomaly passes)
  // that pull the mean far above the usual level.
  return {
    samples: v.length,
    meanUGyPerHour: round(mean),
    medianUGyPerHour: round(v[Math.floor(v.length / 2)]),
    p95UGyPerHour: round(v[Math.floor(v.length * 0.95)]),
    minUGyPerHour: round(v[0]),
    maxUGyPerHour: round(v[v.length - 1]),
    meanUGyPerDay: round(mean * 24),
  };
}
const round = (/** @type {number} */ x) => Math.round(x * 1000) / 1000;

const marsUrl = queryUrl('instrument_id=MSL-RAD-Surface');
const issUrl = queryUrl('spacecraft=ISS&instrument=DosTel');
const [mars, iss] = await Promise.all([fetchSeries(marsUrl), fetchSeries(issUrl)]);
if (mars.length === 0) throw new Error(`No MSL RAD data for ${day}; try another date`);

const out = {
  _about: 'Embedded REAL data snapshot (not live). Regenerate with `npm run data:radlab -- YYYY-MM-DD`.',
  source: {
    institution: 'NASA Open Science Data Repository (OSDR)',
    product: 'RadLab',
    url: 'https://visualization.osdr.nasa.gov/radlab/',
    apiDocs: 'https://visualization.osdr.nasa.gov/radlab/gui/data-api/',
    terms: 'https://www.nasa.gov/reference/osdr-help-terms-and-conditions/',
    retrievedAt: new Date().toISOString().slice(0, 10),
  },
  day,
  days,
  units: { rate: 'µGy/h (absorbed dose rate)' },
  mars: {
    label: 'Mars surface, Gale crater — RAD on the Curiosity rover (MSL)',
    instrumentId: 'MSL-RAD-Surface',
    query: marsUrl,
    summary: summary(mars),
    samples: mars.map((r) => ({ t: r.t, uGyPerHour: round(r.uGyPerHour) })),
  },
  iss: iss.length
    ? { label: 'International Space Station — DosTel', query: issUrl, summary: summary(iss) }
    : null,
};

// Solar particle event onset: first sample above 3× the median of the first 3 hours (multi-day records only).
if (days > 1) {
  const t0 = Date.parse(`${mars[0].t}Z`);
  const early = mars.filter((r) => Date.parse(`${r.t}Z`) - t0 < 3 * 3600e3).map((r) => r.uGyPerHour).sort((a, b) => a - b);
  const background = early[Math.floor(early.length / 2)];
  const onset = mars.find((r) => r.uGyPerHour > 3 * background);
  const peak = mars.reduce((a, b) => (b.uGyPerHour > a.uGyPerHour ? b : a));
  // Event dose above background, integrated sample by sample (µGy).
  let excess = 0;
  for (let i = 1; i < mars.length; i++) {
    const dtH = (Date.parse(`${mars[i].t}Z`) - Date.parse(`${mars[i - 1].t}Z`)) / 3600e3;
    excess += Math.max(0, mars[i - 1].uGyPerHour - background) * dtH;
  }
  /** @type {any} */ (out).event = {
    backgroundUGyPerHour: round(background),
    onsetUtc: onset?.t ?? null,
    peakUtc: peak.t,
    peakUGyPerHour: round(peak.uGyPerHour),
    excessDoseUGy: round(excess),
  };
}
const target = fileURLToPath(new URL(`../src/data/real/${outName}.json`, import.meta.url));
mkdirSync(fileURLToPath(new URL('../src/data/real/', import.meta.url)), { recursive: true });
writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${target}`);
console.log(`Mars ${day}: ${out.mars.summary.samples} samples, mean ${out.mars.summary.meanUGyPerHour} µGy/h (${out.mars.summary.meanUGyPerDay} µGy/day)`);
if (out.iss) console.log(`ISS  ${day}: ${out.iss.summary.samples} samples, median ${out.iss.summary.medianUGyPerHour} µGy/h, mean ${out.iss.summary.meanUGyPerHour} µGy/h (max ${out.iss.summary.maxUGyPerHour})`);
