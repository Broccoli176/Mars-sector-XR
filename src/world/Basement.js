import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Panel } from '../ui/Panel.js';
import { createWallTexture, createFloorTexture, createCeilingTexture } from './textures.js';
import { roundedRingGeometry } from './roundedRect.js';
import { lightFactors, shade } from './bakedLight.js';

const PANEL_WIDTH = 2; // m covered by one wall texture repeat (kit wall panel, ASSET_CREATION_WORKFLOW)
const TILE = 2; // m covered by one floor/ceiling texture repeat
const DOOR_FRAME = { width: 0.08, depth: 0.32, color: '#c9a227' };
// Normal vs emergency lighting (lighting circuit unserved). `point` and `hemi` are light intensities,
// `glow` the faint self-light of the ceiling panels, `fixture` the brightness of the lamp housings.
const LIGHTING = {
  normal: { color: '#fff4e0', point: 4, hemi: 1.2, glow: '#2a2e33', fixture: 1 },
  emergency: { color: '#ff3b2f', point: 1.6, hemi: 0.25, glow: '#140606', fixture: 0.6 },
};
const HEMISPHERE = { sky: '#e6ecf5', ground: '#4a3c34' };
// The light of the shell is baked into vertex colours (src/world/bakedLight.js). Grid (m) of the vertices that
// carry it: finer where the light changes faster (the ceiling right above a lamp).
const BAKE_CELL = { floor: 0.5, ceiling: 0.25, wall: 0.4, trim: 0.5 };
/** @param {number} length @param {number} cell 0 = one segment */
const segments = (length, cell) => (cell > 0 ? Math.max(1, Math.ceil(length / cell - 1e-6)) : 1);
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

/** Box geometry baked at a world position; `cell` > 0 subdivides it for the baked light. */
function box(w, h, d, x, y, z, cell = 0) {
  return new THREE.BoxGeometry(w, h, d, segments(w, cell), segments(h, cell), segments(d, cell)).translate(x, y, z);
}

/** Average colour of a canvas texture in linear RGB. @param {THREE.Texture} texture */
function averageLinear(texture) {
  const canvas = /** @type {HTMLCanvasElement} */ (texture.image);
  const data = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).getImageData(0, 0, canvas.width, canvas.height).data;
  const lut = Float32Array.from({ length: 256 }, (_, i) => (i / 255 <= 0.04045 ? i / 255 / 12.92 : ((i / 255 + 0.055) / 1.055) ** 2.4));
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += lut[data[i + c]];
  return sum.map((v) => v / (data.length / 4));
}

