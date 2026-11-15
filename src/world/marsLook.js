// SHARED (see docs/COLLABORATION.md): one Mars palette and one sky/light look for every exterior view
// (Telecom window, Energía solar field, Control rover world and NavCam), so the ground and the atmosphere
// look the same through every window. Reference: the Energía solar field.
import * as THREE from 'three';

/**
 * Linear RGB 0..1 colours shared by all exterior views.
 * These are linear, not sRGB: they go straight into vertex colours, which Three.js encodes for display,
 * so a sRGB hex must be converted first (e.g. #c87942 ⇒ [0.58, 0.19, 0.055]).
 */
export const MARS = {
  /** Regolith (intense rusty orange soil, ≈ #e77326 on screen), before shading. */
  ground: /** @type {[number, number, number]} */ ([0.8, 0.16, 0.02]),
  /** Rocks and boulders (same hue as the soil, darker; ≈ #9e5e38). */
  rock: /** @type {[number, number, number]} */ ([0.34, 0.11, 0.04]),
  /** Loose bright sand patches (≈ #eda65a). */
  sand: /** @type {[number, number, number]} */ ([0.85, 0.38, 0.1]),
  /** Wind-blown dust particles. */
  dust: 0xe0884a,
};

/**
 * Sky and light for a time of day and weather (pure; tested through SolarField.fieldLook).
 * The sky always keeps a soft orange tint (dust in the air scatters red light): pale orange by day, a deeper
 * warm orange near sunrise/sunset, a dusty orange in storms and a very dark orange-brown at night.
 * (Real Martian sunsets have a blue glow around the Sun; the game keeps the whole sky orange on purpose.)
 * @param {number} hour 0–24 @param {boolean} storm @param {{ solarStartHour: number, solarEndHour: number }} cfg
 * @returns {{ daylight: boolean, sky: [number, number, number], ground: number, panel: number, dust: number }}
 */
export function marsLook(hour, storm, cfg) {
  const daylight = hour >= cfg.solarStartHour && hour < cfg.solarEndHour;
  if (storm) return { daylight, sky: daylight ? [0.62, 0.3, 0.13] : [0.1, 0.045, 0.02], ground: daylight ? 0.6 : 0.2, panel: daylight ? 0.5 : 0.15, dust: 1 };
  if (!daylight) return { daylight, sky: [0.07, 0.03, 0.012], ground: 0.16, panel: 0.12, dust: 0 };
  const t = (hour - cfg.solarStartHour) / (cfg.solarEndHour - cfg.solarStartHour);
  const edge = Math.max(0, 1 - Math.min(t, 1 - t) / 0.12); // 1 at sunrise/sunset, 0 by mid-morning
  const sky = /** @type {[number, number, number]} */ ([0.9 - 0.12 * edge, 0.47 - 0.17 * edge, 0.22 - 0.1 * edge]);
  return { daylight, sky, ground: 1, panel: 1, dust: 0 };
}

/** Sky gradient factor at height fraction k (0 = horizon, 1 = zenith): bright haze low, deeper colour high. @param {number} k */
export function skyFactor(k) {
  const c = Math.min(1, Math.max(0, k));
  return /** @type {[number, number, number]} */ ([1 - 0.45 * c, 1 - 0.5 * c, 1 - 0.4 * c]);
}

/**
 * Writes the sky gradient as vertex colours (multiply with the material colour = marsLook().sky).
 * @param {THREE.BufferGeometry} geo @param {number} yHorizon @param {number} yZenith
 */
export function paintSky(geo, yHorizon, yZenith) {
  const p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) c.set(skyFactor((p.getY(i) - yHorizon) / (yZenith - yHorizon)), i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

/**
 * Bakes diffuse shading from a fixed sun direction into vertex colours (no runtime lights).
 * @param {THREE.BufferGeometry} geo @param {[number, number, number]} rgb @param {THREE.Vector3} sunDir normalised
 * @param {number} [ambient] @param {(x: number, z: number) => number} [variation] extra multiplier per vertex
 */
export function bakeShade(geo, rgb, sunDir, ambient = 0.45, variation) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.normal;
  const p = geo.attributes.position;
  const colors = new Float32Array(n.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i);
    let k = ambient + (1 - ambient) * Math.max(0, v.dot(sunDir));
    if (variation) k *= variation(p.getX(i), p.getZ(i));
    colors.set([rgb[0] * k, rgb[1] * k, rgb[2] * k], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Gentle large-scale light/dark patches on the ground (same feel in every view). @param {number} x @param {number} z */
export function groundVariation(x, z) {
  return 0.92 + 0.08 * Math.sin(x * 0.18 + 0.6) + 0.05 * Math.sin(x * 1.3 + z * 0.9);
}

/**
 * CSS colour from a linear RGB triple (canvas panels such as the rover map and NavCam). Converted to sRGB so a
 * canvas shows the same colour as the 3D views. @param {[number, number, number]} rgb @param {number} [scale]
 */
export function cssColor(rgb, scale = 1) {
  const srgb = (/** @type {number} */ v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  const ch = (/** @type {number} */ v) => Math.round(srgb(Math.min(1, Math.max(0, v * scale))) * 255);
  return `rgb(${ch(rgb[0])}, ${ch(rgb[1])}, ${ch(rgb[2])})`;
}
