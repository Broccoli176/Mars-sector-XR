// @ts-check
/**
 * Earth–Mars geometry from JPL mean orbital elements (src/data/real/orbits.json, "Approximate Positions
 * of the Planets", Standish). Pure math, no rendering. Accuracy is far better than 1 % in distance for
 * 1800–2050, which is plenty for a light-time delay (checked against JPL Horizons in tests/orbits.test.js).
 */

const DEG = Math.PI / 180;

/** Julian centuries since J2000 for a UTC time in ms. @param {number} ms */
export function centuriesSinceJ2000(ms) {
  const jd = ms / 86400000 + 2440587.5;
  return (jd - 2451545.0) / 36525;
}

/**
 * Heliocentric ecliptic position (au) of a body at T centuries.
 * @param {{ elements: number[], rates: number[] }} body
 * @param {number} T
 * @returns {[number, number, number]}
 */
export function heliocentric(body, T) {
  const [a, e, I, L, varpi, Omega] = body.elements.map((v, i) => v + body.rates[i] * T);
  const omega = (varpi - Omega) * DEG;
  let M = (L - varpi) % 360;
  if (M > 180) M -= 360;
  if (M < -180) M += 360;
  const Mr = M * DEG;
  // Kepler's equation by Newton iteration.
  let E = Mr + e * Math.sin(Mr);
  for (let i = 0; i < 10; i++) {
    const dE = (E - e * Math.sin(E) - Mr) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const co = Math.cos(omega);
  const so = Math.sin(omega);
  const cO = Math.cos(Omega * DEG);
  const sO = Math.sin(Omega * DEG);
  const cI = Math.cos(I * DEG);
  const sI = Math.sin(I * DEG);
  return [
    (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
    (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
    so * sI * xp + co * sI * yp,
  ];
}

/**
 * Earth–Mars distance, one-way light time and solar elongation of Mars seen from Earth
 * (Sun–Earth–Mars angle; near 0° = solar conjunction, when NASA pauses commanding).
 * @param {number} ms UTC time
 * @param {any} orbits contents of src/data/real/orbits.json
 */
export function earthMars(ms, orbits) {
  const T = centuriesSinceJ2000(ms);
  const earth = heliocentric(orbits.earth, T);
  const mars = heliocentric(orbits.mars, T);
  const d = [mars[0] - earth[0], mars[1] - earth[1], mars[2] - earth[2]];
  const distanceAu = Math.hypot(...d);
  const toSun = [-earth[0], -earth[1], -earth[2]];
  const cos = (d[0] * toSun[0] + d[1] * toSun[1] + d[2] * toSun[2]) / (distanceAu * Math.hypot(...toSun));
  const elongationDeg = Math.acos(Math.max(-1, Math.min(1, cos))) / DEG;
  const lightMin = (distanceAu * orbits.constants.auKm) / orbits.constants.cKmPerS / 60;
  return { distanceAu, lightMin, elongationDeg };
}
