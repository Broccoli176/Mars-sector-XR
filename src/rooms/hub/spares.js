// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// «Taquilla de repuestos»: an orange two-door cabinet in the hub workshop corner. Tap a door (ray + trigger /
// click) and both doors swing open: lit shelves show what is in stock (spare crates, CO₂ filters, sealant
// cartridges, O₂ tanks) and the inside of the left door says what each one is for.
// Presentation only: reads `sim()` (resources.spares + inventory), never mutates or emits intents.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../../ui/StationKit.js';
import { Panel } from '../../ui/Panel.js';
import { frame, text, tile, roundRect, paragraph } from '../../ui/pictograms.js';

const PAINTED = new THREE.MeshLambertMaterial({ vertexColors: true });
const INVISIBLE = new THREE.MeshBasicMaterial({ visible: false });
const W = 1.0; // cabinet width
const H = 1.9; // cabinet height
const D = 0.5; // cabinet depth
const T = 0.03; // board thickness
const DOOR_COLOR = '#d0782c';
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** @param {THREE.BufferGeometry} geo @param {THREE.ColorRepresentation} color */
function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  g.deleteAttribute('uv');
  return g;
}
const box = (/** @type {number} */ w, /** @type {number} */ h, /** @type {number} */ d, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z, /** @type {string} */ c) =>
  paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
const cyl = (/** @type {number} */ r, /** @type {number} */ h, /** @type {number} */ y, /** @type {string} */ c) =>
  paint(new THREE.CylinderGeometry(r, r, h, 14).translate(0, y, 0), c);

/** Stock item models, base at y = 0. */
const ITEM_GEOMETRY = {
  spares: () => mergeGeometries([box(0.15, 0.1, 0.13, 0, 0.05, 0, '#9a7a44'), box(0.152, 0.02, 0.132, 0, 0.06, 0, '#5c4626'), box(0.05, 0.03, 0.002, 0, 0.05, 0.066, '#f2f2f2')]),
  filters: () => mergeGeometries([cyl(0.055, 0.13, 0.065, '#e8ecf0'), cyl(0.057, 0.02, 0.03, '#2f6fb3'), cyl(0.057, 0.02, 0.1, '#2f6fb3')]),
  sealant: () => mergeGeometries([cyl(0.025, 0.17, 0.085, '#e0b030'), cyl(0.008, 0.04, 0.19, '#3a4048')]),
  o2: () => mergeGeometries([cyl(0.065, 0.3, 0.15, '#3f9f5f'), cyl(0.04, 0.03, 0.315, '#d8dde2'), cyl(0.012, 0.04, 0.35, '#8b9299')]),
};

/**
 * Where each stock type sits: shelf top surface (cabinet-local y), x range, rows (front/back) and cap.
 * Cabinet-local: y = 0 at the floor, z = 0 at the back, +z towards the room.
 */
const SHELVES = [
  { id: 'spares', y: 1.46, x0: -0.4, x1: 0.4, rows: 2, max: 10 },
  { id: 'filters', y: 0.96, x0: -0.36, x1: 0.36, rows: 2, max: 8 },
  { id: 'sealant', y: 0.48, x0: -0.38, x1: 0.38, rows: 2, max: 8 },
  { id: 'o2', y: 0.03 + T, x0: -0.33, x1: 0.33, rows: 1, max: 4 },
];
const SHELF_YS = [0.48, 0.96, 1.46];

/**
 * @param {THREE.Group} g station group (hub south wall)
 * @param {any} station
 * @param {import('../../ui/StationKit.js').StationKit} kit
 */