/**
 * Greybox of the base built from layout.json (docs/FLOOR_PLAN.md).
 * Static geometry is merged by material (walls, floors, ceilings, trims, conduits, fixtures)
 * to keep draw calls low on Quest, and its lighting is baked into vertex colours (unlit materials: the
 * surfaces that fill most of the screen cost one texture fetch per pixel, AGENTS.md §7).
 * Returns teleport floors and ray blockers (plain, invisible collision meshes) and the lights that still
 * light the props.
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
  // Plain copies without subdivisions: what the rays (teleport, pointer, tool drop) are tested against.
  /** @type {THREE.BufferGeometry[]} */ const floorColGeos = [];
  /** @type {THREE.BufferGeometry[]} */ const wallColGeos = [];

  // Rooms: floor, ceiling, one point light, ceiling fixtures
  for (const room of layout.rooms) {
    rooms[room.id] = room;
    const [x0, x1] = room.x;
    const [z0, z1] = room.z;
    const w = x1 - x0;
    const d = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    const floor = new THREE.PlaneGeometry(w, d, segments(w, BAKE_CELL.floor), segments(d, BAKE_CELL.floor)).rotateX(-Math.PI / 2).translate(cx, 0, cz);
    floorGeos.push(paint(applyWorldUVs(floor, TILE, TILE), room.floor));
    floorColGeos.push(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(cx, 0, cz));
    const ceiling = new THREE.PlaneGeometry(w, d, segments(w, BAKE_CELL.ceiling), segments(d, BAKE_CELL.ceiling));
    ceilingGeos.push(applyWorldUVs(ceiling.rotateX(Math.PI / 2).translate(cx, H, cz), TILE, TILE));

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
      const light = new THREE.PointLight(LIGHTING.normal.color, LIGHTING.normal.point, Math.max(w, d) * 1.6, 1.4);
      light.position.set(cx, H - 0.35, cz);
      group.add(light);
      roomLights[room.id] = light;
    }
  }

  // Walls with openings: door gaps [s, e, height] (+ lintel and yellow frame) and
  // windows [s, e, sillY, topY, radius?] (wall kept below and above; radius > 0 rounds the corners).
  // Coordinates along the wall axis.
  for (const wall of layout.walls) {
    const [ax, az] = wall.from;
    const [bx, bz] = wall.to;
    const alongX = az === bz;
    const start = alongX ? Math.min(ax, bx) : Math.min(az, bz);
    const end = alongX ? Math.max(ax, bx) : Math.max(az, bz);
    const fixed = alongX ? az : ax;
    const openings = [
      ...(wall.gaps ?? []).map(([s0, s1, h]) => ({ s0, s1, y0: 0, y1: h, door: true })),
      ...(wall.windows ?? []).map(([s0, s1, y0, y1, radius = 0]) => ({ s0, s1, y0, y1, radius, door: false })),
    ].sort((p, q) => p.s0 - q.s0);

    /** @param {number} s @param {number} e @param {number} y0 @param {number} y1 */
    const segment = (s, e, y0, y1) => {
      if (e - s <= EPS || y1 - y0 <= EPS) return;
      const mid = (s + e) / 2;
      /** @type {[number, number, number, number, number, number]} */
      const dims = alongX
        ? [e - s, y1 - y0, thickness, mid, (y0 + y1) / 2, fixed]
        : [thickness, y1 - y0, e - s, fixed, (y0 + y1) / 2, mid];
      wallGeos.push(applyWorldUVs(box(...dims, BAKE_CELL.wall), PANEL_WIDTH, H));
      wallColGeos.push(box(...dims));
    };

    let cursor = start;
    for (const o of openings) {
      segment(cursor, o.s0, 0, H);
      segment(o.s0, o.s1, 0, o.y0); // below a window
      segment(o.s0, o.s1, o.y1, H); // lintel / above a window
      cursor = o.s1;
      if (!o.door && o.radius > 0) {
        // Rounded window: fill the four corners of the rectangular cut with wall (same merged mesh).
        const w = o.s1 - o.s0;
        const h = o.y1 - o.y0;
        const fill = roundedRingGeometry({ w, h, r: 0 }, { w, h, r: o.radius }, thickness);
        if (alongX) fill.translate((o.s0 + o.s1) / 2, (o.y0 + o.y1) / 2, fixed);
        else fill.rotateY(-Math.PI / 2).translate(fixed, (o.y0 + o.y1) / 2, (o.s0 + o.s1) / 2);
        wallGeos.push(applyWorldUVs(fill, PANEL_WIDTH, H));
        wallColGeos.push(fill);
      }
      if (!o.door) continue;

      const fw = DOOR_FRAME.width;
      const fd = DOOR_FRAME.depth;
      const gh = o.y1;
      const jamb = (/** @type {number} */ at) =>
        alongX ? box(fw, gh, fd, at, gh / 2, fixed, BAKE_CELL.trim) : box(fd, gh, fw, fixed, gh / 2, at, BAKE_CELL.trim);
      trimGeos.push(jamb(o.s0 + fw / 2), jamb(o.s1 - fw / 2));
      trimGeos.push(alongX
        ? box(o.s1 - o.s0, fw, fd, (o.s0 + o.s1) / 2, gh - fw / 2, fixed, BAKE_CELL.trim)
        : box(fd, fw, o.s1 - o.s0, fixed, gh - fw / 2, (o.s0 + o.s1) / 2, BAKE_CELL.trim));
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
        ? new THREE.CylinderGeometry(c.r, c.r, length, 10, segments(length, BAKE_CELL.trim)).rotateZ(Math.PI / 2).translate(cx, c.y, cz + c.side * halfWidth)
        : new THREE.CylinderGeometry(c.r, c.r, length, 10, segments(length, BAKE_CELL.trim)).rotateX(Math.PI / 2).translate(cx + c.side * halfWidth, c.y, cz);
      trimGeos.push(paint(pipe, c.color));
    }
  }

  // Materials (shared) and merged meshes. The shell is unlit: its light is baked into vertex colours below.
  const ceilingTexture = createCeilingTexture();
  const floorMaterial = new THREE.MeshBasicMaterial({ map: createFloorTexture(), vertexColors: true });
  const wallMaterial = new THREE.MeshBasicMaterial({ map: createWallTexture(), vertexColors: true });
  const ceilingMaterial = new THREE.MeshBasicMaterial({ map: ceilingTexture, vertexColors: true });
  // The ceiling panels glow a little (a constant added after the texture, like a Lambert material's emissive).
  // An unlit material has no such term, so one line is added to its shader. If a future Three.js lays the
  // shader out differently the hook is skipped and the glow is folded into the baked colours instead (the
  // dark grid lines then get a little less of it).
  const ceilingGlow = { value: new THREE.Color(0, 0, 0) };
  const GLOW_HOOK = 'vec3 outgoingLight = reflectedLight.indirectDiffuse;';
  const glowInShader = THREE.ShaderLib.basic.fragmentShader.includes(GLOW_HOOK);
  if (glowInShader) {
    ceilingMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.ceilingGlow = ceilingGlow;
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform vec3 ceilingGlow; void main() {')
        .replace(GLOW_HOOK, 'vec3 outgoingLight = reflectedLight.indirectDiffuse + ceilingGlow;');
    };
    ceilingMaterial.customProgramCacheKey = () => 'ceilingGlow';
  }
  const trimMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  const fixtureMaterial = new THREE.MeshBasicMaterial({ color: LIGHTING.normal.color, toneMapped: false });

  const floorsVisual = new THREE.Mesh(mergeGeometries(floorGeos), floorMaterial);
  floorsVisual.name = 'ENV_Floors';
  const wallsVisual = new THREE.Mesh(mergeGeometries(wallGeos), wallMaterial);
  wallsVisual.name = 'ENV_Walls';
  const ceilings = new THREE.Mesh(mergeGeometries(ceilingGeos), ceilingMaterial);
  ceilings.name = 'ENV_Ceilings';
  const trims = new THREE.Mesh(mergeGeometries(trimGeos), trimMaterial);
  trims.name = 'ENV_Trims';
  const fixtures = new THREE.Mesh(mergeGeometries(fixtureGeos), fixtureMaterial);
  fixtures.name = 'LGT_Fixtures';
  // Collision meshes: never drawn, only ray-tested (a handful of triangles instead of the subdivided shell).
  const collisionMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const floors = new THREE.Mesh(mergeGeometries(floorColGeos), collisionMaterial);
  floors.name = 'COL_Floor_all';
  floors.userData.teleport = true;
  const walls = new THREE.Mesh(mergeGeometries(wallColGeos), collisionMaterial);
  walls.name = 'COL_Walls';
  walls.userData.blocksRay = true;
  for (const m of [floors, walls]) m.visible = false;
  for (const m of [floorsVisual, wallsVisual, ceilings, trims, fixtures, floors, walls]) {
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
  }

  // ---- Baked lighting: same result as lighting these meshes with the lamps, the hemisphere light and the
  // exterior sun, computed once per vertex instead of per pixel every frame ----
  const pointLights = Object.values(roomLights).map((l) => ({ x: l.position.x, y: l.position.y, z: l.position.z, distance: l.distance, decay: l.decay }));
  const ceilingAverage = averageLinear(ceilingTexture);
  /** @type {{ colors: THREE.BufferAttribute, position: ArrayLike<number>, normal: ArrayLike<number>, tint: Float32Array | null, glow: boolean, factors: ReturnType<typeof lightFactors> | null }[]} */
  const baked = [floorsVisual, wallsVisual, ceilings, trims].map((mesh) => {
    const geo = mesh.geometry;
    const tint = geo.attributes.color ? Float32Array.from(geo.attributes.color.array) : null;
    const colors = new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3);
    geo.setAttribute('color', colors);
    return { colors, position: geo.attributes.position.array, normal: geo.attributes.normal.array, tint, glow: mesh === ceilings, factors: null };
  });
  let emergencyOn = false;
  /** Light from outside the shell (the sun and ambient light of the exterior), set by `setExteriorLight`. */
  const exterior = { direction: /** @type {[number, number, number]} */ ([0, 1, 0]), sun: [0, 0, 0], ambient: [0, 0, 0] };
  const _c = new THREE.Color();
  const rgb = (/** @type {THREE.ColorRepresentation} */ color, /** @type {number} */ k) => {
    _c.set(color);
    return [_c.r * k, _c.g * k, _c.b * k];
  };
  const relight = () => {
    const mode = emergencyOn ? LIGHTING.emergency : LIGHTING.normal;
    const env = {
      sky: rgb(HEMISPHERE.sky, mode.hemi),
      ground: rgb(HEMISPHERE.ground, mode.hemi),
      point: rgb(mode.color, mode.point),
      sun: exterior.sun,
      ambient: exterior.ambient,
    };
    // Ceiling glow: a shader constant when the hook is available, otherwise baked (divided by the average
    // texture colour, because baked colours are multiplied by the texture and the glow must not be).
    ceilingGlow.value.set(mode.glow);
    const bakedGlow = glowInShader ? null : rgb(mode.glow, 1).map((v, i) => v / ceilingAverage[i]);
    for (const b of baked) {
      if (!b.factors) b.factors = lightFactors(b.position, b.normal, pointLights, exterior.direction);
      shade(/** @type {Float32Array} */ (b.colors.array), b.tint, b.factors, b.glow && bakedGlow ? { ...env, emissive: bakedGlow } : env);
      b.colors.needsUpdate = true;
    }
  };
  relight();

  /** @type {THREE.Mesh[]} door signs (each belongs to the room it hangs in: room visibility culling) */
  const signs = [];
  for (const sign of layout.signs) {
    const panel = new Panel(1.0, 0.22, { pxPerMeter: 360 });
    panel.renderLines('', [{ text: t(rooms[sign.room].nameKey), size: 1.6 }]);
    panel.mesh.position.fromArray(sign.position);
    panel.mesh.rotation.y = sign.rotationY;
    group.add(panel.mesh);
    signs.push(panel.mesh);
  }

  // The lights themselves stay in the scene: they still light the props (furniture, tools, plants).
  const hemi = new THREE.HemisphereLight(HEMISPHERE.sky, HEMISPHERE.ground, LIGHTING.normal.hemi);
  group.add(hemi);

  /** Normal vs emergency lighting (lighting circuit unserved). @param {boolean} emergency */
  const setEmergency = (emergency) => {
    emergencyOn = emergency;
    const mode = emergency ? LIGHTING.emergency : LIGHTING.normal;
    hemi.intensity = mode.hemi;
    fixtureMaterial.color.set(mode.color).multiplyScalar(mode.fixture);
    for (const light of Object.values(roomLights)) {
      light.color.set(mode.color);
      light.intensity = mode.point;
    }
    relight();
  };

  const _from = new THREE.Vector3();
  const _to = new THREE.Vector3();
  /**
   * Tells the baked shell about the exterior lights (Three.js lights are global: the rover world's sun and
   * ambient light also reach the base, and the props are lit by them). Cheap to call often: it only re-shades
   * when a colour or intensity changed.
   * @param {THREE.DirectionalLight} sunLight @param {THREE.AmbientLight} ambientLight
   */
  const setExteriorLight = (sunLight, ambientLight) => {
    const sun = rgb(sunLight.color, sunLight.intensity);
    const ambient = rgb(ambientLight.color, ambientLight.intensity);
    sunLight.getWorldPosition(_from).sub(sunLight.target.getWorldPosition(_to)).normalize();
    /** @type {[number, number, number]} */
    const direction = [_from.x, _from.y, _from.z];
    const same = (/** @type {number[]} */ p, /** @type {number[]} */ q) => p.every((v, i) => Math.abs(v - q[i]) < 1e-4);
    if (same(sun, exterior.sun) && same(ambient, exterior.ambient) && same(direction, exterior.direction)) return;
    if (!same(direction, exterior.direction)) for (const b of baked) b.factors = null;
    Object.assign(exterior, { direction, sun, ambient });
    relight();
  };

  return { group, floors: [floors], walls: [walls], signs, roomLights, hemi, rooms, setEmergency, setExteriorLight };
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
