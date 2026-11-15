// Downloads the REAL NASA photos used by the rover console NavCam (Sala de control) and writes
// src/data/real/rover_photos.json. Snapshots, versioned with the repo, so the game works offline on the Quest.
//   - Curated photojournal images whose caption names each site (resized by NASA's image server, ≤ ~150 KB).
//   - The latest Perseverance NAVCAM_LEFT frame (Mars 2020 raw-images API) for the standby screen.
// Usage: npm run data:roverphotos
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RESIZE = 'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/';
/** Sites of src/data/balance/rover.json → official image whose caption names the place (verified 2026-11-14). */
const CURATED = [
  {
    siteIds: ['backshell', 'parachute'],
    pia: 'PIA25218',
    file: 'pia25218_backshell_parachute.jpg',
    url: `${RESIZE}pia25/pia25218/PIA25218.jpg?w=1200&fit=clip`,
    pageUrl: 'https://science.nasa.gov/photojournal/debris-field-for-perseverance-landing-gear-seen-from-mars-helicopter',
    credit: 'NASA/JPL-Caltech',
    date: '2022-04-19',
    camera: 'Ingenuity (color camera, flight 26)',
    // Backshell left of centre, parachute far right (fractions of width/height).
    crops: { backshell: [0.1, 0, 0.41, 1], parachute: [0.59, 0, 0.41, 1] },
    captionKeys: { backshell: 'rover.photo.backshell', parachute: 'rover.photo.parachute' },
  },
  {
    siteIds: ['seitah'],
    pia: 'PIA24690',
    file: 'pia24690_seitah_flight11.jpg',
    url: `${RESIZE}pia24/pia24690/PIA24690.jpg?w=1200&fit=clip`,
    pageUrl: 'https://science.nasa.gov/photojournal/ingenuitys-11th-flight',
    credit: 'NASA/JPL-Caltech/University of Arizona',
    date: '2021-08-04',
    camera: 'HiRISE (Mars Reconnaissance Orbiter) — mapa del vuelo 11 de Ingenuity',
    captionKeys: { seitah: 'rover.photo.seitah' },
  },
  {
    siteIds: ['delta'],
    pia: 'PIA24921',
    file: 'pia24921_delta.jpg',
    url: `${RESIZE}pia24/pia24921/PIA24921.jpg?w=1600&fit=clip`,
    pageUrl: 'https://science.nasa.gov/photojournal/detailed-panorama-of-mars-jezero-crater-delta',
    credit: 'NASA/JPL-Caltech/ASU/MSSS',
    date: '2022-06',
    camera: 'Mastcam-Z (Perseverance) — panorama',
    // Wide panorama: the butte in the centre, above the black mosaic edges.
    crops: { delta: [0.42, 0, 0.28, 0.62] },
    captionKeys: { delta: 'rover.photo.delta' },
  },
];
const RAW_API = 'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=1&page=0&order=sol+desc&search=NAVCAM_LEFT';

const outDir = fileURLToPath(new URL('../public/images/rover/', import.meta.url));
mkdirSync(outDir, { recursive: true });

/** @param {string} url @param {string} file */
async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outDir + file, buf);
  console.log(`  ${file}  ${(buf.length / 1024).toFixed(0)} KB`);
  return buf.length;
}

const photos = [];
for (const c of CURATED) {
  await download(c.url, c.file);
  for (const siteId of c.siteIds) {
    photos.push({
      siteId,
      file: c.file,
      pia: c.pia,
      url: c.url,
      pageUrl: c.pageUrl,
      credit: c.credit,
      date: c.date,
      camera: c.camera,
      crop: c.crops?.[siteId] ?? null,
      captionKey: c.captionKeys[siteId],
    });
  }
}

// Latest real NavCam frame (standby screen while the rover is docked).
const api = await (await fetch(RAW_API)).json();
const img = api.images[0];
await download(img.image_files.medium, 'latest_navcam.jpg');
const latest = {
  file: 'latest_navcam.jpg',
  imageId: img.imageid,
  sol: img.sol,
  dateTakenUtc: img.date_taken_utc,
  camera: img.camera.instrument,
  credit: img.credit,
  url: img.image_files.medium,
  pageUrl: img.link,
};

const data = {
  _about: 'REAL NASA images (static snapshots, not live). Each curated photo has a caption naming the place. Regenerate with `npm run data:roverphotos`.',
  source: {
    institution: 'NASA / JPL-Caltech',
    product: 'Photojournal (Mars 2020, Ingenuity, HiRISE) + Mars 2020 raw-images API',
    url: 'https://science.nasa.gov/mission/mars-2020-perseverance/',
    terms: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
    rawApi: 'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json',
    retrievedAt: new Date().toISOString().slice(0, 10),
  },
  photos,
  latest,
};
const target = fileURLToPath(new URL('../src/data/real/rover_photos.json', import.meta.url));
writeFileSync(target, JSON.stringify(data, null, 2) + '\n');
console.log(`Wrote ${target} (${photos.length} site photos + latest NavCam sol ${latest.sol})`);
