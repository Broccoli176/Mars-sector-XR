import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roundedRectGeometry, roundedRingGeometry } from './roundedRect.js';
import { MARS, marsLook, skyFactor } from './marsLook.js';

/**
 * Window in the Energía room looking out at the base solar field (2 rows × 6 panels; visual only, the
 * simulated peak is balance.power.solarKw whatever the count).
 * Reacts to the simulation: panels shine by day (same hours as PowerGrid solar), go dark at night and get a
 * dust layer during storms. The panels turn east–west with the sun tracker (sim.solarTracker.angleDeg;
 * vertical-axis yaw, 0° faces the window). When LIMPIAR is pressed on the solar desk (`solar:cleaned` by
 * 'robot') the cleaning robot leaves its dock, hops onto each panel, brushes it end to end and returns; each
 * panel shows its own dust, so panels turn clean as the robot passes (presentation only: the simulation has
 * already applied the clean).
 * Budget: unlit materials with baked vertex colours (no extra lights), instanced panels, ≈ 12 draw calls.
 */

/**
 * Pure look of the field for a time of day and weather (tested).
 * @param {number} hour 0–24 @param {boolean} storm @param {{ solarStartHour: number, solarEndHour: number }} cfg
 * @param {number} [dustFactor] PowerGrid.dustFactor (1 = clean panels)
 * @returns {{ daylight: boolean, sky: [number, number, number], ground: number, panel: number, dust: number, soil: number }}
 */
export function fieldLook(hour, storm, cfg, dustFactor = 1) {
  const base = marsLook(hour, storm, cfg);
  // Settled dust dulls the cells (soil 0 = clean, 1 = fully covered); the ochre tint is applied in update().
  const soil = Math.min(1, Math.max(0, 1 - dustFactor));
  return { ...base, panel: base.panel * (1 - 0.6 * soil), soil };
}

const DUST_TINT = new THREE.Color(0xc06a34);
/** Half the travel of the cleaning robot across a panel (panel-local x, metres). */
const ROBOT_HALF_SPAN = 1.05;

/**
 * Total length of a cleaning run (real seconds): dock → panel 1 … panel n → dock.
 * @param {{ perPanelS: number, hopS: number, dockHopS: number }} cfg balance.cleanFx @param {number} panelCount
 */
export function cleanerDuration(cfg, panelCount) {
  return 2 * cfg.dockHopS + panelCount * cfg.perPanelS + Math.max(0, panelCount - 1) * cfg.hopS;
}

/**
 * Where the cleaning robot is, `elapsedS` real seconds after LIMPIAR (pure, tested).
 * - 'leave': hopping from the dock to panel 0 (k 0…1);
 * - 'brush': on `panel`, brushing from x = −1 to +1 across it;
 * - 'hop': jumping from panel `from` to panel `panel` (k 0…1);
 * - 'return': hopping from the last panel back to the dock (k 0…1);
 * - 'done': parked. `cleaned` = panels already finished.
 * @param {number} elapsedS @param {{ perPanelS: number, hopS: number, dockHopS: number }} cfg @param {number} panelCount
 * @returns {{ phase: 'leave' | 'brush' | 'hop' | 'return' | 'done', panel: number, from: number, x: number, k: number, cleaned: number }}
 */
export function cleanerPath(elapsedS, cfg, panelCount) {
  let t = Math.max(0, elapsedS);
  if (t < cfg.dockHopS) return { phase: 'leave', panel: 0, from: -1, x: -1, k: t / cfg.dockHopS, cleaned: 0 };
  t -= cfg.dockHopS;
  for (let i = 0; i < panelCount; i++) {
    if (t < cfg.perPanelS) return { phase: 'brush', panel: i, from: i, x: -1 + (2 * t) / cfg.perPanelS, k: t / cfg.perPanelS, cleaned: i };
    t -= cfg.perPanelS;
    if (i === panelCount - 1) break;
    if (t < cfg.hopS) return { phase: 'hop', panel: i + 1, from: i, x: -1, k: t / cfg.hopS, cleaned: i + 1 };
    t -= cfg.hopS;
  }
  if (t < cfg.dockHopS) return { phase: 'return', panel: -1, from: panelCount - 1, x: 1, k: t / cfg.dockHopS, cleaned: panelCount };
  return { phase: 'done', panel: -1, from: -1, x: 1, k: 1, cleaned: panelCount };
}

