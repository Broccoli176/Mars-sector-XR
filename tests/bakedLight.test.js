import { describe, it, expect } from 'vitest';
import { distanceAttenuation, lightFactors, shade } from '../src/world/bakedLight.js';

const lamp = { x: 0, y: 2.25, z: 0, distance: 12, decay: 1.4 };
const UP = [0, 1, 0];
/** @type {[number, number, number]} */
const SUN = [0.6, 0.8, 0];

describe('baked shell lighting (same maths as the Three.js Lambert shader)', () => {
  it('distance attenuation: inverse power, clamped near the lamp and faded to zero at the cut-off', () => {
    expect(distanceAttenuation(1, 0, 2)).toBeCloseTo(1, 6);
    expect(distanceAttenuation(2, 0, 2)).toBeCloseTo(0.25, 6);
    expect(distanceAttenuation(0.001, 0, 2)).toBeCloseTo(100, 6); // 1 / max(d^decay, 0.01)
    expect(distanceAttenuation(12, 12, 1.4)).toBe(0);
    // Three.js window: (1 − (d / cutoff)⁴)², on top of the inverse power.
    expect(distanceAttenuation(6, 12, 1.4)).toBeCloseTo((1 / 6 ** 1.4) * (1 - 0.5 ** 4) ** 2, 6);
  });

  it('a floor point under a lamp is lit by it; the underside of the same point is not', () => {
    const f = lightFactors([0, 0, 0, 0, 0, 0], [...UP, 0, -1, 0], [lamp], SUN);
    expect(f.point[0]).toBeCloseTo(distanceAttenuation(2.25, 12, 1.4), 6);
    expect(f.point[1]).toBe(0);
    expect(f.hemi[0]).toBe(1); // faces the sky colour
    expect(f.hemi[1]).toBe(0); // faces the ground colour
    expect(f.sun[0]).toBeCloseTo(0.8, 6);
    expect(f.sun[1]).toBe(0);
  });

  it('light falls off with distance and with the angle to the surface', () => {
    const f = lightFactors([0, 0, 0, 3, 0, 0, 20, 0, 0], [...UP, ...UP, ...UP], [lamp], SUN);
    expect(f.point[1]).toBeLessThan(f.point[0]);
    expect(f.point[1]).toBeCloseTo((2.25 / Math.hypot(3, 2.25)) * distanceAttenuation(Math.hypot(3, 2.25), 12, 1.4), 6);
    expect(f.point[2]).toBe(0); // beyond the lamp's reach
  });

  it('several lamps add up', () => {
    const one = lightFactors([0, 0, 0], UP, [lamp], SUN).point[0];
    const two = lightFactors([0, 0, 0], UP, [lamp, { ...lamp }], SUN).point[0];
    expect(two).toBeCloseTo(2 * one, 6);
  });

  it('shade = tint × (hemisphere + lamps + sun + ambient) / π + glow', () => {
    const factors = lightFactors([0, 0, 0], UP, [lamp], SUN);
    const env = { sky: [1.2, 1.2, 1.2], ground: [0.2, 0.2, 0.2], point: [4, 3, 2], sun: [1, 1, 1], ambient: [0.1, 0.1, 0.1] };
    const out = shade(new Float32Array(3), [0.5, 1, 1], factors, { ...env, emissive: [0.01, 0, 0] });
    const p = factors.point[0];
    expect(out[0]).toBeCloseTo((0.5 * (1.2 + 4 * p + 0.8 + 0.1)) / Math.PI + 0.01, 5);
    expect(out[1]).toBeCloseTo((1.2 + 3 * p + 0.8 + 0.1) / Math.PI, 5);
    // No tint array = white surface.
    const white = shade(new Float32Array(3), null, factors, env);
    expect(white[2]).toBeCloseTo((1.2 + 2 * p + 0.8 + 0.1) / Math.PI, 5);
  });

  it('emergency lighting only needs new colours: dimmer and red with the same factors', () => {
    const factors = lightFactors([1, 0, 1], UP, [lamp], SUN);
    const dark = [0, 0, 0];
    const normal = shade(new Float32Array(3), null, factors, { sky: [1.2, 1.2, 1.2], ground: [0.3, 0.3, 0.3], point: [4, 3.6, 3], sun: dark, ambient: dark });
    const emergency = shade(new Float32Array(3), null, factors, { sky: [0.25, 0.25, 0.25], ground: [0.06, 0.06, 0.06], point: [1.6, 0.08, 0.05], sun: dark, ambient: dark });
    expect(emergency[0]).toBeLessThan(normal[0]);
    expect(emergency[0]).toBeGreaterThan(emergency[1] * 1.5); // red
  });
});
