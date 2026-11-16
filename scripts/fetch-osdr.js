// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
//
// Downloads metadata of a few real NASA OSDR studies about astronaut health and writes an
// embedded snapshot: src/data/real/osdr_health.json
//
// Why a script: the OSDR search API only allows CORS from osdr.nasa.gov, so the browser on the
// Quest cannot call it. Kid-friendly summaries live in src/data/strings/es/personal.json
// (personal.health.<id>) and must not claim more than each study's description says.
//
// Usage: npm run data:osdr
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SEARCH = 'https://osdr.nasa.gov/osdr/data/search';
// Chosen for the challenge themes (muscle/bone loss, whole-body changes in astronauts, radiation risk).
const STUDIES = [
  { id: 'OSD-924', topic: 'muscle_bone' },
  { id: 'OSD-343', topic: 'astronauts' },
  { id: 'OSD-812', topic: 'radiation_immunity' },
];

/** @param {string} accession */
async function fetchStudy(accession) {
  const url = `${SEARCH}?term=${encodeURIComponent(accession)}&from=0&size=5&type=cgene`;
  const res = await fetch(url, { headers: { 'User-Agent': 'marsianics-data-script' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const json = await res.json();
  const hit = json.hits.hits.map((/** @type {any} */ h) => h._source).find((/** @type {any} */ s) => s.Accession === accession);
  if (!hit) throw new Error(`${accession} not found in OSDR search results`);
  const mission = typeof hit.Mission === 'object' ? hit.Mission?.Name : hit.Mission;
  return {
    accession,
    title: hit['Study Title'],
    flightProgram: hit['Flight Program'] || null,
    mission: mission || null,
    organism: hit.organism || null,
    descriptionExcerpt: String(hit['Study Description'] ?? '').replace(/\s+/g, ' ').slice(0, 400),
    url: `https://osdr.nasa.gov/bio/repo/data/studies/${accession}`,
    query: url,
  };
}

const studies = [];
for (const s of STUDIES) studies.push({ ...(await fetchStudy(s.id)), topic: s.topic, summaryKey: `personal.health.${s.id.replace('-', '').toLowerCase()}` });

const out = {
  _about: 'Embedded REAL study metadata (not live). Regenerate with `npm run data:osdr`. Kid-friendly summaries: strings/es/personal.json.',
  source: {
    institution: 'NASA Open Science Data Repository (OSDR)',
    product: 'OSDR study search (space biology & astronaut health)',
    url: 'https://osdr.nasa.gov/bio/repo/',
    apiDocs: 'https://visualization.osdr.nasa.gov/biodata/api/',
    terms: 'https://www.nasa.gov/reference/osdr-help-terms-and-conditions/',
    retrievedAt: new Date().toISOString().slice(0, 10),
  },
  studies,
};

const dir = new URL('../src/data/real/', import.meta.url);
mkdirSync(fileURLToPath(dir), { recursive: true });
const target = fileURLToPath(new URL('osdr_health.json', dir));
writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${target}`);
for (const s of studies) console.log(`- ${s.accession} (${s.organism ?? '?'}, ${s.flightProgram ?? 'ground'}): ${s.title}`);