export function buildSparesLocker(g, station, kit) {
  const { t, sim, game } = kit;
  const cfg = game.data.balance.sparesLocker;
  const cab = new THREE.Group();
  cab.position.y = -station.y; // cabinet-local y = 0 on the floor
  g.add(cab);

  // ---- Shell (one merged mesh) + invisible solid for collision / ray blocking ----
  const inner = '#39414a';
  const shell = mergeGeometries([
    box(W, H, 0.02, 0, H / 2, 0.01, inner), // back
    box(T, H, D, -W / 2 + T / 2, H / 2, D / 2, '#59626c'),
    box(T, H, D, W / 2 - T / 2, H / 2, D / 2, '#59626c'),
    box(W, T, D, 0, H - T / 2, D / 2, '#59626c'),
    box(W, 0.03 + T, D, 0, (0.03 + T) / 2, D / 2, '#2a2f35'), // plinth
    ...SHELF_YS.map((y) => box(W - 2 * T, 0.02, D - 0.04, 0, y - 0.01, D / 2, '#7b858f')),
  ]);
  cab.add(new THREE.Mesh(shell, PAINTED));
  const solid = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), INVISIBLE);
  solid.position.set(0, H / 2, D / 2);
  cab.add(solid);
  kit.solids.push(solid);

  // Interior light strip under the top: dark when closed, bright when open.
  const lightMat = new THREE.MeshBasicMaterial({ color: '#202428', toneMapped: false });
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, 0.03).rotateX(Math.PI / 2), lightMat);
  strip.position.set(0, H - T - 0.005, D * 0.7);
  cab.add(strip);
  const lightOff = new THREE.Color('#202428');
  const lightOn = new THREE.Color('#fff2cc');

  // ---- Stock on the shelves (one InstancedMesh per type) ----
  const stock = SHELVES.map((sh) => {
    const mesh = new THREE.InstancedMesh(ITEM_GEOMETRY[/** @type {keyof typeof ITEM_GEOMETRY} */ (sh.id)](), PAINTED, sh.max);
    mesh.count = 0;
    mesh.frustumCulled = false;
    cab.add(mesh);
    return { ...sh, mesh, shown: -1 };
  });
  /** @param {typeof stock[number]} st @param {number} n @param {number} scale */
  const layout = (st, n, scale) => {
    const count = Math.min(st.max, Math.max(0, Math.round(n)));
    const perRow = Math.ceil(st.max / st.rows);
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const x = perRow === 1 ? (st.x0 + st.x1) / 2 : st.x0 + ((st.x1 - st.x0) * col) / (perRow - 1);
      const z = st.rows === 1 ? D * 0.5 : row === 0 ? D * 0.68 : D * 0.32;
      _m.compose(_p.set(x, st.y, z), _q.identity(), _s.setScalar(scale));
      st.mesh.setMatrixAt(i, _m);
    }
    st.mesh.count = count;
    st.mesh.instanceMatrix.needsUpdate = true;
    st.shown = count;
  };

  // ---- Doors (hinged at the outer edges) ----
  const doorW = W / 2 - 0.004;
  const doorGeo = (/** @type {1 | -1} */ dir) =>
    mergeGeometries([
      box(doorW, H - 0.02, 0.025, (dir * doorW) / 2, 0, 0, DOOR_COLOR),
      box(0.025, 0.2, 0.03, dir * (doorW - 0.05), 0, 0.025, '#d8dde2'), // handle near the middle seam
      box(doorW, 0.04, 0.027, (dir * doorW) / 2, -H / 2 + 0.2, 0, '#2a2f35'), // kick stripe
    ]);
  let open = false;
  let progress = 0; // 0 closed … 1 open
  const toggle = () => {
    open = !open;
    drawFront();
  };
  const doors = /** @type {const} */ ([1, -1]).map((dir) => {
    const pivot = new THREE.Group();
    pivot.position.set((-dir * W) / 2, H / 2 + 0.01, D + 0.014);
    cab.add(pivot);
    const door = new THREE.Mesh(doorGeo(dir), PAINTED);
    door.userData.interactive = true;
    door.userData.onSelect = toggle;
    pivot.add(door);
    kit.registerInteractive(door);
    return { pivot, dir };
  });

  // Outside: one pictogram panel per door. Inside of the left door: what each item is for.
  const front = [0, 1].map((i) => {
    const p = new Panel(0.42, 0.62, { pxPerMeter: 600 });
    const dir = doors[i].dir;
    p.mesh.position.set((dir * doorW) / 2, 0.18, 0.014);
    p.mesh.userData.interactive = true;
    p.mesh.userData.onSelect = toggle;
    doors[i].pivot.add(p.mesh);
    kit.registerInteractive(p.mesh);
    return p;
  });
  const insidePanel = new Panel(0.44, 0.9, { pxPerMeter: 640 });
  insidePanel.mesh.rotation.y = Math.PI;
  insidePanel.mesh.position.set(doorW / 2, 0.05, -0.014);
  doors[0].pivot.add(insidePanel.mesh);

  // Big sign above the cabinet, readable from the hub entrance.
  const sign = kit.addPanel(g, 1.1, 0.26, 0, H - station.y + 0.2, { pxPerMeter: 500 });
  sign.mesh.position.z = 0.03;
  sign.renderCustom('sign', (ctx, w, h) => {
    tile(ctx, 4, 4, w - 8, h - 8, '#2a1c10', DOOR_COLOR, Math.max(4, h * 0.05));
    crateIcon(ctx, w * 0.14, h / 2, h * 0.32);
    text(ctx, t('hub.spares.sign'), w * 0.58, h / 2, { size: h * 0.48, bold: true, color: '#ffcf8a', align: 'center', maxWidth: w * 0.7 });
  });

  const counts = () => {
    const s = sim();
    return {
      spares: Math.round(s.resources.get('spares').value),
      filters: s.inventory.filters ?? 0,
      sealant: s.inventory.sealantCharges ?? 0,
      o2: s.inventory.o2Tanks ?? 0,
    };
  };

  let blink = false;
  function drawFront() {
    const c = counts();
    const empty = c.spares <= 0;
    front[0].renderCustom(`L|${open}`, (ctx, w, h) => {
      tile(ctx, 6, 6, w - 12, h - 12, '#1d1712', '#ffcf8a', 5);
      crateIcon(ctx, w / 2, h * 0.32, w * 0.24);
      text(ctx, t('hub.spares.sign'), w / 2, h * 0.62, { size: h * 0.1, bold: true, align: 'center', color: '#ffcf8a', maxWidth: w * 0.86 });
      text(ctx, t('hub.spares.subtitle'), w / 2, h * 0.75, { size: h * 0.055, align: 'center', color: COLORS.dim, maxWidth: w * 0.86 });
    });
    front[1].renderCustom(`R|${open}|${c.spares}|${empty && blink}`, (ctx, w, h) => {
      tile(ctx, 6, 6, w - 12, h - 12, '#1d1712', empty ? COLORS.critical : '#ffcf8a', 5);
      text(ctx, String(c.spares), w / 2, h * 0.3, { size: h * 0.26, bold: true, align: 'center', color: empty ? (blink ? COLORS.critical : '#7a2a22') : COLORS.nominal });
      text(ctx, empty ? t('hub.spares.empty') : t('hub.spares.total'), w / 2, h * 0.5, { size: h * 0.065, bold: true, align: 'center', maxWidth: w * 0.86 });
      // «Tap» hint: a hand-like pointer dot + text.
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.68, h * 0.035, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.info;
      ctx.fill();
      text(ctx, t(open ? 'hub.spares.close' : 'hub.spares.open'), w / 2, h * 0.8, { size: h * 0.055, align: 'center', color: COLORS.info, maxWidth: w * 0.86 });
    });
  }

  function drawInside() {
    const c = counts();
    insidePanel.renderCustom(JSON.stringify(c), (ctx, w, h) => {
      frame(ctx, w, h, DOOR_COLOR);
      text(ctx, t('hub.spares.inside'), w / 2, h * 0.055, { size: h * 0.04, bold: true, align: 'center', color: COLORS.title, maxWidth: w * 0.9 });
      const rows = /** @type {const} */ ([
        ['spares', crateIcon],
        ['filters', filterIcon],
        ['sealant', cartridgeIcon],
        ['o2', tankIcon],
      ]);
      const rowH = h * 0.18;
      rows.forEach(([id, icon], i) => {
        const y = h * 0.1 + i * rowH;
        const n = c[id];
        roundRect(ctx, w * 0.04, y + 4, w * 0.92, rowH - 8, 10);
        ctx.fillStyle = '#1b2128';
        ctx.fill();
        icon(ctx, w * 0.15, y + rowH * 0.42, rowH * 0.24);
        text(ctx, `${t(`hub.spares.name.${id}`)}  ×${n}`, w * 0.29, y + rowH * 0.3, { size: rowH * 0.2, bold: true, color: n > 0 ? COLORS.text : COLORS.critical, maxWidth: w * 0.66 });
        wrapText(ctx, t(`hub.spares.use.${id}`), w * 0.29, y + rowH * 0.58, w * 0.65, rowH * 0.13, COLORS.dim);
      });
      const y = h * 0.1 + 4 * rowH + h * 0.02;
      roundRect(ctx, w * 0.04, y, w * 0.92, h * 0.15, 10);
      ctx.fillStyle = '#132430';
      ctx.fill();
      chipIcon(ctx, w * 0.15, y + h * 0.075, h * 0.035);
      wrapText(ctx, t('hub.spares.elec_hint'), w * 0.29, y + h * 0.05, w * 0.65, h * 0.028, COLORS.info);
    });
  }

  // ---- Animation: doors swing (ease-out), light fades in, stock pops in ----
  const maxAngle = THREE.MathUtils.degToRad(cfg.doorOpenDeg);
  kit.onFrame((dt) => {
    const target = open ? 1 : 0;
    if (progress === target) return;
    const step = dt / cfg.doorSeconds;
    progress = open ? Math.min(1, progress + step) : Math.max(0, progress - step);
    const eased = 1 - (1 - progress) ** 3;
    for (const d of doors) d.pivot.rotation.y = -d.dir * eased * maxAngle;
    lightMat.color.lerpColors(lightOff, lightOn, eased);
    const c = counts();
    const pop = 0.85 + 0.15 * Math.min(1, Math.max(0, (progress - 0.4) / 0.6));
    for (const st of stock) layout(st, c[/** @type {keyof typeof c} */ (st.id)], pop);
  });

  kit.onRefresh(() => {
    blink = !blink;
    const c = counts();
    for (const st of stock) {
      const n = Math.min(st.max, c[/** @type {keyof typeof c} */ (st.id)]);
      if (n !== st.shown) layout(st, n, progress > 0 ? 1 : 0.85);
    }
    drawFront();
    drawInside();
  });
}

