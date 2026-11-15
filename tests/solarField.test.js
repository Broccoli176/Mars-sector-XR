import { describe, it, expect } from 'vitest';
import { fieldLook } from '../src/world/SolarField.js';
import { projectToCam } from '../src/rooms/control/rover.js';
import { gameData } from '../src/data/index.js';

const power = gameData.balance.power;

describe('solar field window', () => {
  it('panels shine by day, go dark at night and get dusty in a storm (same hours as PowerGrid)', () => {
    const noon = fieldLook(12, false, power);
    expect(noon.daylight).toBe(true);
    expect(noon.panel).toBe(1);
    expect(noon.dust).toBe(0);
    const night = fieldLook(2, false, power);
    expect(night.daylight).toBe(false);
    expect(night.panel).toBeLessThan(0.3);
    expect(fieldLook(12, true, power).dust).toBe(1);
    expect(fieldLook(power.solarEndHour, false, power).daylight).toBe(false);
  });

  it('the sky always keeps a soft orange tint (noon, sunset, night, storm)', () => {
    const skies = [
      fieldLook(12, false, power).sky,
      fieldLook(power.solarEndHour - 0.2, false, power).sky,
      fieldLook(23, false, power).sky,
      fieldLook(12, true, power).sky,
    ];
    for (const [r, g, b] of skies) {
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(b);
    }
    // Sunset is a deeper orange than noon (more red relative to blue), never blue.
    const [noon, dusk] = skies;
    expect(dusk[0] / dusk[2]).toBeGreaterThan(noon[0] / noon[2]);
  });
});

describe('rover NavCam projection', () => {
  const rover = { x: 0, y: 0, heading: 0 }; // facing map north (+y)
  it('things ahead appear centred, to the right on the right, and nothing behind', () => {
    expect(projectToCam(rover, 0, 20)?.sx).toBeCloseTo(0);
    expect(projectToCam(rover, 5, 20)?.sx).toBeGreaterThan(0);
    expect(projectToCam(rover, 0, -20)).toBeNull();
    expect(projectToCam({ ...rover, heading: Math.PI / 2 }, 20, 0)?.forward).toBeCloseTo(20);
  });
});
