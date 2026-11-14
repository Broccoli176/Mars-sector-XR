import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Panel } from '../ui/Panel.js';
import { createWallTexture, createFloorTexture, createCeilingTexture } from './textures.js';

const PANEL_WIDTH = 2; // m covered by one wall texture repeat (kit wall panel, ASSET_CREATION_WORKFLOW)
const TILE = 2; // m covered by one floor/ceiling texture repeat
const DOOR_FRAME = { width: 0.08, depth: 0.32, color: '#c9a227' };
const LIGHT_COLORS = { normal: '#fff4e0', emergency: '#ff3b2f' };
const CONDUITS = [
  // Pipes near the ceiling along both walls of every hall, colour-coded per ASSET_CREATION_WORKFLOW §4
  // (O₂ blue, power yellow, water green). side: -1 / +1 = which wall; inset from the wall centre line.
  { side: -1, y: 2.46, r: 0.045, color: '#7fb3d5' },
  { side: -1, y: 2.34, r: 0.035, color: '#d9b44a' },
  { side: 1, y: 2.46, r: 0.045, color: '#6fae7a' },
  { side: 1, y: 2.34, r: 0.03, color: '#9aa1a8' },
];
const CONDUIT_INSET = 0.17; // m from the wall centre line
const CONDUIT_MIN_LENGTH = 2.5; // m: only halls long enough get pipes
const EPS = 0.01;

/**
 * Planar world-space UVs so textures keep real-world scale on any box/plane size.
 * Faces facing ±y use (x, z); faces facing ±x use (z, y); faces facing ±z use (x, y).
 * @param {THREE.BufferGeometry} geo already transformed to world space
 * @param {number} uScale metres per texture repeat horizontally
 * @param {number} vScale metres per texture repeat vertically (walls) / along z (floors)
 */
function applyWorldUVs(geo, uScale, vScale) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    if (ny > 0.5) uv.setXY(i, x / uScale, z / vScale);
    else if (nx > 0.5) uv.setXY(i, z / uScale, y / vScale);
    else uv.setXY(i, x / uScale, y / vScale);
  }
  uv.needsUpdate = true;
  return geo;
}

/** Adds a constant vertex colour attribute. @param {THREE.BufferGeometry} geo @param {THREE.ColorRepresentation} color */
function paint(geo, color) {
  const c = new THREE.Color(color);
  const count = geo.attributes.position.count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) data.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geo;
}

/** Box geometry baked at a world position. */
function box(w, h, d, x, y, z) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/**
 * Greybox of the base built from layout.json (docs/FLOOR_PLAN.md).
 * Static geometry is merged by material (walls, floors, ceilings, trims, conduits, fixtures)
 * to keep draw calls low on Quest. Returns teleport floors, ray blockers and lights.
 * @param {any} layout
 * @param {(key: string) => string} t
 */