/** Multi-line text, wrapped to `maxWidth`; `y` is the middle of the first row. */
function wrapText(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {string} */ str, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ maxWidth, /** @type {number} */ size, /** @type {string} */ color) {
  paragraph(ctx, str, x, y - size / 2, maxWidth, { size, color });
}

/** Spare-parts crate. */
function crateIcon(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ r) {
  ctx.fillStyle = '#9a7a44';
  ctx.fillRect(cx - r, cy - r * 0.8, r * 2, r * 1.6);
  ctx.strokeStyle = '#5c4626';
  ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.strokeRect(cx - r, cy - r * 0.8, r * 2, r * 1.6);
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r * 0.8); ctx.lineTo(cx + r, cy + r * 0.8);
  ctx.moveTo(cx + r, cy - r * 0.8); ctx.lineTo(cx - r, cy + r * 0.8);
  ctx.stroke();
}

/** CO₂ filter cartridge (white cylinder with blue bands). */
function filterIcon(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ r) {
  ctx.fillStyle = '#e8ecf0';
  ctx.fillRect(cx - r * 0.8, cy - r, r * 1.6, r * 2);
  ctx.fillStyle = '#2f6fb3';
  ctx.fillRect(cx - r * 0.8, cy - r * 0.7, r * 1.6, r * 0.3);
  ctx.fillRect(cx - r * 0.8, cy + r * 0.4, r * 1.6, r * 0.3);
}

