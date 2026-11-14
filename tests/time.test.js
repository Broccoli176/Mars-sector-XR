import { describe, it, expect } from 'vitest';
import { TimeManager } from '../src/systems/TimeManager.js';
import { createBus } from '../src/utils/EventBus.js';
import { gameData } from '../src/data/index.js';

const cfg = gameData.balance.time;

describe('TimeManager', () => {
  it('maps ticks to the 06:00 day boundary', () => {
    const tm = new TimeManager(cfg, createBus());
    expect(tm.clock(0)).toMatchObject({ day: 1, hour: 6, minute: 0 });
    expect(tm.clock(18 * 60)).toMatchObject({ day: 1, hour: 0, minute: 0 });
    expect(tm.clock(1440)).toMatchObject({ day: 2, hour: 6 });
    expect(tm.totalTicks).toBe(10080);
  });

  it('converts scripted times to ticks', () => {
    expect(TimeManager.tickOf(1, '09:00', cfg)).toBe(180);
    expect(TimeManager.tickOf(4, '06:00', cfg)).toBe(3 * 1440);
    expect(TimeManager.tickOf(7, '12:00', cfg)).toBe(6 * 1440 + 360);
  });

  it('runs 4 ticks per real second at 1x and caps catch-up', () => {
    const tm = new TimeManager(cfg, createBus());
    expect(tm.consume(1)).toBe(4);
    tm.setSpeed(4);
    expect(tm.consume(10)).toBe(cfg.maxTicksPerFrame);
    expect(tm.consume(0.01)).toBe(0); // excess was discarded, not banked
  });

  it('auto-pause stores the previous speed', () => {
    const bus = createBus();
    const tm = new TimeManager(cfg, bus);
    tm.setSpeed(2);
    bus.emit('time:autoPause');
    expect(tm.speed).toBe(0);
    expect(tm.previousSpeed).toBe(2);
    expect(tm.consume(1)).toBe(0);
  });
});
