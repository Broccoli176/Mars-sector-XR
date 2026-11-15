import { describe, it, expect } from 'vitest';
import { gameData } from '../src/data/index.js';
import { builders, batteryCharge, batteryStorageLines } from '../src/rooms/energy/stations.js';

describe('Energía solar desk', () => {
  it('has no Rover 2 console any more', () => {
    expect(gameData.layout.stations.find((item) => item.id === 'energy_rover2')).toBeUndefined();
    expect(builders.energy_rover2).toBeUndefined();
  });

  it('explains whether the battery is charging or discharging, and how long it lasts', () => {
    const t = (/** @type {string} */ key, /** @type {any} */ p) => `${key}${p ? JSON.stringify(p) : ''}`;
    expect(batteryCharge({ value: 20, max: 40, ratePerHour: 2 }, t)).toMatchObject({ key: 'charging', text: expect.stringContaining('"h":"10"') });
    expect(batteryCharge({ value: 10, max: 40, ratePerHour: -4 }, t)).toMatchObject({ key: 'discharging', text: expect.stringContaining('"h":"2,5"') });
    expect(batteryCharge({ value: 40, max: 40, ratePerHour: 0.5 }, t).key).toBe('full');
    expect(batteryCharge({ value: 20, max: 40, ratePerHour: 0 }, t).key).toBe('idle');
  });

  it('formats the digital battery display with stored energy, generation and consumption', () => {
    const t = (/** @type {string} */ key, /** @type {any} */ p) => `${key} ${JSON.stringify(p)}`;
    const lines = batteryStorageLines(
      { value: 42.5, max: 60, ratePerHour: 0.75, status: 'nominal' },
      1.25,
      0.5,
      t,
    );
    expect(lines.map((line) => line.text)).toContain('solar.storage.amount {"value":"42.5","max":"60.0"}');
    expect(lines.map((line) => line.text)).toContain('solar.storage.generation {"kw":"1.25"}');
    expect(lines.map((line) => line.text)).toContain('solar.storage.consumption {"kw":"0.50"}');
  });
});