export function buildBasement(layout, t) {
  const group = new THREE.Group();
  group.name = 'Basement';
  const H = layout.ceilingHeight;
  const thickness = layout.wallThickness;

  /** @type {Record<string, any>} */
  const rooms = {};
  /** @type {Record<string, THREE.PointLight>} */
  const roomLights = {};
  /** @type {THREE.BufferGeometry[]} */ const floorGeos = [];
  /** @type {THREE.BufferGeometry[]} */ const ceilingGeos = [];
  /** @type {THREE.BufferGeometry[]} */ const wallGeos = [];
  /** @type {THREE.BufferGeometry[]} */ const trimGeos = [];
  /** @type {THREE.BufferGeometry[]} */ const fixtureGeos = [];

  // Rooms: floor, ceiling, one point light, ceiling fixtures
  for (const room of layout.rooms) {
    rooms[room.id] = room;
    const [x0, x1] = room.x;
    const [z0, z1] = room.z;
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    const floor = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(cx, 0, cz);
    floorGeos.push(paint(applyWorldUVs(floor, TILE, TILE), room.floor));
    ceilingGeos.push(applyWorldUVs(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2).translate(cx, H, cz), TILE, TILE));

    // Fixtures: one per ~4 m along the long axis
    const alongX = w >= d;
    const count = Math.max(1, Math.round((alongX ? w : d) / 4));
    for (let i = 0; i < count; i++) {
      const f = (i + 0.5) / count;
      const fx = alongX ? x0 + w * f : cx;
      const fz = alongX ? cz : z0 + d * f;
      fixtureGeos.push(alongX ? box(1.1, 0.04, 0.28, fx, H - 0.02, fz) : box(0.28, 0.04, 1.1, fx, H - 0.02, fz));
    }

    // Rooms get one point light; corridors (light: false) rely on fixtures + hemisphere (Quest light budget).
    if (room.light !== false) {
      const light = new THREE.PointLight(LIGHT_COLORS.normal, 4, Math.max(w, d) * 1.6, 1.4);
      light.position.set(cx, H - 0.35, cz);
      group.add(light);
      roomLights[room.id] = light;
    }
  }

  // Walls with openings: door gaps [s, e, height] (+ lintel and yellow frame) and
  // windows [s, e, sillY, topY] (wall kept below and above). Coordinates along the wall axis.
  for (const wall of layout.walls) {
    const [ax, az] = wall.from;
    const [bx, bz] = wall.to;
    const alongX = az === bz;
    const start = alongX ? Math.min(ax, bx) : Math.min(az, bz);
    const end = alongX ? Math.max(ax, bx) : Math.max(az, bz);
    const fixed = alongX ? az : ax;
    const openings = [
      ...(wall.gaps ?? []).map(([s0, s1, h]) => ({ s0, s1, y0: 0, y1: h, door: true })),
      ...(wall.windows ?? []).map(([s0, s1, y0, y1]) => ({ s0, s1, y0, y1, door: false })),
    ].sort((p, q) => p.s0 - q.s0);

    /** @param {number} s @param {number} e @param {number} y0 @param {number} y1 */
    const segment = (s, e, y0, y1) => {
      if (e - s <= EPS || y1 - y0 <= EPS) return;
      const mid = (s + e) / 2;
      const geo = alongX
        ? box(e - s, y1 - y0, thickness, mid, (y0 + y1) / 2, fixed)
        : box(thickness, y1 - y0, e - s, fixed, (y0 + y1) / 2, mid);
      wallGeos.push(applyWorldUVs(geo, PANEL_WIDTH, H));
    };

    let cursor = start;
    for (const o of openings) {
      segment(cursor, o.s0, 0, H);
      segment(o.s0, o.s1, 0, o.y0); // below a window
      segment(o.s0, o.s1, o.y1, H); // lintel / above a window
      cursor = o.s1;
      if (!o.door) continue;

      const fw = DOOR_FRAME.width;
      const fd = DOOR_FRAME.depth;
      const gh = o.y1;
      const jamb = (/** @type {number} */ at) =>
        alongX ? box(fw, gh, fd, at, gh / 2, fixed) : box(fd, gh, fw, fixed, gh / 2, at);
      trimGeos.push(jamb(o.s0 + fw / 2), jamb(o.s1 - fw / 2));
      trimGeos.push(alongX
        ? box(o.s1 - o.s0, fw, fd, (o.s0 + o.s1) / 2, gh - fw / 2, fixed)
        : box(fd, fw, o.s1 - o.s0, fixed, gh - fw / 2, (o.s0 + o.s1) / 2));
    }
    segment(cursor, end, 0, H);
  }
  for (const geo of trimGeos) paint(geo, DOOR_FRAME.color);

  // Conduits along the long axis of every corridor area (rooms with light: false), just below the ceiling
  for (const hall of layout.rooms.filter((/** @type {any} */ r) => r.light === false)) {
    const [hx0, hx1] = hall.x;
    const [hz0, hz1] = hall.z;
    const alongX = hx1 - hx0 >= hz1 - hz0;
    const length = alongX ? hx1 - hx0 : hz1 - hz0;
    if (length < CONDUIT_MIN_LENGTH) continue;
    const halfWidth = (alongX ? hz1 - hz0 : hx1 - hx0) / 2 - CONDUIT_INSET;
    const cx = (hx0 + hx1) / 2;
    const cz = (hz0 + hz1) / 2;
    for (const c of CONDUITS) {
      const pipe = alongX
        ? new THREE.CylinderGeometry(c.r, c.r, length, 10).rotateZ(Math.PI / 2).translate(cx, c.y, cz + c.side * halfWidth)
        : new THREE.CylinderGeometry(c.r, c.r, length, 10).rotateX(Math.PI / 2).translate(cx + c.side * halfWidth, c.y, cz);
      trimGeos.push(paint(pipe, c.color));
    }
  }

  // Materials (shared) and merged meshes
  const floorMaterial = new THREE.MeshLambertMaterial({ map: createFloorTexture(), vertexColors: true });
  const wallMaterial = new THREE.MeshLambertMaterial({ map: createWallTexture() });
  const ceilingMaterial = new THREE.MeshLambertMaterial({ map: createCeilingTexture(), emissive: '#2a2e33' });
  const trimMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const fixtureMaterial = new THREE.MeshBasicMaterial({ color: LIGHT_COLORS.normal, toneMapped: false });

  const floors = new THREE.Mesh(mergeGeometries(floorGeos), floorMaterial);
  floors.name = 'COL_Floor_all';
  floors.userData.teleport = true;
  const walls = new THREE.Mesh(mergeGeometries(wallGeos), wallMaterial);
  walls.name = 'ENV_Walls';
  walls.userData.blocksRay = true;
  const ceilings = new THREE.Mesh(mergeGeometries(ceilingGeos), ceilingMaterial);
  const trims = new THREE.Mesh(mergeGeometries(trimGeos), trimMaterial);
  const fixtures = new THREE.Mesh(mergeGeometries(fixtureGeos), fixtureMaterial);
  for (const m of [floors, walls, ceilings, trims, fixtures]) {
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
  }

  for (const sign of layout.signs) {
    const panel = new Panel(1.0, 0.22, { pxPerMeter: 360 });
    panel.renderLines('', [{ text: t(rooms[sign.room].nameKey), size: 1.6 }]);
    panel.mesh.position.fromArray(sign.position);
    panel.mesh.rotation.y = sign.rotationY;
    group.add(panel.mesh);
  }

  const hemi = new THREE.HemisphereLight('#e6ecf5', '#4a3c34', 1.2);
  group.add(hemi);

  /** Normal vs emergency lighting (lighting circuit unserved). @param {boolean} emergency */
  const setEmergency = (emergency) => {
    hemi.intensity = emergency ? 0.25 : 1.2;
    ceilingMaterial.emissive.set(emergency ? '#140606' : '#2a2e33');
    fixtureMaterial.color.set(emergency ? LIGHT_COLORS.emergency : LIGHT_COLORS.normal);
    fixtureMaterial.color.multiplyScalar(emergency ? 0.6 : 1);
    for (const light of Object.values(roomLights)) {
      light.color.set(emergency ? LIGHT_COLORS.emergency : LIGHT_COLORS.normal);
      light.intensity = emergency ? 1.6 : 4;
    }
  };

  return { group, floors: [floors], walls: [walls], roomLights, hemi, rooms, setEmergency };
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
