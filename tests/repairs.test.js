import { describe, it, expect } from 'vitest';
import { gameData } from '../src/data/index.js';
import { newSim, runTicks } from './helpers/sim.js';

const comp = (/** @type {string} */ id) => gameData.balance.components.find((/** @type {any} */ c) => c.id === id);
/** @param {any} sim @param {string} type */
const collect = (sim, type) => {
  /** @type {any[]} */
  const list = [];
  sim.bus.on(type, (/** @type {any} */ e) => list.push(e));
  return list;
};

describe('hand-tool repairs (src/systems/Repairs.js)', () => {
  it('a scripted fan failure stops the CO₂ scrubber until the screwdriver fixes it', () => {
    const sim = newSim({ events: [{ id: 'f', day: 1, time: '07:00', type: 'failure', componentId: 'scrubber_fan' }] });
    sim.bus.emit('game:start');
    runTicks(sim, 61);
    expect(sim.lifeSupport.scrubberFanBroken).toBe(true);
    expect(sim.repairs.isBroken('scrubber_fan')).toBe(true);

    const rejected = collect(sim, 'repair:rejected');
    sim.bus.emit('repair:work', { componentId: 'scrubber_fan', seconds: 1 });
    expect(rejected[0]).toMatchObject({ reason: 'noTool', toolId: 'screwdriver' });

    sim.bus.emit('item:grab', { itemId: 'screwdriver', hand: 'right' });
    const spares = sim.resources.value('spares');
    const hold = comp('scrubber_fan').holdSeconds;
    sim.bus.emit('repair:work', { componentId: 'scrubber_fan', seconds: hold / 2 });
    sim.bus.emit('item:release', { itemId: 'screwdriver' }); // let go: progress is kept
    expect(sim.repairs.progress('scrubber_fan')).toBeCloseTo(0.5);
    sim.bus.emit('item:grab', { itemId: 'screwdriver', hand: 'right' });
    sim.bus.emit('repair:work', { componentId: 'scrubber_fan', seconds: hold / 2 });
    expect(sim.lifeSupport.scrubberFanBroken).toBe(false);
    expect(sim.repairs.isBroken('scrubber_fan')).toBe(false);
    expect(sim.resources.value('spares')).toBe(spares - comp('scrubber_fan').spares);
  });

  it('refuses without a spare part, when paused or when nothing is broken', () => {
    const sim = newSim({ events: [] });
    const rejected = collect(sim, 'repair:rejected');
    sim.bus.emit('item:grab', { itemId: 'wrench', hand: 'right' });
    sim.bus.emit('repair:work', { componentId: 'antenna_motor', seconds: 1 });
    sim.bus.emit('component:damaged', { componentId: 'antenna_motor', reason: 'test' });
    expect(sim.telecom.motorBroken).toBe(true);
    sim.resources.get('spares').value = 0;
    sim.bus.emit('repair:work', { componentId: 'antenna_motor', seconds: 1 });
    sim.resources.get('spares').value = 2;
    sim.bus.emit('time:setSpeed', { speed: 0 });
    sim.bus.emit('repair:work', { componentId: 'antenna_motor', seconds: 1 });
    expect(rejected.map((r) => r.reason)).toEqual(['notBroken', 'noSpare', 'paused']);
    sim.bus.emit('time:setSpeed', { speed: 1 });
    sim.bus.emit('repair:work', { componentId: 'antenna_motor', seconds: comp('antenna_motor').holdSeconds });
    expect(sim.telecom.motorBroken).toBe(false);
  });

  it('a hull leak drains pressure until the sealant gun seals it with one charge', () => {
    const sim = newSim({ events: [{ id: 'l', day: 1, time: '07:00', type: 'leak', leakId: 'hull_seal_hub' }] });
    sim.bus.emit('game:start');
    runTicks(sim, 61 + 60);
    expect(sim.lifeSupport.leaks).toEqual(['hull_seal_hub']);
    expect(sim.resources.value('pressure')).toBeLessThan(gameData.resources.pressure.start);
    const charges = sim.inventory.sealantCharges;
    const sealed = collect(sim, 'leak:sealed');
    sim.bus.emit('item:socket', { itemId: 'sealant_gun', slot: 'SKT_Holster_R' });
    sim.bus.emit('repair:work', { componentId: 'hull_seal_hub', seconds: comp('hull_seal').holdSeconds });
    expect(sealed).toEqual([{ leakId: 'hull_seal_hub' }]);
    expect(sim.lifeSupport.leaks).toEqual([]);
    expect(sim.inventory.sealantCharges).toBe(charges - 1);
  });

  it('low health makes repairs slower', () => {
    const sim = newSim({ events: [] });
    sim.bus.emit('component:damaged', { componentId: 'antenna_motor', reason: 'test' });
    const base = sim.repairs.holdSeconds('antenna_motor');
    sim.resources.get('health').value = 20;
    expect(sim.repairs.holdSeconds('antenna_motor')).toBeCloseTo(base * 1.5);
  });

  it('every scripted fault has its tool on the wall and a hint string', () => {
    const tools = new Set(gameData.balance.tools.map((/** @type {any} */ t) => t.id));
    for (const e of gameData.events.filter((/** @type {any} */ x) => x.type === 'failure' || x.type === 'leak')) {
      const id = e.componentId ?? 'hull_seal';
      expect(comp(id).inGame, id).toBe(true);
      expect(tools.has(comp(id).toolId)).toBe(true);
      expect(gameData.strings[e.hintKey], e.hintKey).toBeTypeOf('string');
    }
  });
});
