import { describe, it, expect } from 'vitest';
import { gameData } from '../src/data/index.js';
import { builders } from '../src/rooms/energy/stations.js';

describe('Rover 2 computer', () => {
  it('is located in the energy room', () => {
    const station = gameData.layout.stations.find((item) => item.id === 'energy_rover2');
    expect(station).toMatchObject({ room: 'room_energy', wall: 'south' });
  });

  it('offers third-person control and a cleaning intent from the energy console', () => {
    const intents = [];
    const rendered = [];
    const controls = [];
    let refresh;
    const kit = {
      t: (key) => key,
      sim: () => ({ phase: 'playing', power: { dustFactor: 0.75 } }),
      game: { intent: (...args) => intents.push(args) },
      services: { solarField: { isControllingRover2: false } },
      addBox: () => {},
      addPanel: () => ({ renderLines: (...args) => rendered.push(args) }),
      addButton: (_g, options, x, y) => {
        const control = { options, x, y, setState: () => {} };
        controls.push(control);
        return control;
      },
      onRefresh: (fn) => { refresh = fn; },
    };

    builders.energy_rover2({}, {}, kit);
    refresh();
    controls.forEach((control) => control.options.onSelect());

    expect(rendered[0][0]).toBe('solar.rover2.title');
    expect(rendered[0][1].map((line) => (typeof line === 'string' ? line : line.text)))
      .toContain('solar.rover2.link');
    expect(intents).toEqual([['rover2:control'], ['rover2:clean']]);
  });
});
