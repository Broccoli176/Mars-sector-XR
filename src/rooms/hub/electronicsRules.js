// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Pure rules for the electronics bench (no three.js): the guided 3-step repair (scan → remove → insert)
// and the oscilloscope trace. Tested in tests/electronicsRules.test.js.

/**
 * A slot needs work if its part is damaged, reversed or not the original part (decoys/policies), or if it is empty.
 * @param {{ partId: string | null, health: string, reversed: boolean }} slot @param {string} defaultPartId
 */
export function isBroken(slot, defaultPartId) {
  return !slot.partId || slot.health !== 'ok' || slot.reversed || slot.partId !== defaultPartId;
}

/**
 * Current step of the guided repair. Priority: pull out what is broken → fill the empty slot → solder a loose part.
 * @param {{ id: string, partId: string | null, health: string, reversed: boolean, soldered: boolean }[]} slots
 * @param {Record<string, string>} defaults original part per slot id
 * @param {boolean} scanned the player already pressed SCAN for the current fault
 * @returns {{ step: 'ok' | 'scan' | 'remove' | 'insert' | 'solder', slotId?: string, partId?: string }}
 */
export function benchStep(slots, defaults, scanned) {
  const bad = slots.find((s) => s.partId && isBroken(s, defaults[s.id]));
  const empty = slots.find((s) => !s.partId);
  const loose = slots.find((s) => s.partId && !s.soldered && !isBroken(s, defaults[s.id]));
  if (!bad && !empty && !loose) return { step: 'ok' };
  if (!scanned) return { step: 'scan' };
  if (bad) return { step: 'remove', slotId: bad.id };
  if (empty) return { step: 'insert', slotId: empty.id, partId: defaults[empty.id] };
  return { step: 'solder', slotId: /** @type {any} */ (loose).id };
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
