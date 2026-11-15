// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
import { describe, it, expect } from 'vitest';
import { gameData } from '../src/data/index.js';
import { insideAlcove } from '../src/rooms/personal/shelterRules.js';
import { newSim, runTicks } from './helpers/sim.js';

const cfg = gameData.balance.shelter;

describe('Storm shelter alcove (Personal)', () => {
  it('only the alcove under the water tanks counts, not the whole room', () => {
    expect(insideAlcove(0, cfg.depthM / 2, cfg)).toBe(true); // standing inside, in front of the bunk
    expect(insideAlcove(cfg.widthM / 2 - 0.4, 0.4, cfg)).toBe(true); // lying on the bunk
    expect(insideAlcove(0, cfg.depthM + 0.5, cfg)).toBe(false); // in the room, in front of the opening
    expect(insideAlcove(cfg.widthM / 2 + 0.2, 0.5, cfg)).toBe(false); // beside the alcove
  });

  it('the bed fits inside the alcove between the tank walls', () => {
    expect(cfg.bed.lengthM).toBeLessThan(cfg.widthM - 4 * 0.13);
    expect(cfg.bed.widthM + 0.26).toBeLessThan(cfg.depthM);
  });

  it('inside the alcove the solar storm does no damage; outside it hurts', () => {
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
