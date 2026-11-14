// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
import { describe, it, expect } from 'vitest';
import { summarizeDonki, dateRange, createSpaceWeatherFeed } from '../src/rooms/personal/spaceWeatherLive.js';
import { gameData } from '../src/data/index.js';

const cme = [
  { activityID: 'a', cmeAnalyses: [{ speed: 450 }, { speed: 974 }] },
  { activityID: 'b', cmeAnalyses: null },
];
const gst = [{ allKpIndex: [{ kpIndex: 5 }, { kpIndex: 6.33 }] }];

/** Fake fetch answering each DONKI endpoint, or failing. @param {Record<string, any> | null} bodies */
const fakeFetch = (bodies) => async (/** @type {string} */ url) => {
  if (!bodies) throw new Error('offline');
  const type = url.split('/DONKI/')[1].split('?')[0];
  return { ok: true, json: async () => bodies[type] ?? [] };
};

describe('DONKI live space weather (Personal)', () => {
  it('summarizes CMEs, top speed, storms and particle events', () => {
    expect(summarizeDonki({ cme, gst, sep: [] })).toEqual({ cmeCount: 2, fastestCmeKms: 974, gstCount: 1, maxKp: 6.33, sepCount: 0 });
    expect(summarizeDonki({})).toEqual({ cmeCount: 0, fastestCmeKms: null, gstCount: 0, maxKp: null, sepCount: 0 });
  });

  it('builds a last-7-days range', () => {
    expect(dateRange(7, new Date('2026-11-14T12:00:00Z'))).toEqual({ start: '2026-11-07', end: '2026-11-14' });
  });

  it('is "live" only after a successful call', async () => {
    const feed = createSpaceWeatherFeed({ fallback: gameData.real.donki_recent, fetchImpl: /** @type {any} */ (fakeFetch({ CME: cme, GST: gst })) });
    expect(feed.state.status).toBe('snapshot'); // before the first call
    await feed.refresh();
    expect(feed.state.status).toBe('live');
    expect(feed.state.summary?.cmeCount).toBe(2);
    expect(feed.state.fetchedAt).toBeInstanceOf(Date);
  });

  it('falls back to the dated snapshot when offline, and never claims to be live', async () => {
    const feed = createSpaceWeatherFeed({ fallback: gameData.real.donki_recent, fetchImpl: /** @type {any} */ (fakeFetch(null)) });
    await feed.refresh();
    expect(feed.state.status).toBe('snapshot');
    expect(feed.state.summary).toEqual(gameData.real.donki_recent.summary);
    expect(feed.state.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(feed.state.error).toBe('offline');
  });

  it('without snapshot and offline it reports unavailable', async () => {
    const feed = createSpaceWeatherFeed({ fetchImpl: /** @type {any} */ (fakeFetch(null)) });
    await feed.refresh();
    expect(feed.state.status).toBe('unavailable');
  });
});

describe('OSDR astronaut-health snapshot', () => {
  it('every study has accession, link and a kid-friendly summary string', () => {
    const osdr = gameData.real.osdr_health;
    expect(osdr.studies.length).toBeGreaterThanOrEqual(3);
    for (const s of osdr.studies) {
      expect(s.accession).toMatch(/^OSD-\d+$/);
      expect(s.url).toBe(`https://osdr.nasa.gov/bio/repo/data/studies/${s.accession}`);
      expect(gameData.strings[s.summaryKey], s.summaryKey).toBeDefined();
      expect(gameData.strings[`personal.health.where.${s.topic}`], s.topic).toBeDefined();
    }
  });
});
