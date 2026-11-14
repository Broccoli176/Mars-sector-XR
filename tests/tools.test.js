// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
import { describe, it, expect } from 'vitest';
import { decideRelease, shouldReturnHome, createT1, updateT1, isT1Done } from '../src/rooms/hub/toolRules.js';
import { gameData } from '../src/data/index.js';

const home = { x: 2, y: 1.6, z: 2.4 };
const holsters = () => [
  { position: { x: 0, y: 0.9, z: 0 }, item: null },
  { position: { x: 0.44, y: 0.9, z: 0 }, item: null },
];
const ctx = (h = holsters()) => ({ holsters: h, home, holsterRadius: 0.25, wallRadius: 0.35 });

describe('Tool release rules (spec §9.3)', () => {
  it('snaps into the nearest free holster', () => {
    expect(decideRelease({ x: 0.4, y: 0.95, z: 0 }, ctx())).toEqual({ kind: 'holster', index: 1 });
  });

  it('skips an occupied holster', () => {
    const h = holsters();
    h[1].item = 'wrench';
    expect(decideRelease({ x: 0.4, y: 0.95, z: 0 }, ctx(h))).toEqual({ kind: 'drop' });
  });

  it('goes back to its hook when released near the wall', () => {
    expect(decideRelease({ x: 2.1, y: 1.5, z: 2.3 }, ctx())).toEqual({ kind: 'wall' });
  });

  it('drops anywhere else and returns home after the configured seconds', () => {
    expect(decideRelease({ x: 5, y: 1.2, z: 5 }, ctx())).toEqual({ kind: 'drop' });
    expect(shouldReturnHome(3, 12.9, 10)).toBe(false);
    expect(shouldReturnHome(3, 13, 10)).toBe(true);
    expect(shouldReturnHome(null, 99, 10)).toBe(false);
  });
});

describe('Training mission T1', () => {
  it('completes after grab → holster → drop → recover from the floor', () => {
    const s = createT1();
    updateT1(s, 'grab');
    updateT1(s, 'holster');
    updateT1(s, 'grab');
    expect(isT1Done(s)).toBe(false);
    updateT1(s, 'drop');
    updateT1(s, 'grab', { wasOnFloor: true });
    expect(isT1Done(s)).toBe(true);
  });

  it('grabbing from the wall does not count as recovering', () => {
    const s = createT1();
    updateT1(s, 'drop');
    updateT1(s, 'grab', { wasOnFloor: false });
    expect(s.recovered).toBe(false);
  });
});

describe('Tool and component data (spec §6.1)', () => {
  const { tools, components } = gameData.balance;

  it('has the 4 spec tools, each with a translated name', () => {
    expect(tools.map((t) => t.id).sort()).toEqual(['screwdriver', 'sealant_gun', 'solder_iron', 'wrench']);
    for (const t of tools) expect(gameData.strings[t.nameKey], t.nameKey).toBeDefined();
  });

  it('maps every component to the tool the spec requires', () => {
    const expected = {
      pump_thermal: 'wrench', scrubber_fan: 'screwdriver', electrolyzer_cell: 'solder_iron',
      antenna_motor: 'wrench', relay_main: 'screwdriver', valve_recycler: 'wrench', hull_seal: 'sealant_gun',
      rx_psu: 'solder_iron', // Telecom receiver power supply (hub electronics bench)
    };
    expect(Object.fromEntries(components.map((c) => [c.id, c.toolId]))).toEqual(expected);
    for (const c of components) expect(gameData.strings[c.nameKey], c.nameKey).toBeDefined();
  });
});
