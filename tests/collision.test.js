import { describe, it, expect } from 'vitest';
import { buildCollider, PLAYER_RADIUS } from '../src/vr/Collision.js';
import { gameData } from '../src/data/index.js';

/** Walks in a straight line in small frames, like the keyboard does at ~72 fps. */
function walk(collider, start, dir, metres, speed = 1.8, fps = 72) {
  let p = { x: start[0], z: start[1] };
  const len = Math.hypot(dir[0], dir[1]);
  const step = speed / fps;
  for (let d = 0; d < metres; d += step) p = collider.move(p.x, p.z, (dir[0] / len) * step, (dir[1] / len) * step);
  return p;
}

// Hub-and-spokes layout (docs/FLOOR_PLAN.md): hub x −3…3, z −2.5…2.5.
describe('Collision on the hub layout (keyboard locomotion)', () => {
  const collider = buildCollider(gameData.layout);

  it('hub → north hall through the 1.8 m opening', () => {
    const p = walk(collider, [0, 1], [0, -1], 6);
    expect(p.z).toBeLessThan(-4.8); // inside hall_north (z −6.4…−4.6)
  });

  it('north hall → Telecom (west door) and → Control (east door)', () => {
    expect(walk(collider, [-2, -5.5], [-1, 0], 5).x).toBeLessThan(-6); // Telecom x −10…−5
    expect(walk(collider, [2, -5.5], [1, 0], 5).x).toBeGreaterThan(6); // Control x 5…11
  });

  it('guides the player through a door when 0.35 m off-centre', () => {
    const p = walk(collider, [-2, -5.85], [-1, 0], 6);
    expect(p.x).toBeLessThan(-6);
    expect(Math.abs(p.z + 5.5)).toBeLessThan(0.6);
  });

  it('hub → Personal through the west corridor', () => {
    const p = walk(collider, [-2, 0], [-1, 0], 6);
    expect(p.x).toBeLessThan(-7); // Personal x −11…−6
  });

  it('hub → south hall → Energy and → Hydro', () => {
    const south = walk(collider, [0, 1], [0, 1], 6);
    expect(south.z).toBeGreaterThan(6.2); // hall_south (z 6…7.8)
    expect(walk(collider, [2, 6.9], [1, 0], 8).x).toBeGreaterThan(8); // Energy x 7…13
    expect(walk(collider, [-2, 6.9], [-1, 0], 6).x).toBeLessThan(-6); // Hydro x −10…−5
  });

  it('stops at solid walls, even with a large step', () => {
    const blocked = walk(collider, [2, 0], [1, 0], 3); // hub east wall at x = 3
    expect(blocked.x).toBeLessThanOrEqual(3 - 0.1 - PLAYER_RADIUS + 0.01);
    expect(collider.move(2, 0, 3, 0).x).toBeLessThan(3);
  });

  it('blocks added furniture', () => {
    const c = buildCollider(gameData.layout);
    c.addBox({ x0: 10.2, x1: 10.9, z0: -6.3, z1: -4.7 }); // main PC desk in Control
    const p = walk(c, [8, -5.5], [1, 0], 4);
    expect(p.x).toBeLessThan(10.2 - PLAYER_RADIUS + 0.01);
  });
});
