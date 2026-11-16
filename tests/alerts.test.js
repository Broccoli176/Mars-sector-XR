import { describe, it, expect } from 'vitest';
import { gameData } from '../src/data/index.js';
import { activeAlerts } from '../src/ui/alertRules.js';
import { newSim, runTicks } from './helpers/sim.js';

const cfg = gameData.balance.alerts;
const ids = (/** @type {any} */ sim) => activeAlerts(sim, cfg).map((a) => `${a.id}@${a.roomId}`);

describe('alert banner: faults and pending jobs with their room', () => {
  it('a fresh base has no faults; its only job is the half-used CO₂ filter (day 1 task)', () => {
    const sim = newSim({ events: [] });
    expect(activeAlerts(sim, cfg).filter((a) => a.level === 'critical')).toEqual([]);
    sim.lifeSupport.filterLifeHours = gameData.balance.lifeSupport.filterLifeHours; // fresh filter
    expect(activeAlerts(sim, cfg)).toEqual([]);
  });

  it('a tripped relay is a fault in Power and oxygen, until it is reset', () => {
    const sim = newSim({ events: [] });
    sim.power.trip(0, { guided: true });
    expect(ids(sim)).toContain('relay_tripped@room_energy');
    sim.bus.emit('relay:resetRequest');
    expect(ids(sim)).not.toContain('relay_tripped@room_energy');
  });

  it('broken parts point to their room: antenna motor → Telecom, leak → central hall, fan → Power', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('component:damaged', { componentId: 'antenna_motor', reason: 'test' });
    sim.bus.emit('component:damaged', { componentId: 'scrubber_fan', reason: 'test' });
    sim.bus.emit('leak:started', { leakId: 'hull_seal_hub' });
    expect(ids(sim)).toEqual(expect.arrayContaining(['fault_antenna_motor@room_telecom', 'fault_scrubber_fan@room_energy', 'fault_hull_seal_hub@room_hub']));
  });

  it('pending jobs: thirsty crops and ready harvest in Hydroponics, low filter in Power', () => {
    const sim = newSim({ events: [] });
    Object.assign(sim.food.trays[0], { cropId: 'lettuce', moisture: 0, ready: false });
    Object.assign(sim.food.trays[1], { cropId: 'lettuce', ready: true });
    sim.lifeSupport.filterLifeHours = cfg.filterLowHours - 1;
    const list = activeAlerts(sim, cfg);
    expect(list.find((a) => a.id === 'crop_dry')).toMatchObject({ roomId: 'room_hydro', level: 'warning', params: { n: 1 } });
    expect(list.find((a) => a.id === 'crop_ready')?.roomId).toBe('room_hydro');
    expect(list.find((a) => a.id === 'filter_low')?.roomId).toBe('room_energy');
  });

  it('faults are listed before pending jobs', () => {
    const sim = newSim({ events: [] });
    Object.assign(sim.food.trays[0], { cropId: 'lettuce', ready: true });
    sim.bus.emit('component:damaged', { componentId: 'antenna_motor', reason: 'test' });
    const levels = activeAlerts(sim, cfg).map((a) => a.level);
    expect(levels).toEqual([...levels].sort((a, b) => (a === b ? 0 : a === 'critical' ? -1 : 1)));
  });

  it('a switched-off breaker is a choice, not an alert; a circuit left without power is', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('game:start');
    sim.bus.emit('breaker:toggle', { circuitId: 'lighting', on: false });
    runTicks(sim, 1);
    expect(ids(sim).some((x) => x.startsWith('circuits_dark'))).toBe(false);
    sim.power.served.hydro = false;
    expect(ids(sim)).toContain('circuits_dark@room_energy');
  });

  it('every alert key exists in Spanish and English', () => {
    for (const lang of ['es', 'en']) {
      const strings = gameData.stringsByLang[lang];
      for (const k of Object.keys(gameData.stringsByLang.es).filter((x) => x.startsWith('alert.'))) expect(strings[k], `${lang} ${k}`).toBeTypeOf('string');
      for (const c of gameData.balance.components) expect(strings[`alert.fault.${c.id}`], c.id).toBeTypeOf('string');
    }
  });
});
