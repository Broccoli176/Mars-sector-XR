// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Pure rules for the electronics bench (no three.js): multimeter readings, part orientation and the
// oscilloscope trace. Tested in tests/electronicsRules.test.js.

export const METER_MODES = /** @type {const} */ (['diode', 'cap', 'volt']);

/**
 * What the multimeter shows for a probe target.
 * @param {'diode' | 'cap' | 'volt'} mode
 * @param {{ type: 'slot', slot: any } | { type: 'tp', id: 'TP1' | 'TP2' | 'TP3' } | null} target
 * @param {{ parts: Record<string, any>, circuit: any, output: import('../../systems/Electronics.js').PsuOutput }} ctx
 * @returns {string} display text ('—' when nothing measurable)
 */
export function meterReading(mode, target, { parts, circuit, output }) {
  if (!target) return '—';
  if (target.type === 'tp') {
    if (mode !== 'volt') return '—';
    if (target.id === 'TP1') return `${(circuit.acPeakV / Math.SQRT2).toFixed(1)} V~`;
    if (output.mode === 'off') return '0.00 V';
    if (target.id === 'TP2') return `${(output.vdcPeak - output.rippleVpp / 2).toFixed(2)} V`;
    return `${output.vout.toFixed(2)} V`;
  }
  const s = target.slot;
  if (!s.partId) return '—';
  const def = parts[s.partId];
  if (mode === 'diode') {
    if (def.kind !== 'diode') return '—';
    if (s.health === 'short') return '0.00 V';
    if (s.health === 'open' || s.reversed) return 'OL'; // reversed: the meter pushes current the blocked way
    return '0.62 V';
  }
  if (mode === 'cap') {
    if (def.kind !== 'cap') return '—';
    if (s.health === 'short' || s.health === 'open') return '0 µF';
    const uF = s.health === 'dried' ? circuit.driedUF : def.uF * 0.98;
    return `${Math.round(uF)} µF`;
  }
  return '—';
}

/**
 * A part is reversed if its axis points against the slot's axis (dot product of world directions < 0).
 * @param {{ x: number, y: number, z: number }} partAxis @param {{ x: number, y: number, z: number }} slotAxis
 */
export function isReversed(partAxis, slotAxis) {
  return partAxis.x * slotAxis.x + partAxis.y * slotAxis.y + partAxis.z * slotAxis.z < 0;
}

/**
 * Oscilloscope trace over two mains periods: transformer input and the filtered DC (before the regulator).
 * The capacitor discharges linearly between charging peaks, so the ripple drawn equals output.rippleVpp.
 * One mains period of warm-up runs first so the trace starts in steady state; `startPhase` (radians)
 * scrolls the window without a seam.
 * @param {import('../../systems/Electronics.js').PsuOutput} output @param {any} circuit @param {number} [n] @param {number} [startPhase]
 */
export function scopeTrace(output, circuit, n = 160, startPhase = 0) {
  const input = [];
  const out = [];
  const step = (4 * Math.PI) / n;
  // Charging peaks come every π (full wave) or 2π (half wave).
  const slope = output.mode === 'full' ? output.rippleVpp / Math.PI : output.rippleVpp / (2 * Math.PI);
  let v = output.mode === 'off' ? 0 : output.vdcPeak;
  const warmup = Math.round(n / 2);
  for (let i = -warmup; i <= n; i++) {
    const th = startPhase + i * step;
    const sin = Math.sin(th);
    if (i >= 0) input.push(circuit.acPeakV * sin);
    let rect = 0;
    if (output.mode === 'full') rect = output.vdcPeak * Math.abs(sin);
    else if (output.mode === 'half') rect = output.vdcPeak * Math.max(0, sin);
    v = output.mode === 'off' ? 0 : Math.max(rect, v - slope * step);
    if (i < 0) continue;
    out.push(v);
  }
  return { input, output: out };
}