/** Sealant cartridge (yellow tube with nozzle). */
function cartridgeIcon(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ r) {
  ctx.fillStyle = '#e0b030';
  ctx.fillRect(cx - r * 0.4, cy - r * 0.6, r * 0.8, r * 1.6);
  ctx.fillStyle = '#3a4048';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.25, cy - r * 0.6);
  ctx.lineTo(cx + r * 0.25, cy - r * 0.6);
  ctx.lineTo(cx, cy - r * 1.1);
  ctx.closePath();
  ctx.fill();
}

/** O₂ tank (green bottle with grey valve). */
function tankIcon(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ r) {
  roundRect(ctx, cx - r * 0.6, cy - r * 0.8, r * 1.2, r * 1.9, r * 0.5);
  ctx.fillStyle = '#3f9f5f';
  ctx.fill();
  ctx.fillStyle = '#d8dde2';
  ctx.fillRect(cx - r * 0.2, cy - r * 1.15, r * 0.4, r * 0.4);
  text(ctx, 'O₂', cx, cy + r * 0.2, { size: r * 0.7, bold: true, color: '#0b1a10', align: 'center' });
}

/** Diode-like chip for the electronics hint. */
function chipIcon(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ r) {
  ctx.strokeStyle = '#c9ccd0';
  ctx.lineWidth = Math.max(2, r * 0.15);
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.6, cy);
  ctx.lineTo(cx + r * 1.6, cy);
  ctx.stroke();
  roundRect(ctx, cx - r, cy - r * 0.45, r * 2, r * 0.9, r * 0.3);
  ctx.fillStyle = '#1b1b1b';
  ctx.fill();
  ctx.fillStyle = '#bfc3c8';
  ctx.fillRect(cx + r * 0.55, cy - r * 0.45, r * 0.25, r * 0.9);
}
