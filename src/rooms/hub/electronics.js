// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// «Banco de electrónica»: repair the Telecom receiver power supply (src/systems/Electronics.js).
// Board with D1–D4 + C1 on a silkscreened PCB, oscilloscope, grabbable multimeter (trigger = mode),
// parts bin and the hub soldering iron (tip on a joint for N s = melt/solder). Only emits intents:
// electronics:heat / electronics:remove / electronics:insert.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../../ui/StationKit.js';
import { Panel } from '../../ui/Panel.js';
import { METER_MODES, meterReading, isReversed, scopeTrace } from './electronicsRules.js';

const PART_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });
const BOARD_W = 0.46;
const BOARD_H = 0.3;
/** Slot and test-point positions on the board (board-local metres; +x = diode cathode / capacitor «+»). */
const SLOT_POS = { D1: [-0.16, 0.07], D2: [-0.06, 0.07], D3: [-0.16, -0.02], D4: [-0.06, -0.02], C1: [0.06, 0.025] };
const TP_POS = { TP1: [-0.19, -0.105], TP2: [0.05, -0.105], TP3: [0.17, -0.105] };
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();

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
const alongX = (/** @type {number} */ r, /** @type {number} */ len) => new THREE.CylinderGeometry(r, r, len, 10).rotateZ(Math.PI / 2);

/** Axial diode along x, cathode stripe at +x. @param {string} body @param {string} stripe */
function diodeGeometry(body, stripe) {
  return mergeGeometries([
    paint(alongX(0.0065, 0.03), body),
    paint(alongX(0.0068, 0.005).translate(0.011, 0, 0), stripe),
    paint(alongX(0.0012, 0.07), '#c9ccd0'),
  ]);
}

/** Radial electrolytic standing on the board (axis z), «−» stripe on the −x side. */
function capGeometry(/** @type {number} */ r, /** @type {number} */ h, /** @type {string} */ color, swollen = false) {
  const parts = [
    paint(new THREE.CylinderGeometry(r, r, h, 14).rotateX(Math.PI / 2).translate(0, 0, h / 2), color),
    paint(new THREE.BoxGeometry(0.003, r * 0.9, h * 0.96).translate(-r, 0, h / 2), '#e8ecf5'),
    paint(new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.002, 14).rotateX(Math.PI / 2).translate(0, 0, h + 0.001), '#a9b0ba'),
  ];
  if (swollen) parts.push(paint(new THREE.SphereGeometry(r * 0.8, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0, h), '#8a6a3a'));
  return mergeGeometries(parts);
}

/** @type {Record<string, () => THREE.BufferGeometry>} */
const GEOMETRY = {
  '1N4007': () => diodeGeometry('#1b1b1b', '#bfc3c8'),
  '1N4148': () => diodeGeometry('#d9822b', '#1b1b1b'), // small glass signal diode
  C470u25V: () => capGeometry(0.012, 0.03, '#2f4f9f'),
  C10u25V: () => capGeometry(0.006, 0.014, '#2f4f9f'),
  C1000u6V: () => capGeometry(0.014, 0.026, '#3f3f46'),
};
/** @type {Map<string, THREE.BufferGeometry>} */
const geoCache = new Map();
const partGeometry = (/** @type {string} */ id, swollen = false) => {
  const key = `${id}${swollen ? ':swollen' : ''}`;
  let g = geoCache.get(key);
  if (!g) {
    g = swollen ? capGeometry(0.012, 0.03, '#2f4f9f', true) : GEOMETRY[id]();
    geoCache.set(key, g);
  }
  return g;
};

/**
 * @param {THREE.Group} g station group (hub west wall)
 * @param {any} station
 * @param {import('../../ui/StationKit.js').StationKit} kit
 * @param {{ tools?: { id: string, mesh: THREE.Mesh, place: string }[] }} hubState shared with the tool wall
 */
