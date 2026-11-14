import { describe, it, expect } from 'vitest';
import { buildWalkable } from '../src/vr/Walkable.js';
import { gameData } from '../src/data/index.js';

const walkable = buildWalkable(gameData.layout);

describe('Walkable area (keyboard locomotion)', () => {
  it('allows the spawn point, room centres and the corridor', () => {
    expect(walkable.contains(15.5, 0)).toBe(true); // spawn, main room
    expect(walkable.contains(3, -2.9)).toBe(true); // telecom
    expect(walkable.contains(9, 2.9)).toBe(true); // hydro
    expect(walkable.contains(6, 0)).toBe(true); // corridor
  });

  it('lets you cross walls only through doors', () => {
    expect(walkable.contains(3, -0.9)).toBe(true); // telecom door
    expect(walkable.contains(9, 0.9)).toBe(true); // hydro door
    expect(walkable.contains(12, 0)).toBe(true); // archway to the main room
    expect(walkable.contains(5, -0.9)).toBe(false); // solid corridor wall
    expect(walkable.contains(12, 2)).toBe(false); // main room west wall
    expect(walkable.contains(6, -2.5)).toBe(false); // service shaft
  });
});
