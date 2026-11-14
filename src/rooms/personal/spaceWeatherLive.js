// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
//
// NASA DONKI space weather, LIVE from the browser (api.nasa.gov allows CORS), with an honest
// fallback to the embedded snapshot src/data/real/donki_recent.json when there is no network.
// Presentation-only: it never feeds the simulation (the game keeps working offline / on the Quest).
// The UI must say "EN VIVO" only when `state.status === 'live'`.

export const DONKI_BASE = 'https://api.nasa.gov/DONKI/';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Last `days` days ending today, as YYYY-MM-DD. @param {number} days @param {Date} now */
export function dateRange(days, now) {
  const iso = (/** @type {Date} */ d) => d.toISOString().slice(0, 10);
  return { start: iso(new Date(now.getTime() - days * DAY_MS)), end: iso(now) };
}

/**
 * Kid-sized summary of DONKI events.
 * @param {{ cme?: any[], gst?: any[], sep?: any[] }} raw
 */
export function summarizeDonki({ cme = [], gst = [], sep = [] }) {
  const speeds = cme.flatMap((e) => (e.cmeAnalyses ?? []).map((/** @type {any} */ a) => Number(a.speed))).filter((v) => Number.isFinite(v) && v > 0);
  const kps = gst.flatMap((e) => (e.allKpIndex ?? []).map((/** @type {any} */ k) => Number(k.kpIndex))).filter(Number.isFinite);
  return {
    cmeCount: cme.length,
    fastestCmeKms: speeds.length ? Math.round(Math.max(...speeds)) : null,
    gstCount: gst.length,
    maxKp: kps.length ? Math.max(...kps) : null,
    sepCount: sep.length,
  };
}

/**
 * @param {{ apiKey?: string, days?: number, fallback?: any, fetchImpl?: typeof fetch, now?: () => Date, timeoutMs?: number, refreshMs?: number }} opts
 */
export function createSpaceWeatherFeed({
  apiKey = 'DEMO_KEY',
  days = 7,
  fallback = null,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  now = () => new Date(),
  timeoutMs = 10_000,
  refreshMs = 30 * 60 * 1000,
} = {}) {
  /** @type {{ status: 'loading' | 'live' | 'snapshot' | 'unavailable', summary: ReturnType<typeof summarizeDonki> | null, range: { start: string, end: string } | null, fetchedAt: Date | null, retrievedAt: string | null, error: string | null }} */
  const state = {
    status: fallback ? 'snapshot' : 'loading',
    summary: fallback?.summary ?? null,
    range: fallback?.range ?? null,
    fetchedAt: null,
    retrievedAt: fallback?.source?.retrievedAt ?? null,
    error: null,
  };
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;

  async function getJson(/** @type {string} */ type, /** @type {{ start: string, end: string }} */ range) {
    const url = `${DONKI_BASE}${type}?startDate=${range.start}&endDate=${range.end}&api_key=${encodeURIComponent(apiKey)}`;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`${type}: HTTP ${res.status}`);
      const body = await res.json();
      return Array.isArray(body) ? body : [];
    } finally {
      clearTimeout(to);
    }
  }

  /** One live attempt. On failure keeps (or shows) the snapshot and records the error. */
  async function refresh() {
    if (!fetchImpl) {
      state.error = 'fetch unavailable';
      if (!fallback) state.status = 'unavailable';
      return state;
    }
    const range = dateRange(days, now());
    try {
      const [cme, gst, sep] = await Promise.all([getJson('CME', range), getJson('GST', range), getJson('SEP', range)]);
      state.summary = summarizeDonki({ cme, gst, sep });
      state.range = range;
      state.status = 'live';
      state.fetchedAt = now();
      state.error = null;
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
      if (state.status !== 'live') state.status = fallback ? 'snapshot' : 'unavailable';
      if (state.status === 'snapshot') {
        state.summary = fallback.summary;
        state.range = fallback.range;
      }
    }
    return state;
  }

  return {
    state,
    refresh,
    /** Starts the first request and the periodic refresh (browser only). */
    start() {
      refresh();
      timer ??= setInterval(refresh, refreshMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
