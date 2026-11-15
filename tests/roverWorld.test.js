import { describe, it, expect } from 'vitest';
import { ROVER_WORLD_ORIGIN, SAMPLES_DATA } from '../src/world/RoverWorld.js';

describe('Rover Open World & First-Person Exploration System', () => {
  it('places open world sufficiently far from the base to remain out of sight', () => {
    // Base is within x: [-15..15], z: [-15..15]. Rover world origin must be far away.
    const distFromBase = Math.hypot(ROVER_WORLD_ORIGIN.x, ROVER_WORLD_ORIGIN.z);
    expect(distFromBase).toBeGreaterThan(400);
  });

  it('defines valid collectible samples with scientific composition and analysis data', () => {
    const samples = Object.values(SAMPLES_DATA);
    expect(samples.length).toBeGreaterThanOrEqual(4);
    for (const s of samples) {
      expect(s.id).toBeDefined();
      expect(s.name).toBeDefined();
      expect(s.composition).toBeDefined();
      expect(s.analysis).toBeDefined();
      expect(s.coords).toBeDefined();
      expect(typeof s.coords.x).toBe('number');
      expect(typeof s.coords.y).toBe('number');
    }
  });

  it('contains both geological core drill samples and salvage recovery objects', () => {
    const samples = Object.values(SAMPLES_DATA);
    const cores = samples.filter((s) => s.type === 'core');
    const salvage = samples.filter((s) => s.type === 'salvage');
    expect(cores.length).toBeGreaterThanOrEqual(2);
    expect(salvage.length).toBeGreaterThanOrEqual(2);
  });
});
