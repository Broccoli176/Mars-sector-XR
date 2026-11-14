// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Procedural low-poly plants, one merged mesh per crop (vertex colours → 1 draw call per tray).
// Origin at the soil surface, height ≈ 0.25–0.55 m at full growth.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** @param {THREE.BufferGeometry} geo @param {THREE.ColorRepresentation} color */
function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  g.deleteAttribute('uv');
  return g;
}

/** Deterministic pseudo-random in [0,1). @param {number} i */
const rnd = (i) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** Small plants spread over the tray (2 × 3 grid), each built by `one(x, z, i)`. */
function grid(/** @type {(x: number, z: number, i: number) => [THREE.BufferGeometry, string][]} */ one) {
  /** @type {THREE.BufferGeometry[]} */
  const parts = [];
  let i = 0;
  for (const z of [-0.1, 0.1]) {
    for (const x of [-0.2, 0, 0.2]) {
      for (const [g, c] of one(x + (rnd(i) - 0.5) * 0.04, z + (rnd(i + 7) - 0.5) * 0.04, i)) parts.push(paint(g, c));
      i++;
    }
  }
  return mergeGeometries(parts);
}

const stem = (/** @type {number} */ h, /** @type {number} */ r = 0.008) => new THREE.CylinderGeometry(r * 0.7, r, h, 5).translate(0, h / 2, 0);
const ball = (/** @type {number} */ r, /** @type {number} */ detail = 0) => new THREE.IcosahedronGeometry(r, detail);

/** @type {Record<string, () => THREE.BufferGeometry>} */
const BUILDERS = {
  // Rosettes of flattened leaves.
  lettuce: () =>
    grid((x, z, i) => [
      [ball(0.075, 1).scale(1, 0.55, 1).translate(x, 0.04, z), i % 2 ? '#7fcf4f' : '#5fb23f'],
      [ball(0.045, 0).scale(1, 0.8, 1).translate(x, 0.075, z), '#a6e070'],
    ]),
  // Tall vines with red fruit.
  tomato: () =>
    grid((x, z, i) => [
      [stem(0.42, 0.01).translate(x, 0, z), '#4f7f2f'],
      [ball(0.07, 0).scale(1, 1.3, 1).translate(x, 0.3, z), '#3f8f3f'],
      [ball(0.06, 0).translate(x + 0.03, 0.42, z), '#4f9f3f'],
      [ball(0.028, 1).translate(x + 0.05, 0.22, z + 0.02), '#e2412f'],
      [ball(0.024, 1).translate(x - 0.04, 0.32, z - 0.02), i % 2 ? '#e2412f' : '#f08a2f'],
    ]),
  // Bushy, with pale green pods.
  soybean: () =>
    grid((x, z) => [
      [stem(0.2).translate(x, 0, z), '#5f8f3f'],
      [ball(0.085, 0).scale(1.1, 0.8, 1.1).translate(x, 0.2, z), '#4f9a3a'],
      [new THREE.CapsuleGeometry(0.01, 0.05, 2, 5).rotateZ(0.6).translate(x + 0.05, 0.14, z + 0.03), '#b7d77a'],
      [new THREE.CapsuleGeometry(0.01, 0.05, 2, 5).rotateZ(-0.5).translate(x - 0.05, 0.16, z - 0.02), '#b7d77a'],
    ]),
  // Feathery tops and an orange shoulder at soil level.
  carrot: () =>
    grid((x, z, i) => [
      [new THREE.ConeGeometry(0.025, 0.06, 6).rotateX(Math.PI).translate(x, 0.01, z), '#f07f1f'],
      [new THREE.ConeGeometry(0.05, 0.22, 5).translate(x, 0.14, z), i % 2 ? '#6fbf4f' : '#5aa83f'],
      [new THREE.ConeGeometry(0.035, 0.18, 5).rotateZ(0.35).translate(x + 0.03, 0.12, z), '#7fcf5f'],
    ]),
  // Low spreading purple-green vine.
  sweet_potato: () =>
    grid((x, z, i) => [
      [ball(0.08, 0).scale(1.4, 0.45, 1.2).translate(x, 0.05, z), i % 2 ? '#4f7f3a' : '#5f8a3f'],
      [ball(0.04, 0).scale(1, 0.5, 1).translate(x + 0.06, 0.09, z + 0.03), '#7a3f6f'],
      [ball(0.035, 0).scale(1, 0.5, 1).translate(x - 0.05, 0.08, z - 0.03), '#8a4f7f'],
    ]),
  // Upright stalks with a golden-red seed head (panicle).
  quinoa: () =>
    grid((x, z, i) => [
      [stem(0.4, 0.008).translate(x, 0, z), '#6f8f3f'],
      [ball(0.05, 0).scale(1, 0.6, 1).translate(x, 0.18, z), '#5f9a3f'],
      [new THREE.ConeGeometry(0.04, 0.16, 6).rotateX(Math.PI).translate(x, 0.47, z), i % 3 ? '#d9a33f' : '#c4523a'],
    ]),
};

/** @type {Map<string, THREE.BufferGeometry>} */
const cache = new Map();

/** Shared geometry for a crop (built once). @param {string} cropId */
export function cropGeometry(cropId) {
  let g = cache.get(cropId);
  if (!g) {
    g = (BUILDERS[cropId] ?? BUILDERS.lettuce)();
    cache.set(cropId, g);
  }
  return g;
}

export const PLANT_CROPS = Object.keys(BUILDERS);
