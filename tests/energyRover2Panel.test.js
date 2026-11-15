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
      addPanel: () => ({
        mesh: { position: { z: 0 }, visible: true },
        renderLines: () => {},
        renderCustom: (key) => rendered.push(key),
      }),
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

    // Pictogram panel: not controlling, 25 % dust → «Pulsa CONTROLAR…».
    expect(rendered[0]).toBe('false|25|energy.rover2.msg_ready');
    // CONTROLAR and LIMPIAR emit intents; the Info button only opens its sheet.
    expect(intents).toEqual([['rover2:control'], ['rover2:clean']]);
    expect(controls.map((c) => c.options.label)).toContain('ui.btn.info');
  });
});
