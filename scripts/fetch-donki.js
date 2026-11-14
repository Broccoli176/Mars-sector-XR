// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
//
// Saves the last 7 days of NASA DONKI space weather (CME, GST, SEP) as the OFFLINE FALLBACK
// for the live panel in Personal: src/data/real/donki_recent.json
// (The game calls api.nasa.gov live when it can; this file is used only without network.)
//
// Usage: npm run data:donki            (uses NASA_API_KEY from the environment, else DEMO_KEY)
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSpaceWeatherFeed, DONKI_BASE } from '../src/rooms/personal/spaceWeatherLive.js';

const apiKey = process.env.NASA_API_KEY ?? 'DEMO_KEY';
const feed = createSpaceWeatherFeed({ apiKey, days: 7 });
const state = await feed.refresh();
if (state.status !== 'live') throw new Error(`DONKI request failed: ${state.error}`);

const out = {
  _about: 'Embedded REAL snapshot (offline fallback, not live). Regenerate with `npm run data:donki`.',
  source: {
    institution: 'NASA Community Coordinated Modeling Center (CCMC)',
    product: 'DONKI — Space Weather Database Of Notifications, Knowledge, Information (via api.nasa.gov)',
    url: 'https://api.nasa.gov/',
    endpoints: ['CME', 'GST', 'SEP'].map((t) => `${DONKI_BASE}${t}`),
    retrievedAt: new Date().toISOString().slice(0, 10),
  },
  range: state.range,
  summary: state.summary,
};

const dir = new URL('../src/data/real/', import.meta.url);
mkdirSync(fileURLToPath(dir), { recursive: true });
const target = fileURLToPath(new URL('donki_recent.json', dir));
writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${target}`);
console.log(`${state.range?.start} → ${state.range?.end}:`, JSON.stringify(state.summary));