/**
 * Canvas texture, or null without a DOM (headless tests build the field too).
 * @param {number} w @param {number} h @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} draw
 */
function canvasTexture(w, h, draw) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Monocrystalline module face: 12 × 6 dark-blue cells with clipped corners, white backsheet gaps,
 * 3 silver busbars per cell, fine fingers and a soft anti-reflective sheen.
 */
function cellTexture() {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#dfe5ec'; // backsheet seen between cells
    ctx.fillRect(0, 0, w, h);
    const cols = 12;
    const rows = 6;
    const gap = 3;
    const cw = (w - gap * (cols + 1)) / cols;
    const ch = (h - gap * (rows + 1)) / rows;
    const cut = Math.min(cw, ch) * 0.16; // pseudo-square cells have clipped corners
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = gap + c * (cw + gap);
        const y = gap + r * (ch + gap);
        const g = ctx.createLinearGradient(x, y, x + cw, y + ch);
        g.addColorStop(0, '#24467f');
        g.addColorStop(0.55, '#16305e');
        g.addColorStop(1, '#0f2247');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x + cut, y);
        ctx.lineTo(x + cw - cut, y);
        ctx.lineTo(x + cw, y + cut);
        ctx.lineTo(x + cw, y + ch - cut);
        ctx.lineTo(x + cw - cut, y + ch);
        ctx.lineTo(x + cut, y + ch);
        ctx.lineTo(x, y + ch - cut);
        ctx.lineTo(x, y + cut);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(150, 185, 230, 0.18)'; // fingers
        for (let f = y + 3; f < y + ch - 2; f += 3) ctx.fillRect(x + 1, f, cw - 2, 1);
        ctx.fillStyle = '#b8c3cf'; // busbars
        for (let b = 1; b <= 3; b++) ctx.fillRect(x, y + (ch * b) / 4 - 1, cw, 2);
      }
    }
    const sheen = ctx.createLinearGradient(0, 0, w, h); // anti-reflective coating catching the sky
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
    sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    sheen.addColorStop(1, 'rgba(255, 220, 190, 0.06)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Soft round contact shadow (transparent centre-dark disc). */
function shadowTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(40, 18, 8, 0.55)');
    g.addColorStop(0.6, 'rgba(40, 18, 8, 0.28)');
    g.addColorStop(1, 'rgba(40, 18, 8, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

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

/** Status lamp of the cleaning robot (parsed once: the lamp is set every frame). */
const LAMP = { on: new THREE.Color('#ffbf3f'), off: new THREE.Color('#5a3a06'), parked: new THREE.Color('#4ade80') };

/**
 * @param {THREE.Scene} scene
 * @param {() => any} getSim current Simulation (replaced on restart)
 * @param {{ center: [number, number, number], width: number, height: number, radius?: number, outward: [number, number] }} win
 *   window centre (world), size, corner radius, and the outward horizontal direction [x, z]
 */
export function buildSolarField(scene, getSim, win) {
  const root = new THREE.Group();
  root.name = 'SolarField_System';
  root.position.set(...win.center);
  // Local −z looks outward.
  root.rotation.y = Math.atan2(-win.outward[0], -win.outward[1]);
  scene.add(root);
  const floorY = -win.center[1];

  // ---- Rounded frame + glass ----
  const hh = win.height / 2;
  const radius = win.radius ?? 0;
  // Rounded frame (ring a little wider than the opening) + a short sill on the straight bottom edge.
  const frame = new THREE.Mesh(
    mergeGeometries([
      roundedRingGeometry(
        { w: win.width + 0.1, h: win.height + 0.1, r: radius + 0.05 },
        { w: win.width - 0.06, h: win.height - 0.06, r: Math.max(0, radius - 0.03) },
        0.16,
      ),
      new THREE.BoxGeometry(Math.max(0.2, win.width - 2 * radius), 0.05, 0.12).translate(0, -hh - 0.02, 0.12),
    ]),
    new THREE.MeshLambertMaterial({ color: 0x42474e }),
  );
  root.add(frame);
  const glass = new THREE.Mesh(
    roundedRectGeometry(win.width - 0.06, win.height - 0.06, Math.max(0, radius - 0.03)),
    new THREE.MeshBasicMaterial({ color: 0x7eb8d0, transparent: true, opacity: 0.12, depthWrite: false }),
  );
  glass.position.z = 0.01;
  root.add(glass);

  const outside = new THREE.Group();
  outside.position.y = floorY;
  root.add(outside);

  // ---- Ground with gentle dunes (baked shading) ----
  const groundGeo = new THREE.PlaneGeometry(70, 46, 35, 23).rotateX(-Math.PI / 2).translate(0, 0, -24);
  const gp = groundGeo.attributes.position;
  const gc = new Float32Array(gp.count * 3);
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const far = Math.min(1, Math.max(0, (-z - 16) / 20));
    const y = -0.15 + far * (0.6 * Math.sin(x * 0.18) + 0.4 * Math.cos(z * 0.23 + x * 0.05)) + 0.08 * Math.sin(x * 1.3 + z * 0.9);
    gp.setY(i, y);
    const shade = 0.82 + 0.18 * Math.sin(x * 0.18 + 0.6) * far + 0.06 * Math.sin(x * 1.3 + z * 0.9);
    gc.set([MARS.ground[0] * shade, MARS.ground[1] * shade, MARS.ground[2] * shade], i * 3);
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  groundGeo.computeVertexNormals();
  const groundMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  outside.add(new THREE.Mesh(groundGeo, groundMat));

  // ---- Sky backdrop (gradient) + sun + stars ----
  const skyGeo = new THREE.PlaneGeometry(120, 40, 1, 8).translate(0, 14, -46);
  const sp = skyGeo.attributes.position;
  const sc = new Float32Array(sp.count * 3);
  for (let i = 0; i < sp.count; i++) {
    const k = Math.min(1, Math.max(0, (sp.getY(i) + 6) / 40));
    sc.set(skyFactor(k), i * 3);
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  outside.add(new THREE.Mesh(skyGeo, skyMat));
  const sun = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), new THREE.MeshBasicMaterial({ color: 0xfff4dc, toneMapped: false }));
  sun.position.set(0, 8, -45.5);
  outside.add(sun);
  const starPos = new Float32Array(120 * 3);
  for (let i = 0; i < 120; i++) starPos.set([(Math.random() - 0.5) * 110, 3 + Math.random() * 30, -45.8], i * 3);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12 }));
  outside.add(stars);

  // ---- Solar panels: 2 rows × 6, tilted towards the sun (one instanced draw call) ----
  const panelGeo = mergeGeometries([
    paint(new THREE.BoxGeometry(2.36, 0.03, 1.26), '#3b4047'), // backsheet / laminate body
    paint(new THREE.BoxGeometry(2.4, 0.045, 0.035).translate(0, 0.008, 0.63), '#c3cad2'), // aluminium frame (4 sides)
    paint(new THREE.BoxGeometry(2.4, 0.045, 0.035).translate(0, 0.008, -0.63), '#c3cad2'),
    paint(new THREE.BoxGeometry(0.035, 0.045, 1.26).translate(1.18, 0.008, 0), '#b4bcc5'),
    paint(new THREE.BoxGeometry(0.035, 0.045, 1.26).translate(-1.18, 0.008, 0), '#b4bcc5'),
    paint(new THREE.BoxGeometry(0.22, 0.04, 0.14).translate(0.6, -0.035, 0.2), '#22262b'), // junction box (back)
    paint(new THREE.BoxGeometry(2.0, 0.05, 0.06).translate(0, -0.05, 0.32), '#8a929b'), // mounting rails (back)
    paint(new THREE.BoxGeometry(2.0, 0.05, 0.06).translate(0, -0.05, -0.32), '#8a929b'),
    paint(new THREE.BoxGeometry(0.1, 0.07, 0.75).translate(0, -0.08, 0), '#6b737c'), // torque bracket
  ]);
  // Tracker post: base plate, galvanised post and the slewing drive that turns the panel (static).
  const legGeo = mergeGeometries([
    paint(new THREE.BoxGeometry(0.36, 0.04, 0.36).translate(0, 0.02, 0), '#7d858e'),
    paint(new THREE.CylinderGeometry(0.055, 0.065, 0.8, 10).translate(0, 0.42, 0), '#a7afb8'),
    paint(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 14).translate(0, 0.84, 0), '#4a5058'), // slewing drive (below the tilted panel)
    paint(new THREE.BoxGeometry(0.06, 0.07, 0.1).translate(0.1, 0.84, 0), '#2b2f35'),
  ]);
  // Cell face: textured plane on top of each panel (one more instanced draw call).
  const cellMap = cellTexture();
  const cellMat = new THREE.MeshBasicMaterial({ map: cellMap, color: cellMap ? 0xffffff : 0x1d3a78 });
  const cellGeo = new THREE.PlaneGeometry(2.33, 1.19).rotateX(-Math.PI / 2).translate(0, 0.0165, 0);
  const panelMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const legMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const COLS = 6;
  const ROWS = 2;
  const PANELS = COLS * ROWS;
  /** Row depth (z) and x offset: the back row sits between the front panels so it shows through the gaps. */
  const ROW_Z = [-10, -13.5];
  const ROW_X_OFFSET = [0, 1.5];
  const panels = new THREE.InstancedMesh(panelGeo, panelMat, PANELS);
  panels.name = 'SolarPanels';
  const legs = new THREE.InstancedMesh(legGeo, legMat, PANELS);
  legs.name = 'SolarPanelSupports';
  const cells = new THREE.InstancedMesh(cellGeo, cellMat, PANELS);
  cells.name = 'SolarPanelCells';
  // Contact shadows on the ground (static ellipses under each panel): ground the field visually.
  const shadowMap = shadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowMap, color: shadowMap ? 0xffffff : 0x3a1a0a, transparent: true, opacity: shadowMap ? 1 : 0.25, depthWrite: false });
  const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 1.6).rotateX(-Math.PI / 2), shadowMat, PANELS);
  shadows.name = 'SolarPanelShadows';
  const tmp = new THREE.Object3D();
  /** @type {[number, number][]} panel positions (x, z) */
  const slots = [];
  let i = 0;
  for (let k = 0; k < PANELS; k++) {
    const row = Math.floor(k / COLS);
    const x = -7.5 + (k % COLS) * 3 + ROW_X_OFFSET[row];
    const z = ROW_Z[row];
    slots.push([x, z]);
    tmp.position.set(x, 0.95, z);
    tmp.rotation.set(0, 0, 0); // tilted towards the window by the tracker in update()
    tmp.scale.setScalar(1);
    tmp.updateMatrix();
    panels.setMatrixAt(i, tmp.matrix);
    tmp.position.set(x, 0, z);
    tmp.rotation.set(0, 0, 0);
    tmp.scale.set(1, 1, 1);
    tmp.updateMatrix();
    legs.setMatrixAt(i, tmp.matrix);
    tmp.position.set(x, -0.1, z + 0.35); // the sun is behind the field (east window): shadow falls towards it
    tmp.updateMatrix();
    shadows.setMatrixAt(i, tmp.matrix);
    i++;
  }
  outside.add(shadows, panels, cells, legs);

  // Dust layer over the panels: settled dust (and storm dust) as an orange coating, one instance per panel,
  // so the cleaning robot can wipe each panel as it passes.
  const dustLayer = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.32, 0.004, 1.2).translate(0, 0.022, 0),
    new THREE.MeshBasicMaterial({ color: 0xc2703a, transparent: true, opacity: 0, depthWrite: false }),
    PANELS,
  );
  dustLayer.name = 'SolarPanelDust';
  for (let j = 0; j < PANELS; j++) {
    panels.getMatrixAt(j, tmp.matrix);
    dustLayer.setMatrixAt(j, tmp.matrix);
  }
  outside.add(dustLayer);


  // ---- Cleaning robot (LIMPIAR): a small tracked crawler with a rotary brush, parked on its dock ----
  const robot = new THREE.Group();
  robot.name = 'SolarCleanerRover';
  const robotBodyMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const robotBody = new THREE.Mesh(
    mergeGeometries([
      paint(new THREE.BoxGeometry(0.34, 0.12, 1.2).translate(0, 0.08, 0), '#e2b324'), // chassis spanning the panel depth
      paint(new THREE.BoxGeometry(0.4, 0.06, 0.1).translate(0, 0.04, 0.6), '#2b2f35'), // track (front)
      paint(new THREE.BoxGeometry(0.4, 0.06, 0.1).translate(0, 0.04, -0.6), '#2b2f35'), // track (back)
      paint(new THREE.BoxGeometry(0.22, 0.04, 0.5).translate(-0.02, 0.16, 0), '#1d3a78'), // its own little solar panel
    ]),
    robotBodyMat,
  );
  const brush = new THREE.Mesh(
    paint(new THREE.CylinderGeometry(0.06, 0.06, 1.18, 10).rotateX(Math.PI / 2), '#3d8fd1'),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
  );
  brush.position.set(0.22, 0.07, 0);
  const lampMat = new THREE.MeshBasicMaterial({ color: '#4ade80', toneMapped: false });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), lampMat);
  lamp.position.set(-0.12, 0.17, 0.45);
  robot.add(robotBody, brush, lamp);
  outside.add(robot);
  // Dock: charging stand at the near corner of the field, where the robot waits.
  const DOCK = new THREE.Vector3(-2.2, 0, -5.4);
  const dock = new THREE.Mesh(
    mergeGeometries([
      paint(new THREE.BoxGeometry(0.7, 0.35, 1.4).translate(0, 0.175, 0), '#4b5560'),
      paint(new THREE.BoxGeometry(0.12, 0.7, 0.12).translate(-0.3, 0.35, -0.6), '#6b737c'),
    ]),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
  );
  dock.name = 'SolarCleanerDock';
  dock.position.copy(DOCK);
  outside.add(dock);
  const parkedAt = new THREE.Vector3(DOCK.x, 0.35, DOCK.z);

  // ---- Inverter box + cable trench to the base ----
  const props = new THREE.Mesh(
    mergeGeometries([
      paint(new THREE.BoxGeometry(1.2, 1.0, 0.8).translate(-4.5, 0.5, -3.2), '#c9cfd6'),
      paint(new THREE.BoxGeometry(0.15, 0.06, 2.8).translate(-4.5, 0.03, -1.6), '#2a2d31'),
    ]),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
  );
  outside.add(props);

  // ---- Dust in the wind (storms) ----
  const DUST = 160;
  const dustPos = new Float32Array(DUST * 3);
  for (let j = 0; j < DUST; j++) dustPos.set([(Math.random() - 0.5) * 30, Math.random() * 6, -1 - Math.random() * 20], j * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xcf8f66, size: 0.07, transparent: true, opacity: 0.7 }));
  outside.add(dust);

  // Nothing outside should be culled oddly by the window frustum.
  outside.traverse((o) => {
    o.frustumCulled = false;
  });

  const fx = getSim().balance.cleanFx ?? { perPanelS: 0.7, hopS: 0.3, dockHopS: 0.6, fadeSoilPerS: 0.6 };
  const cleanSeconds = cleanerDuration(fx, PANELS);
  /** Real seconds since LIMPIAR; Infinity = robot parked. */
  let cleanElapsed = Infinity;
  /** Dust shown on not-yet-brushed panels during a run (what the panels had before the clean). */
  let soilBefore = 0;
  /** Dust shown on the panels; follows the simulated dust at a limited rate so a clean fades it out. */
  let shownSoil = NaN;
  let wiredBus = null;
  const onCleaned = (/** @type {any} */ e) => {
    if (e?.by !== 'robot') return;
    soilBefore = Number.isNaN(shownSoil) ? 0 : shownSoil;
    cleanElapsed = 0;
  };
  const bindSimulationBus = () => {
    const bus = getSim().bus;
    if (!bus || bus === wiredBus) return;
    wiredBus?.off('solar:cleaned', onCleaned);
    wiredBus = bus;
    wiredBus.on('solar:cleaned', onCleaned);
    cleanElapsed = Infinity;
  };
  const panelMatrix = new THREE.Matrix4();
  const offset = new THREE.Matrix4();
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _qa = new THREE.Quaternion();
  const _qb = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  let robotClock = 0;
  /** Robot pose on panel `j` at x (−1…1), into _a/_qa. @param {number} j @param {number} x */
  const onPanel = (j, x, /** @type {THREE.Vector3} */ pos, /** @type {THREE.Quaternion} */ quat) => {
    panels.getMatrixAt(j, panelMatrix);
    offset.makeTranslation(x * ROBOT_HALF_SPAN, 0.05, 0);
    panelMatrix.multiply(offset).decompose(pos, quat, _s);
  };
  /** Places the robot for the current point of its run. @param {ReturnType<typeof cleanerPath>} at */
  const placeRobot = (at) => {
    if (at.phase === 'done') {
      robot.position.copy(parkedAt);
      robot.quaternion.identity();
      return;
    }
    if (at.phase === 'brush') {
      onPanel(at.panel, at.x, _a, _qa);
      robot.position.copy(_a);
      robot.quaternion.copy(_qa);
      return;
    }
    // Hops: an arc between two poses (dock or panel ends).
    if (at.phase === 'leave') {
      _a.copy(parkedAt);
      _qa.identity();
    } else onPanel(at.from, 1, _a, _qa);
    if (at.phase === 'return') {
      _b.copy(parkedAt);
      _qb.identity();
    } else onPanel(at.panel, -1, _b, _qb);
    const k = at.k * at.k * (3 - 2 * at.k); // smoothstep
    robot.position.lerpVectors(_a, _b, k);
    robot.position.y += Math.sin(Math.PI * at.k) * (at.phase === 'hop' ? 0.5 : 0.9);
    robot.quaternion.slerpQuaternions(_qa, _qb, k);
  };
  /** Dust coating of panel j: full (1), wiped from the left up to `wiped` (0…1), or gone (0). @param {number} j @param {number} left */
  const setCoating = (j, left) => {
    panels.getMatrixAt(j, panelMatrix);
    if (left <= 0.001) offset.makeScale(0, 0, 0);
    else offset.makeTranslation((1 - left) * 1.16, 0, 0).multiply(_scaleX.makeScale(left, 1, 1));
    dustLayer.setMatrixAt(j, panelMatrix.multiply(offset));
  };
  const _scaleX = new THREE.Matrix4();
  placeRobot(cleanerPath(Infinity, fx, PANELS));

  const tint = new THREE.Color();
  let shownAngle = NaN;
  /** Speed at which panels smoothly rotate mechanically (degrees per real second). */
  const SLEW_SPEED_DEG_PER_SEC = 38;
  /** Rotate every panel (and its dust layer) around its vertical axis. @param {number} deg */
  const rotatePanels = (deg) => {
    const yawDeg = THREE.MathUtils.clamp(deg, -90, 90);
    const yawRad = THREE.MathUtils.degToRad(yawDeg);
    const tiltRad = THREE.MathUtils.degToRad(60);
    slots.forEach(([x, z], j) => {
      tmp.position.set(x, 1.07, z);
      tmp.rotation.set(tiltRad, yawRad, 0, 'YXZ');
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      panels.setMatrixAt(j, tmp.matrix);
      cells.setMatrixAt(j, tmp.matrix);
    });
    panels.instanceMatrix.needsUpdate = true;
    cells.instanceMatrix.needsUpdate = true;
  };
  return {
    root,
    /** True while the cleaning robot is out on the field. */
    get isCleaning() {
      return cleanElapsed < cleanSeconds;
    },
    /** @param {number} dt real seconds */
    update(dt) {
      bindSimulationBus();
      const sim = getSim();
      const look = fieldLook(sim.time.clock().hourFloat, Boolean(sim.power.stormActive), sim.power.cfg, sim.power.dustFactor ?? 1);
      skyMat.color.setRGB(...look.sky);
      groundMat.color.setScalar(look.ground);
      tint.setScalar(look.panel);
      if (look.daylight && !look.dust) tint.setRGB(look.panel, look.panel, Math.min(1.25, look.panel * 1.2)); // blue glint
      // Shown dust rises instantly with the simulation and drops gradually (the robot run sets it per panel).
      if (Number.isNaN(shownSoil) || look.soil > shownSoil) shownSoil = look.soil;
      else shownSoil = Math.max(look.soil, shownSoil - fx.fadeSoilPerS * dt);
      cellMat.color.copy(tint);
      panelMat.color.setScalar(Math.max(0.25, look.ground));
      shadowMat.opacity = shadowMap ? (look.daylight && !look.dust ? 1 : 0.35) : 0.25;
      legMat.color.setScalar(look.ground);
      /** @type {THREE.MeshBasicMaterial} */ (props.material).color.setScalar(look.ground);

      // Panels smoothly animate toward the tracker angle.
      const tracker = sim.solarTracker;
      const isStopped = sim.phase === 'training' || sim.time.speed === 0;
      const targetDeg = tracker ? (isStopped ? tracker.targetDeg : tracker.targetDeg) : 0;
      if (Number.isNaN(shownAngle)) {
        shownAngle = targetDeg;
        rotatePanels(shownAngle);
      } else {
        const diff = targetDeg - shownAngle;
        if (Math.abs(diff) > 0.05) {
          const step = Math.sign(diff) * Math.min(Math.abs(diff), SLEW_SPEED_DEG_PER_SEC * dt);
          shownAngle += step;
          rotatePanels(shownAngle);
          if (isStopped && tracker) {
            tracker.angleDeg = shownAngle;
          }
        } else if (shownAngle !== targetDeg) {
          shownAngle = targetDeg;
          rotatePanels(shownAngle);
          if (isStopped && tracker) {
            tracker.angleDeg = shownAngle;
          }
        }
      }
      // Cleaning robot run: panels it has brushed show the new (lower) dust, the others the old one.
      robotClock += dt;
      if (cleanElapsed < cleanSeconds) cleanElapsed += dt;
      const working = cleanElapsed < cleanSeconds;
      const at = cleanerPath(working ? cleanElapsed : Infinity, fx, PANELS);
      placeRobot(at);
      brush.rotation.z = working && at.phase === 'brush' ? robotClock * 18 : brush.rotation.z;
      lampMat.color.copy(working ? (Math.sin(robotClock * 10) > 0 ? LAMP.on : LAMP.off) : LAMP.parked);
      // Dust coating: during a run, panels ahead of the robot keep the old dust and the one being brushed
      // is wiped behind the brush; outside a run, every panel shows the simulated dust.
      const soil = working ? soilBefore : shownSoil;
      const dustMat = /** @type {THREE.MeshBasicMaterial} */ (dustLayer.material);
      dustMat.opacity = Math.max(0.55 * look.dust, Math.min(0.8, soil * 1.8)) * (look.daylight ? 1 : 0.5);
      dustMat.color.copy(DUST_TINT).multiplyScalar(Math.max(0.3, look.ground));
      for (let j = 0; j < PANELS; j++) {
        if (!working) setCoating(j, 1);
        else if (j < at.cleaned) setCoating(j, 0);
        else if (j === at.panel && at.phase === 'brush') setCoating(j, 1 - at.k);
        else setCoating(j, 1);
      }
      dustLayer.instanceMatrix.needsUpdate = true;
      if (working) shownSoil = look.soil; // after the run every panel shows the simulated dust
      // The window faces east: the morning sun climbs in view, after noon it is behind the base.
      const hour = sim.time.clock().hourFloat;
      const elevation = 90 - Math.abs((hour - 12) * 15);
      sun.position.y = 0.5 + Math.max(0, elevation) * 0.2;
      sun.visible = look.daylight && !look.dust && hour < 12.5;
      stars.visible = !look.daylight && !look.dust;
      dust.visible = look.dust > 0;
      if (dust.visible) {
        for (let j = 0; j < DUST; j++) {
          let x = dustPos[j * 3] + dt * (4 + (j % 5));
          if (x > 15) x = -15;
          dustPos[j * 3] = x;
        }
        dustGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
