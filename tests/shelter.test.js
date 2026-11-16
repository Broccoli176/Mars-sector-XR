// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
import { describe, it, expect } from 'vitest';
import { gameData } from '../src/data/index.js';
import { insideCapsule } from '../src/rooms/personal/shelterRules.js';
import { newSim, runTicks } from './helpers/sim.js';

const cfg = gameData.balance.shelter;

describe('Storm shelter: the sleep capsule (Personal)', () => {
  it('only the capsule counts, not the whole room', () => {
    expect(insideCapsule(0, cfg.depthM / 2, cfg)).toBe(true); // standing inside, in front of the bed
    expect(insideCapsule(cfg.widthM / 2 - 0.4, 0.4, cfg)).toBe(true); // lying on the bed
    expect(insideCapsule(0, cfg.depthM + 0.5, cfg)).toBe(false); // in the room, in front of the opening
    expect(insideCapsule(cfg.widthM / 2 + 0.2, 0.5, cfg)).toBe(false); // beside the capsule
  });

  it('the bed fits between the walls and leaves room to stand inside with your head under the roof', () => {
    expect(cfg.bed.lengthM).toBeLessThan(cfg.widthM - 2 * cfg.wallM);
    expect(cfg.depthM - cfg.bed.widthM).toBeGreaterThan(2 * 0.22); // the player's body circle (src/vr/Collision.js)
    expect(cfg.heightM - cfg.wallM).toBeGreaterThan(gameData.layout.eyeHeight + 0.25); // tall players too
    expect(cfg.heightM + 0.35).toBeLessThan(gameData.layout.ceilingHeight); // the sign on top fits under the ceiling
  });

  it('the water wall meets the ~10 g/cm² NASA asks for a surface storm shelter (1 cm of water ≈ 1 g/cm²)', () => {
    expect(cfg.wallM * 100).toBeGreaterThanOrEqual(10);
  });

  it('inside the capsule the solar storm does no damage; outside it hurts', () => {
    const sim = newSim({ events: [{ id: 'sep', day: 1, time: '07:00', type: 'sep', warnLeadHours: 1, durationHours: 48 }] });
    sim.bus.emit('game:start');
    runTicks(sim, 120);
    expect(sim.radiation.shelterNeeded).toBe(true);
    sim.bus.emit('crew:shelter', { inside: false });
    runTicks(sim, 1);
    expect(sim.crew.activeCauses.radiation).toBeGreaterThan(0);
    sim.bus.emit('crew:shelter', { inside: true });
    runTicks(sim, 1);
    expect(sim.crew.activeCauses.radiation).toBeUndefined();
  });
});
