import { describe, it, expect } from 'vitest';
import { gameData } from '../src/data/index.js';
import { buildPortalGraph, roomAt, visibleRooms, visibleSectors, circleSeen } from '../src/world/visibilityRules.js';

const { layout } = gameData;
const graph = buildPortalGraph(layout);
const centre = (/** @type {string} */ id) => {
  const r = graph.rooms.find((room) => room.id === id);
  if (!r) throw new Error(id);
  return /** @type {[number, number]} */ ([(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]);
};
const seenFrom = (/** @type {string} */ id) => [...(visibleRooms(graph, ...centre(id)) ?? [])].sort();

/** Solid wall pieces as top-down segments (door gaps removed; windows do not lead to another room). */
const solids = layout.walls.flatMap((/** @type {any} */ wall) => {
  const [ax, az] = wall.from;
  const [bx, bz] = wall.to;
  const alongX = az === bz;
  const fixed = alongX ? az : ax;
  const start = alongX ? Math.min(ax, bx) : Math.min(az, bz);
  const end = alongX ? Math.max(ax, bx) : Math.max(az, bz);
  const pieces = [];
  let cursor = start;
  for (const [s0, s1] of [...(wall.gaps ?? [])].sort((p, q) => p[0] - q[0])) {
    pieces.push([cursor, s0]);
    cursor = s1;
  }
  pieces.push([cursor, end]);
  return pieces.filter(([s, e]) => e - s > 1e-6).map(([s, e]) => (alongX ? [s, fixed, e, fixed] : [fixed, s, fixed, e]));
});

/** True when the straight line between two floor points crosses no wall. */
function clearLine(px, pz, qx, qz) {
  for (const [ax, az, bx, bz] of solids) {
    const d = (qx - px) * (bz - az) - (qz - pz) * (bx - ax);
    if (Math.abs(d) < 1e-12) continue;
    const t = ((ax - px) * (bz - az) - (az - pz) * (bx - ax)) / d;
    const u = ((ax - px) * (qz - pz) - (az - pz) * (qx - px)) / d;
    if (t > 1e-9 && t < 1 - 1e-9 && u >= 0 && u <= 1) return false;
  }
  return true;
}

/** Grid of floor points inside a room, kept `inset` away from its walls. */
function grid(room, step, inset) {
  const out = [];
  for (let x = room.x0 + inset; x <= room.x1 - inset + 1e-9; x += step) {
    for (let z = room.z0 + inset; z <= room.z1 - inset + 1e-9; z += step) out.push([x, z]);
  }
  return out;
}

describe('room visibility (portal flood over layout.json)', () => {
  it('every door joins two rooms: 9 portals in the star layout', () => {
    expect(graph.portals).toHaveLength(9);
    for (const p of graph.portals) expect(p.a).not.toBe(p.b);
    expect(graph.byRoom.room_hub).toHaveLength(3); // north, south and Personal
  });

  it('finds the room of a point, and nothing outside the base', () => {
    expect(roomAt(graph.rooms, 0, 0)).toBe('room_hub');
    expect(roomAt(graph.rooms, ...centre('room_energy'))).toBe('room_energy');
    expect(roomAt(graph.rooms, 500, 500)).toBeNull();
    expect(visibleRooms(graph, 500, 500)).toBeNull(); // rover world: the caller decides
  });

  it('from the middle of the central hall you see Personal and the corridors, not the far rooms', () => {
    expect(seenFrom('room_hub')).toEqual(['conn_north', 'conn_south', 'hall_north', 'hall_south', 'room_hub', 'room_personal']);
  });

  it('from Control you see across the corridor into Telecom, but not the central hall', () => {
    const seen = seenFrom('room_control');
    expect(seen).toContain('hall_north');
    expect(seen).toContain('room_telecom');
    expect(seen).not.toContain('room_hub');
    expect(seen).not.toContain('room_energy');
    expect(seen).not.toContain('room_hydro');
  });

  it('standing in a doorway shows both rooms', () => {
    const seen = visibleRooms(graph, -3, 0); // door between the central hall and Personal
    expect(seen?.has('room_hub')).toBe(true);
    expect(seen?.has('room_personal')).toBe(true);
  });

  it('never hides a room that has a clear line of sight (checked against brute-force rays)', () => {
    let lines = 0;
    for (const from of graph.rooms) {
      for (const [px, pz] of grid(from, 0.9, 0.3)) {
        const seen = visibleRooms(graph, px, pz);
        expect(seen).not.toBeNull();
        for (const to of graph.rooms) {
          if (seen?.has(to.id)) continue;
          // The rule says «hidden»: no sample point of that room may be reachable by a straight line.
          for (const [qx, qz] of grid(to, 0.45, 0.15)) {
            lines++;
            if (clearLine(px, pz, qx, qz)) throw new Error(`${to.id} is visible from (${px.toFixed(2)}, ${pz.toFixed(2)}) in ${from.id} but was hidden`);
          }
        }
      }
    }
    expect(lines).toBeGreaterThan(10000);
  });

  it('a room seen through doors only shows the slice in line with them', () => {
    // From the middle of Energía you look through its door, along the south corridor, into Hidroponía.
    const [ex, ez] = centre('room_energy');
    const sectors = visibleSectors(graph, ex, ez);
    expect(sectors?.get('room_energy')).toBe('all');
    const hydro = sectors?.get('room_hydro');
    expect(Array.isArray(hydro)).toBe(true);
    // In line with both doors (z ≈ 6.9): seen. In the far corners of Hidroponía: not seen.
    expect(circleSeen(hydro, ex, ez, -9.5, 6.9, 0.5)).toBe(true);
    expect(circleSeen(hydro, ex, ez, -9.5, 10.5, 0.5)).toBe(false);
    expect(circleSeen(hydro, ex, ez, -6, 5.3, 0.3)).toBe(false);
    // The room you are in is always fully seen; a room with no line of sight never is.
    expect(circleSeen(sectors?.get('room_energy'), ex, ez, 14, 4, 0.1)).toBe(true);
    expect(circleSeen(sectors?.get('room_telecom'), ex, ez, -7.5, -5.5, 5)).toBe(false);
  });

  it('a sliver of a room is never hidden: every visible point is inside a reported sector', () => {
    for (const from of graph.rooms) {
      for (const [px, pz] of grid(from, 1.3, 0.3)) {
        const sectors = visibleSectors(graph, px, pz);
        for (const to of graph.rooms) {
          const seen = sectors?.get(to.id);
          if (!seen || seen === 'all') continue;
          for (const [qx, qz] of grid(to, 0.45, 0.15)) {
            if (clearLine(px, pz, qx, qz) && !circleSeen(seen, px, pz, qx, qz, 0)) {
              throw new Error(`point (${qx.toFixed(2)}, ${qz.toFixed(2)}) of ${to.id} is visible from (${px.toFixed(2)}, ${pz.toFixed(2)}) but outside its sectors`);
            }
          }
        }
      }
    }
  });

  it('hides most of the base from inside a room (that is the point)', () => {
    for (const id of ['room_control', 'room_telecom', 'room_hydro', 'room_energy', 'room_personal']) {
      const seen = visibleRooms(graph, ...centre(id));
      expect(seen?.size, id).toBeLessThanOrEqual(5);
    }
  });
});