export function buildElectronicsBench(g, station, kit, hubState) {
  const { t, game, sim } = kit;
  const cfg = game.data.balance.electronics;
  const benchTop = 0.82 - station.y;
  kit.addBox(g, 1.4, 0.82, 0.6, 0, 0.41 - station.y, 0.32, '#4a4f56');

  // ---- Board (PCB lying on the bench, tilted towards the player) ----
  const board = new THREE.Group();
  board.position.set(-0.2, benchTop + 0.015, 0.36);
  board.rotation.x = -Math.PI / 2 + 0.35;
  g.add(board);
  const pcb = new Panel(BOARD_W, BOARD_H, { pxPerMeter: 1800 });
  board.add(pcb.mesh);
  pcb.renderCustom('pcb', (ctx, W, H) => drawSilkscreen(ctx, W, H, t));

  /** @type {Record<string, { anchor: THREE.Group, mesh: THREE.Mesh, lastGeo: string }>} */
  const slots = {};
  for (const [id, [x, y]] of Object.entries(SLOT_POS)) {
    const anchor = new THREE.Group();
    anchor.position.set(x, y, 0.004);
    board.add(anchor);
    const mesh = new THREE.Mesh(partGeometry('1N4007'), PART_MATERIAL);
    anchor.add(mesh);
    kit.registerInteractive(mesh);
    mesh.userData.slotId = id;
    slots[id] = { anchor, mesh, lastGeo: '' };
  }
  /** @type {Record<string, THREE.Object3D>} */
  const testPoints = {};
  for (const [id, [x, y]] of Object.entries(TP_POS)) {
    const tp = new THREE.Object3D();
    tp.position.set(x, y, 0.004);
    board.add(tp);
    testPoints[id] = tp;
  }
  // Static regulator (TO-220) + transformer block, for context.
  kit.addBox(board, 0.03, 0.02, 0.012, 0.17, 0.04, 0.01, '#2a2a2a');
  kit.addBox(board, 0.07, 0.06, 0.05, -0.32, 0.02, 0.025, '#6b5a3a');

  /** Installed part grabbed after desoldering: dropped far from its slot ⇒ removed (scrap bin). */
  const makeInstalledGrab = (/** @type {string} */ slotId) => ({
    onGrab() {},
    onRelease(/** @type {THREE.Vector3} */ pos) {
      const s = slots[slotId];
      s.anchor.getWorldPosition(_a);
      if (pos.distanceTo(_a) > cfg.bench.snapRadiusMeters * 2) game.intent('electronics:remove', { slotId });
      s.anchor.add(s.mesh);
      s.mesh.position.set(0, 0, 0);
      s.mesh.rotation.set(0, 0, 0);
    },
  });

  // ---- Parts bin (tokens: grab one, drop it on an empty slot) ----
  const binX = 0.47;
  kit.addBox(g, 0.42, 0.03, 0.16, binX, benchTop + 0.015, 0.36, '#2b3138');
  const partIds = Object.keys(cfg.parts);
  const binLabel = kit.addPanel(g, 0.44, 0.11, binX, benchTop + 0.1);
  binLabel.mesh.position.z = 0.27;
  binLabel.mesh.rotation.x = -0.35;
  const tokens = partIds.map((partId, i) => {
    const home = new THREE.Group();
    home.position.set(binX - 0.16 + i * 0.08, benchTop + 0.035, 0.37);
    home.rotation.x = -Math.PI / 2; // lying like on the board
    g.add(home);
    const mesh = new THREE.Mesh(partGeometry(partId), PART_MATERIAL);
    home.add(mesh);
    kit.registerInteractive(mesh);
    const token = { partId, home, mesh };
    mesh.userData.grab = {
      onGrab() {},
      onRelease() {
        const el = sim().electronics;
        const def = cfg.parts[partId];
        // Nearest empty slot of the right kind within the snap radius.
        mesh.getWorldPosition(_a);
        let best = null;
        let bestD = cfg.bench.snapRadiusMeters;
        for (const s of el.slots) {
          if (s.partId || s.kind !== def.kind) continue;
          slots[s.id].anchor.getWorldPosition(_b);
          const d = _a.distanceTo(_b);
          if (d <= bestD) {
            best = s.id;
            bestD = d;
          }
        }
        if (best) {
          const partAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(mesh.getWorldQuaternion(_q));
          const slotAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(slots[best].anchor.getWorldQuaternion(_q));
          game.intent('electronics:insert', { slotId: best, partId, reversed: isReversed(partAxis, slotAxis) });
        }
        home.add(mesh);
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
      },
    };
    return token;
  });

  // ---- Multimeter (grip to grab, trigger cycles the mode, touch with the probe tip) ----
  const meterHome = new THREE.Group();
  meterHome.position.set(0.17, benchTop + 0.016, 0.38);
  g.add(meterHome);
  const meter = new THREE.Mesh(
    mergeGeometries([
      paint(new THREE.BoxGeometry(0.07, 0.025, 0.12).translate(0, 0, 0.02), '#e0b030'),
      paint(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 6).rotateX(Math.PI / 2).translate(0, 0, -0.085), '#2a2a2a'),
      paint(new THREE.CylinderGeometry(0.0035, 0.001, 0.02, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.14), '#d03a2f'),
    ]),
    PART_MATERIAL,
  );
  meterHome.add(meter);
  kit.registerInteractive(meter);
  const display = new Panel(0.06, 0.035, { pxPerMeter: 3000 });
  display.mesh.rotation.x = -Math.PI / 2;
  display.mesh.position.set(0, 0.0135, 0.04);
  meter.add(display.mesh);
  let meterHeld = false;
  let modeIndex = 0;
  meter.userData.grab = {
    onGrab: () => {
      meterHeld = true;
    },
    onRelease: () => {
      meterHeld = false;
      meterHome.add(meter);
      meter.position.set(0, 0, 0);
      meter.rotation.set(0, 0, 0);
    },
    onUse: (/** @type {boolean} */ active) => {
      if (active) modeIndex = (modeIndex + 1) % METER_MODES.length;
    },
  };

  // ---- Oscilloscope + instructions on the wall ----
  const scope = new Panel(0.62, 0.4, { pxPerMeter: 900 });
  scope.mesh.position.set(-0.2, benchTop + 0.6, 0.01);
  g.add(scope.mesh);
  const info = kit.addPanel(g, 0.6, 0.62, 0.45, benchTop + 0.66);

  // ---- Per-frame: probe + soldering iron ----
  const probeTip = new THREE.Vector3(0, 0, -0.15);
  const ironTip = new THREE.Vector3(0, 0, -0.165);
  /** @type {{ label: string, target: any } | null} */
  let probed = null;
  let heatSlot = /** @type {string | null} */ (null);
  let heatTime = 0;
  let heatLock = /** @type {string | null} */ (null);

  /** Nearest slot or test point to a world point. @param {THREE.Vector3} p @param {number} radius @param {boolean} withTps */
  const nearest = (p, radius, withTps) => {
    /** @type {{ id: string, isTp: boolean } | null} */
    let best = null;
    let bestD = radius;
    const consider = (/** @type {string} */ id, /** @type {THREE.Object3D} */ o, /** @type {boolean} */ isTp) => {
      o.getWorldPosition(_b);
      const d = p.distanceTo(_b);
      if (d <= bestD) {
        best = { id, isTp };
        bestD = d;
      }
    };
    for (const [id, s] of Object.entries(slots)) consider(id, s.anchor, false);
    if (withTps) for (const [id, o] of Object.entries(testPoints)) consider(id, o, true);
    return /** @type {{ id: string, isTp: boolean } | null} */ (best);
  };

  kit.onFrame((dt) => {
    // Multimeter probe.
    probed = null;
    if (meterHeld) {
      meter.localToWorld(_a.copy(probeTip));
      const hit = nearest(_a, cfg.bench.probeRadiusMeters, true);
      if (hit) {
        const el = sim().electronics;
        probed = { label: hit.id, target: hit.isTp ? { type: 'tp', id: hit.id } : { type: 'slot', slot: el.slot(hit.id) } };
      }
    }
    // Soldering iron: hold the hot tip on a joint for heatSeconds.
    const iron = hubState.tools?.find((x) => x.id === 'solder_iron' && x.place === 'hand');
    let touching = null;
    if (iron) {
      iron.mesh.localToWorld(_a.copy(ironTip));
      touching = nearest(_a, cfg.bench.probeRadiusMeters, false)?.id ?? null;
    }
    if (touching !== heatSlot) {
      heatSlot = touching;
      heatTime = 0;
    }
    if (!touching) heatLock = null;
    if (touching && touching !== heatLock) {
      heatTime += dt;
      if (heatTime >= cfg.bench.heatSeconds) {
        game.intent('electronics:heat', { slotId: touching });
        heatLock = touching; // lift the iron before heating the same joint again
        heatTime = 0;
      }
    }
  });

  // ---- 4 Hz refresh: parts, scope, panels ----
  let phase = 0;
  kit.onRefresh(() => {
    const el = sim().electronics;
    if (!el) return;
    const out = el.output;
    for (const s of el.slots) {
      const view = slots[s.id];
      view.mesh.visible = Boolean(s.partId);
      if (!s.partId) continue;
      const geoKey = `${s.partId}${s.health === 'dried' ? ':swollen' : ''}`;
      if (geoKey !== view.lastGeo) {
        view.mesh.geometry = partGeometry(s.partId, s.health === 'dried');
        view.lastGeo = geoKey;
      }
      if (view.mesh.parent === view.anchor) view.mesh.rotation.set(0, 0, s.reversed ? Math.PI : 0);
      // Only a desoldered part can be pulled out.
      if (s.soldered) delete view.mesh.userData.grab;
      else view.mesh.userData.grab ??= makeInstalledGrab(s.id);
    }
    for (const tk of tokens) tk.mesh.visible = (el.stock[tk.partId] ?? 0) > 0 || tk.mesh.parent !== tk.home;

    binLabel.renderLines(t('hub.elec.bin'), [
      { text: partIds.map((id) => `${t(cfg.parts[id].labelKey)} ${t('hub.elec.stock', { n: el.stock[id] ?? 0 })}`).join(' · '), size: 0.62 },
    ]);

    phase = (phase + 1) % 8;
    scope.renderCustom(`${out.quality}|${out.mode}|${out.rippleVpp.toFixed(2)}|${phase}`, (ctx, W, H) => drawScope(ctx, W, H, out, cfg.circuit, phase, t));

    const mode = METER_MODES[modeIndex];
    const reading = probed ? meterReading(mode, probed.target, { parts: cfg.parts, circuit: cfg.circuit, output: out }) : '';
    display.renderCustom(`${mode}|${reading}`, (ctx, W, H) => {
      ctx.fillStyle = '#9fb88a';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1a2a12';
      ctx.font = `bold ${Math.round(H * 0.5)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(reading || '----', W / 2, H * 0.58, W * 0.94);
      ctx.font = `${Math.round(H * 0.22)}px monospace`;
      ctx.fillText(mode === 'diode' ? '▷|' : mode === 'cap' ? 'µF' : 'V', W * 0.1, H * 0.18);
    });

    /** @type {{ text: string, color?: string, size?: number }[]} */
    const lines = [
      {
        text: t(`hub.elec.quality.${out.quality}`, { cap: out.signalCap ?? 100 }),
        color: out.quality === 'ok' ? COLORS.nominal : out.quality === 'off' ? COLORS.critical : COLORS.warning,
        size: 0.85,
      },
    ];
    if (meterHeld) {
      lines.push({ text: t('hub.elec.meter.title', { mode: t(`hub.elec.meter.mode.${mode}`) }), color: COLORS.info, size: 0.8 });
      lines.push({ text: probed ? t('hub.elec.meter.reading', { target: probed.label, value: reading }) : t('hub.elec.meter.idle'), size: 0.8 });
    } else {
      lines.push({ text: t('hub.elec.meter.home'), color: COLORS.dim, size: 0.72 });
    }
    if (heatSlot && heatSlot !== heatLock) {
      lines.push({ text: t('hub.elec.solder.progress', { slot: heatSlot, pct: Math.round((100 * heatTime) / cfg.bench.heatSeconds) }), color: COLORS.warning, size: 0.8 });
    }
    for (const s of el.slots) if (s.partId && !s.soldered) lines.push({ text: t('hub.elec.slot.loose', { slot: s.id }), color: COLORS.warning, size: 0.72 });
    lines.push({ text: t('hub.elec.steps'), size: 0.68 });
    lines.push({ text: t('hub.elec.fact.diode'), color: COLORS.dim, size: 0.64 });
    lines.push({ text: t('hub.elec.fact.cap'), color: COLORS.dim, size: 0.64 });
    lines.push({ text: t('hub.elec.desktop'), color: COLORS.dim, size: 0.6 });
    info.renderLines(t('hub.elec.title'), lines, { border: out.quality === 'ok' ? COLORS.border : COLORS.critical });
  });
}

/** Green PCB with white silkscreen: diode bodies with cathode bars, C1 polarity, test points. */
function drawSilkscreen(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {number} */ W, /** @type {number} */ H, /** @type {Function} */ t) {
  const px = (/** @type {number} */ x) => ((x + BOARD_W / 2) / BOARD_W) * W;
  const py = (/** @type {number} */ y) => ((BOARD_H / 2 - y) / BOARD_H) * H;
  const s = W / BOARD_W; // px per metre
  ctx.fillStyle = '#1f5f3a';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#c9a44a'; // copper traces
  ctx.lineWidth = s * 0.003;
  ctx.beginPath();
  ctx.moveTo(px(-0.19), py(0.07)); ctx.lineTo(px(-0.19), py(-0.02));
  ctx.moveTo(px(-0.03), py(0.07)); ctx.lineTo(px(-0.03), py(-0.02)); ctx.lineTo(px(0.06), py(-0.02)); ctx.lineTo(px(0.06), py(0.025));
  ctx.moveTo(px(0.08), py(0.025)); ctx.lineTo(px(0.17), py(0.04));
  ctx.stroke();
  ctx.strokeStyle = '#f2f2f2';
  ctx.fillStyle = '#f2f2f2';
  ctx.lineWidth = s * 0.0012;
  ctx.font = `bold ${Math.round(s * 0.011)}px sans-serif`;
  ctx.textAlign = 'center';
  for (const [id, [x, y]] of Object.entries(SLOT_POS)) {
    if (id === 'C1') {
      ctx.beginPath();
      ctx.arc(px(x), py(y), s * 0.015, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath(); // shaded «−» half on −x
      ctx.arc(px(x), py(y), s * 0.015, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.fill();
      ctx.fillText('+', px(x + 0.024), py(y) + s * 0.004);
      ctx.fillText('C1  470µF 25V', px(x), py(y - 0.03));
    } else {
      ctx.strokeRect(px(x - 0.017), py(y + 0.008), s * 0.034, s * 0.016);
      ctx.fillRect(px(x + 0.009), py(y + 0.008), s * 0.005, s * 0.016); // cathode bar
      ctx.fillText(id, px(x), py(y - 0.018));
    }
  }
  for (const [id, [x, y]] of Object.entries(TP_POS)) {
    ctx.beginPath();
    ctx.arc(px(x), py(y), s * 0.005, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(id, px(x), py(y + 0.012));
  }
  ctx.textAlign = 'left';
  ctx.fillText('~AC', px(-0.225), py(0.11));
  ctx.fillText('REG 5V', px(0.15), py(0.075));
  ctx.fillText(t('hub.comp.rx_psu').toUpperCase(), px(-0.225), py(-0.13));
}

/** Oscilloscope grid + input (yellow) and filtered output (blue) + regulated level (green dashed). */
function drawScope(
  /** @type {CanvasRenderingContext2D} */ ctx, /** @type {number} */ W, /** @type {number} */ H,
  /** @type {any} */ out, /** @type {any} */ circuit, /** @type {number} */ phase, /** @type {Function} */ t,
) {
  ctx.fillStyle = '#0b1410';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#1f3a2c';
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    ctx.beginPath(); ctx.moveTo((W * i) / 10, H * 0.14); ctx.lineTo((W * i) / 10, H * 0.86); ctx.stroke();
  }
  for (let i = 1; i < 8; i++) {
    const y = H * 0.14 + (H * 0.72 * i) / 8;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  const top = H * 0.16;
  const bottom = H * 0.84;
  const vmax = circuit.acPeakV;
  const yOf = (/** @type {number} */ v) => top + ((vmax - v) / (2 * vmax)) * (bottom - top);
  // Scroll one mains period every 8 refreshes (2 s), recomputed from steady state: no seam.
  const { input, output } = scopeTrace(out, circuit, 160, (phase / 8) * 2 * Math.PI);
  const n = input.length - 1;
  const plot = (/** @type {number[]} */ arr, /** @type {string} */ color, /** @type {number} */ width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const v = arr[i];
      const x = (i / n) * W;
      if (i === 0) ctx.moveTo(x, yOf(v));
      else ctx.lineTo(x, yOf(v));
    }
    ctx.stroke();
  };
  plot(input, '#e0c040', 2);
  plot(output, '#5fc8ff', 3);
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = '#7fe07f';
  ctx.beginPath();
  ctx.moveTo(0, yOf(out.vout));
  ctx.lineTo(W, yOf(out.vout));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COLORS.title;
  ctx.font = `bold ${Math.round(H * 0.07)}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(t('hub.elec.scope.title'), W * 0.02, H * 0.09);
  ctx.font = `${Math.round(H * 0.045)}px system-ui, sans-serif`;
  ctx.fillStyle = '#e0c040';
  ctx.fillText(t('hub.elec.scope.in'), W * 0.38, H * 0.06);
  ctx.fillStyle = '#5fc8ff';
  ctx.fillText(t('hub.elec.scope.out'), W * 0.38, H * 0.115);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(t('hub.elec.scope.values', { vpk: out.vdcPeak.toFixed(1), vpp: out.rippleVpp.toFixed(1), vout: out.vout.toFixed(1) }), W * 0.02, H * 0.95);
}
