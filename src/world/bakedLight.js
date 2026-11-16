// @ts-check
// SHARED (see docs/COLLABORATION.md): static lighting of the base shell (walls, floors, ceilings, trims) baked
// into vertex colours, so the surfaces that fill most of the screen need no per-pixel lights (AGENTS.md §7).
// Same maths as Three.js' MeshLambertMaterial (r187), evaluated once per vertex on the CPU instead of per pixel
// on the GPU. Pure (no Three.js, no DOM): tested in tests/bakedLight.test.js. Used by src/world/Basement.js.

/** Three.js `getDistanceAttenuation` (lights_pars_begin.glsl). @param {number} distance @param {number} cutoff @param {number} decay */
export function distanceAttenuation(distance, cutoff, decay) {
  let falloff = 1 / Math.max(distance ** decay, 0.01);
  if (cutoff > 0) {
    const k = Math.min(1, Math.max(0, 1 - (distance / cutoff) ** 4));
    falloff *= k * k;
  }
  return falloff;
}

/**
 * Per-vertex light factors. They depend only on geometry, not on the colour or intensity of the lights, so
 * switching to emergency lighting or changing the daylight only needs `shade` again.
 * - point: Σ attenuation × max(N·L, 0) over the point lights (they all share one colour)
 * - hemi: 0.5 N·up + 0.5 (hemisphere light weight: 0 = ground colour, 1 = sky colour)
 * - sun: max(N·sunDir, 0)
 * @param {ArrayLike<number>} position xyz per vertex (world space) @param {ArrayLike<number>} normal xyz per vertex
 * @param {{ x: number, y: number, z: number, distance: number, decay: number }[]} pointLights
 * @param {[number, number, number]} sunDir unit vector from the surface towards the sun
 */
export function lightFactors(position, normal, pointLights, sunDir) {
  const count = position.length / 3;
  const point = new Float32Array(count);
  const hemi = new Float32Array(count);
  const sun = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const px = position[i * 3];
    const py = position[i * 3 + 1];
    const pz = position[i * 3 + 2];
    const nx = normal[i * 3];
    const ny = normal[i * 3 + 1];
    const nz = normal[i * 3 + 2];
    let sum = 0;
    for (const l of pointLights) {
      const dx = l.x - px;
      const dy = l.y - py;
      const dz = l.z - pz;
      const d = Math.hypot(dx, dy, dz);
      if (d <= 0 || (l.distance > 0 && d >= l.distance)) continue;
      const dot = (nx * dx + ny * dy + nz * dz) / d;
      if (dot > 0) sum += dot * distanceAttenuation(d, l.distance, l.decay);
    }
    point[i] = sum;
    hemi[i] = 0.5 * ny + 0.5;
    sun[i] = Math.max(0, nx * sunDir[0] + ny * sunDir[1] + nz * sunDir[2]);
  }
  return { point, hemi, sun };
}

/**
 * @typedef {{
 *   sky: number[], ground: number[], point: number[], sun: number[], ambient: number[], emissive?: number[],
 * }} LightEnv linear RGB, every colour already multiplied by its light's intensity
 */

/**
 * Writes the baked colours: tint × (hemisphere + point + sun + ambient) / π + emissive.
 * @param {Float32Array} out rgb per vertex
 * @param {ArrayLike<number> | null} tint rgb per vertex (surface colour), or null for white
 * @param {{ point: Float32Array, hemi: Float32Array, sun: Float32Array }} factors
 * @param {LightEnv} env
 */
export function shade(out, tint, factors, env) {
  const { point, hemi, sun } = factors;
  const e = env.emissive ?? [0, 0, 0];
  const k = 1 / Math.PI;
  for (let i = 0; i < point.length; i++) {
    const h = hemi[i];
    const p = point[i];
    const s = sun[i];
    for (let c = 0; c < 3; c++) {
      const irradiance = env.ground[c] + (env.sky[c] - env.ground[c]) * h + p * env.point[c] + s * env.sun[c] + env.ambient[c];
      out[i * 3 + c] = (tint ? tint[i * 3 + c] : 1) * irradiance * k + e[c];
    }
  }
  return out;
}
