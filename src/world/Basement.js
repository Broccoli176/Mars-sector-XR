import * as THREE from 'three';
import { Panel } from '../ui/Panel.js';

const WALL_COLOR = '#7d848c';
const CEILING_COLOR = '#5d646c';
const LINTEL_EPS = 0.01;

/**
 * Greybox of the base built from layout.json (docs/FLOOR_PLAN.md).
 * Returns teleportable floors, blocking walls and per-room lights.
 * @param {any} layout
 * @param {(key: string) => string} t
 */
export function buildBasement(layout, t) {
  const group = new THREE.Group();
  group.name = 'Basement';
  const H = layout.ceilingHeight;
  const thickness = layout.wallThickness;
  const wallMaterial = new THREE.MeshLambertMaterial({ color: WALL_COLOR });
  const ceilingMaterial = new THREE.MeshLambertMaterial({ color: CEILING_COLOR });

  /** @type {THREE.Mesh[]} */
  const floors = [];
  /** @type {THREE.Mesh[]} */
  const walls = [];
  /** @type {Record<string, THREE.PointLight>} */
  const roomLights = {};
  /** @type {Record<string, any>} */
  const rooms = {};

  for (const room of layout.rooms) {
    rooms[room.id] = room;
    const [x0, x1] = room.x;
    const [z0, z1] = room.z;
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshLambertMaterial({ color: room.floor }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.name = `COL_Floor_${room.id}`;
    floor.userData.teleport = true;
    group.add(floor);
    floors.push(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(cx, H, cz);
    group.add(ceiling);

    const light = new THREE.PointLight('#fff1dc', 5, Math.max(w, d) * 1.6, 1.4);
    light.position.set(cx, H - 0.3, cz);
    group.add(light);
    roomLights[room.id] = light;
  }

  /**
   * Axis-aligned wall segment with optional door gaps [from, to, height] along its axis.
   * @param {{ from: number[], to: number[], gaps?: number[][] }} wall
   */
  const addWall = (wall) => {
    const [ax, az] = wall.from;
    const [bx, bz] = wall.to;
    const alongX = az === bz;
    const start = alongX ? Math.min(ax, bx) : Math.min(az, bz);
    const end = alongX ? Math.max(ax, bx) : Math.max(az, bz);
    const fixed = alongX ? az : ax;
    const gaps = [...(wall.gaps ?? [])].sort((a, b) => a[0] - b[0]);

    /** @param {number} s @param {number} e @param {number} y0 @param {number} y1 */
    const box = (s, e, y0, y1) => {
      const len = e - s;
      if (len <= LINTEL_EPS || y1 - y0 <= LINTEL_EPS) return;
      const geo = alongX
        ? new THREE.BoxGeometry(len, y1 - y0, thickness)
        : new THREE.BoxGeometry(thickness, y1 - y0, len);
      const mesh = new THREE.Mesh(geo, wallMaterial);
      const mid = (s + e) / 2;
      mesh.position.set(alongX ? mid : fixed, (y0 + y1) / 2, alongX ? fixed : mid);
      mesh.userData.blocksRay = true;
      group.add(mesh);
      walls.push(mesh);
    };

    let cursor = start;
    for (const [g0, g1, gh] of gaps) {
      box(cursor, g0, 0, H);
      box(g0, g1, gh, H); // lintel above the opening
      cursor = g1;
    }
    box(cursor, end, 0, H);
  };
  layout.walls.forEach(addWall);

  for (const sign of layout.signs) {
    const panel = new Panel(1.0, 0.22, { pxPerMeter: 360 });
    panel.renderLines('', [{ text: t(rooms[sign.room].nameKey), size: 1.6 }]);
    panel.mesh.position.fromArray(sign.position);
    panel.mesh.rotation.y = sign.rotationY;
    group.add(panel.mesh);
  }

  const hemi = new THREE.HemisphereLight('#dfe8ff', '#3a2f2a', 1.1);
  group.add(hemi);

  return { group, floors, walls, roomLights, hemi, rooms };
}

/**
 * World transform of a wall station (panel group), facing into the room.
 * @param {any} station layout.stations entry @param {any} room layout room
 */
export function stationTransform(station, room) {
  const off = 0.12;
  const [x0, x1] = room.x;
  const [z0, z1] = room.z;
  switch (station.wall) {
    case 'north': return { position: new THREE.Vector3(station.along, station.y, z0 + off), rotationY: 0 };
    case 'south': return { position: new THREE.Vector3(station.along, station.y, z1 - off), rotationY: Math.PI };
    case 'west': return { position: new THREE.Vector3(x0 + off, station.y, station.along), rotationY: Math.PI / 2 };
    case 'east': return { position: new THREE.Vector3(x1 - off, station.y, station.along), rotationY: -Math.PI / 2 };
    default: throw new Error(`Unknown wall ${station.wall}`);
  }
}
