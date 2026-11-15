// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// «Banco de electrónica»: repair the Telecom receiver power supply (src/systems/Electronics.js) as a short
// guided minigame, all with ray + trigger (desktop: click):
//   1) ESCANEAR → broken parts blink red · 2) tap the red part → it is desoldered and pulled out ·
//   3) tap the spare card whose shape fits the green outline → it flies in and is soldered → ✔.
// Only emits the existing intents: electronics:heat / electronics:remove / electronics:insert.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, BUTTON } from '../../ui/StationKit.js';
import { Panel } from '../../ui/Panel.js';
import { font } from '../../ui/theme.js';
import { addInfo } from '../../ui/InfoSheet.js';
import { frame, text, badge, tile, roundRect } from '../../ui/pictograms.js';
import { benchStep, isBroken, scopeTrace } from './electronicsRules.js';

const PART_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });
const BOARD_W = 0.46;
const BOARD_H = 0.3;
const BOARD_TILT = -Math.PI / 2 + 0.35; // lying on the bench, tilted towards the player
/** Slot positions on the board (board-local metres; +x = diode cathode / capacitor «+»). */
const SLOT_POS = { D1: [-0.16, 0.07], D2: [-0.06, 0.07], D3: [-0.16, -0.02], D4: [-0.06, -0.02], C1: [0.06, 0.025] };
const STEP_NUMBER = { scan: 1, remove: 2, insert: 3, solder: 3, ok: 0 };
const MESSAGE_SECONDS = 2.5;
const SHAKE_SECONDS = 0.45;
const _a = new THREE.Vector3();

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
 * @typedef {{ kind: 'scan', t: number }
 *   | { kind: 'remove', t: number, slotId: string }
 *   | { kind: 'insert', t: number, slotId: string, partId: string, from: THREE.Vector3 }} Anim
 */

/**
 * @param {THREE.Group} g station group (hub west wall)
 * @param {any} station
 * @param {import('../../ui/StationKit.js').StationKit} kit
 */
export function buildElectronicsBench(g, station, kit) {
  const { t, game, sim } = kit;
  const cfg = game.data.balance.electronics;
  const bench = cfg.bench;
  /** @type {Record<string, string>} */
  const defaults = Object.fromEntries(cfg.slots.map((/** @type {any} */ s) => [s.id, s.partId]));
  const benchTop = 0.82 - station.y;
  kit.addBox(g, 1.4, 0.82, 0.6, 0, 0.41 - station.y, 0.32, '#4a4f56');

  // ---- Presentation-only minigame state ----
  let scanned = false;
  /** @type {any} */
  let lastEl = null;
  /** @type {Anim | null} */
  let anim = null;
  let message = '';
  let messageTime = 0;
  let pulse = false;
  /** @type {{ partId: string, t: number } | null} */
  let shake = null;
  const say = (/** @type {string} */ key, /** @type {any} */ params = {}) => {
    message = t(key, params);
    messageTime = MESSAGE_SECONDS;
    refreshAll();
  };
  const current = () => benchStep(sim().electronics.slots, defaults, scanned);

  // ---- Board (PCB lying on the bench) ----
  const board = new THREE.Group();
  board.position.set(-0.2, benchTop + 0.015, 0.36);
  board.rotation.x = BOARD_TILT;
  g.add(board);
  const pcb = new Panel(BOARD_W, BOARD_H, { pxPerMeter: 1800 });
  board.add(pcb.mesh);
  // Static regulator (TO-220) + transformer block, for context.
  kit.addBox(board, 0.03, 0.02, 0.012, 0.17, 0.04, 0.01, '#2a2a2a');
  kit.addBox(board, 0.07, 0.06, 0.05, -0.32, 0.02, 0.025, '#6b5a3a');

  /** @type {Record<string, { anchor: THREE.Group, mesh: THREE.Mesh, lastGeo: string }>} */
  const slots = {};
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  for (const [id, [x, y]] of Object.entries(SLOT_POS)) {
    const anchor = new THREE.Group();
    anchor.position.set(x, y, 0.004);
    board.add(anchor);
    const mesh = new THREE.Mesh(partGeometry(defaults[id]), PART_MATERIAL);
    anchor.add(mesh);
    // Generous invisible target so a small part is easy to hit with the ray (raycasting ignores visibility).
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.05), hitMaterial);
    hit.position.z = 0.02;
    hit.userData.interactive = true;
    hit.userData.onSelect = () => onSlot(id);
    anchor.add(hit);
    kit.registerInteractive(hit);
    slots[id] = { anchor, mesh, lastGeo: '' };
  }

  // Part flying from a card to its slot (child of the board, so it lies like the board parts).
  const flyer = new THREE.Mesh(partGeometry(defaults.C1), PART_MATERIAL);
  flyer.visible = false;
  board.add(flyer);

  // ---- Spare cards (tap the one that fits the green outline) ----
  const cardRow = new THREE.Group();
  cardRow.position.set(0.47, benchTop + 0.02, 0.36);
  cardRow.rotation.x = BOARD_TILT;
  g.add(cardRow);
  const cards = bench.cards.map((/** @type {string} */ partId, /** @type {number} */ i) => {
    const panel = new Panel(0.17, 0.15, { pxPerMeter: 1400 });
    const x = (i - (bench.cards.length - 1) / 2) * 0.2;
    panel.mesh.position.set(x, 0, 0);
    panel.mesh.userData.interactive = true;
    panel.mesh.userData.onSelect = () => onCard(partId, panel.mesh);
    cardRow.add(panel.mesh);
    kit.registerInteractive(panel.mesh);
    return { partId, panel, x };
  });

  // ---- Wall: oscilloscope, SCAN button, step card, Info ----
  const scope = new Panel(0.62, 0.4, { pxPerMeter: 900 });
  scope.mesh.position.set(-0.2, benchTop + 0.62, 0.01);
  g.add(scope.mesh);
  const scanButton = kit.addButton(g, { width: 0.34, height: 0.12, label: t('hub.elec.btn.scan'), color: BUTTON.action, onSelect: () => onScan() }, -0.2, benchTop + 0.28);
  const stepPanel = kit.addPanel(g, 0.6, 0.42, 0.45, benchTop + 0.72, { pxPerMeter: 900 });
  addInfo(g, kit, {
    bx: 0.45, by: benchTop + 0.42, px: 0.45, py: benchTop + 0.66, w: 0.6, h: 0.62,
    title: () => t('hub.elec.title'),
    lines: () => {
      const out = sim().electronics.output;
      return [
        { text: t(`hub.elec.quality.${out.quality}`, { cap: out.signalCap ?? 100 }), color: out.quality === 'ok' ? COLORS.nominal : COLORS.warning, size: 0.8 },
        { text: t('hub.elec.scope.values', { vpk: out.vdcPeak.toFixed(1), vpp: out.rippleVpp.toFixed(1), vout: out.vout.toFixed(1) }), size: 0.7 },
        { text: t('hub.elec.info.circuit'), size: 0.66 },
        { text: t('hub.elec.info.real'), size: 0.66 },
        { text: t('hub.elec.fact.diode'), color: COLORS.dim, size: 0.62 },
        { text: t('hub.elec.fact.cap'), color: COLORS.dim, size: 0.62 },
      ];
    },
  });

  // ---- Player actions ----
  function onScan() {
    if (anim) return;
    if (current().step === 'ok') {
      say('hub.elec.msg.all_good');
      return;
    }
    anim = { kind: 'scan', t: 0 };
  }

  /** @param {string} slotId */
  function onSlot(slotId) {
    if (anim) return;
    const step = current();
    const s = sim().electronics.slot(slotId);
    if (step.step === 'ok') return say('hub.elec.msg.all_good');
    if (step.step === 'scan') return say('hub.elec.msg.scan_first');
    if (step.step === 'solder' && step.slotId === slotId) {
      game.intent('electronics:heat', { slotId });
      return;
    }
    if (s?.partId && isBroken(s, defaults[slotId])) {
      anim = { kind: 'remove', t: 0, slotId };
      return;
    }
    if (step.step === 'insert') return say('hub.elec.msg.use_card');
    say('hub.elec.msg.part_ok');
  }

  /** @param {string} partId @param {THREE.Object3D} cardMesh */
  function onCard(partId, cardMesh) {
    if (anim) return;
    const step = current();
    if (step.step === 'ok') return say('hub.elec.msg.all_good');
    if (step.step === 'scan') return say('hub.elec.msg.scan_first');
    if (step.step === 'remove' || step.step === 'solder') return say('hub.elec.msg.remove_first');
    const el = sim().electronics;
    const slot = el.slot(/** @type {string} */ (step.slotId));
    if (!slot || cfg.parts[partId].kind !== slot.kind) {
      shake = { partId, t: 0 };
      return say('hub.elec.msg.wrong');
    }
    if ((el.stock[partId] ?? 0) <= 0) return say('hub.elec.msg.no_stock');
    board.worldToLocal(cardMesh.getWorldPosition(_a));
    anim = { kind: 'insert', t: 0, slotId: slot.id, partId, from: _a.clone().setZ(0.03) };
    flyer.geometry = partGeometry(partId);
    flyer.position.copy(anim.from);
    flyer.visible = true;
  }

  // ---- Per-frame animations ----
  kit.onFrame((dt) => {
    if (messageTime > 0) {
      messageTime -= dt;
      if (messageTime <= 0) {
        message = '';
        refreshAll();
      }
    }
    if (shake) {
      shake.t += dt;
      const card = cards.find((c) => c.partId === shake?.partId);
      const done = shake.t >= SHAKE_SECONDS;
      if (card) card.panel.mesh.position.x = card.x + (done ? 0 : Math.sin(shake.t * 60) * 0.008 * (1 - shake.t / SHAKE_SECONDS));
      if (done) shake = null;
      drawCards();
    }
    if (!anim) return;
    anim.t += dt;
    if (anim.kind === 'scan') {
      if (anim.t >= bench.scanSeconds) {
        anim = null;
        scanned = true;
        refreshAll();
      } else drawBoard();
    } else if (anim.kind === 'remove') {
      const p = Math.min(1, anim.t / bench.heatSeconds);
      const view = slots[anim.slotId];
      view.mesh.position.z = p * p * 0.04; // the part lifts as the solder melts
      if (p >= 1) {
        const { slotId } = anim;
        anim = null;
        view.mesh.position.z = 0;
        if (sim().electronics.slot(slotId)?.soldered) game.intent('electronics:heat', { slotId });
        game.intent('electronics:remove', { slotId });
        refreshAll();
      } else drawBoard();
    } else if (anim.kind === 'insert') {
      const p = Math.min(1, anim.t / bench.flySeconds);
      const [x, y] = SLOT_POS[/** @type {keyof typeof SLOT_POS} */ (anim.slotId)];
      flyer.position.lerpVectors(anim.from, _a.set(x, y, 0.004), p);
      flyer.position.z += Math.sin(p * Math.PI) * 0.06; // small arc
      if (p >= 1) {
        const { slotId, partId } = anim;
        anim = null;
        flyer.visible = false;
        game.intent('electronics:insert', { slotId, partId, reversed: false });
        game.intent('electronics:heat', { slotId });
        refreshAll();
      }
    }
  });

  // ---- Drawing ----
  function drawBoard() {
    const el = sim().electronics;
    const step = current();
    /** @type {Set<string>} */
    const red = new Set();
    if (scanned || anim?.kind === 'remove') for (const s of el.slots) if (s.partId && isBroken(s, defaults[s.id])) red.add(s.id);
    const ghost = step.step === 'insert' ? step.slotId ?? null : null;
    const ring = anim?.kind === 'remove' ? { id: anim.slotId, p: Math.min(1, anim.t / bench.heatSeconds) } : null;
    const scanX = anim?.kind === 'scan' ? anim.t / bench.scanSeconds : null;
    const key = `${[...red].join()}|${ghost}|${pulse}|${ring ? `${ring.id}${ring.p.toFixed(2)}` : ''}|${scanX?.toFixed(3) ?? ''}`;
    pcb.renderCustom(key, (ctx, W, H) => drawSilkscreen(ctx, W, H, t, { red, ghost, pulse, ring, scanX }));
  }

  function drawCards() {
    const el = sim().electronics;
    for (const c of cards) {
      const def = cfg.parts[c.partId];
      const n = el.stock[c.partId] ?? 0;
      const wrong = shake?.partId === c.partId;
      c.panel.renderCustom(`${n}|${wrong}`, (ctx, W, H) => {
        tile(ctx, 4, 4, W - 8, H - 8, n > 0 ? '#1d2630' : '#15191e', wrong ? COLORS.critical : n > 0 ? COLORS.info : COLORS.border, Math.max(4, H * 0.03));
        if (def.kind === 'diode') diodeIcon(ctx, W / 2, H * 0.4, W * 0.5, n > 0);
        else capIcon(ctx, W / 2, H * 0.4, H * 0.2, n > 0);
        text(ctx, t(`hub.elec.kind.${def.kind}`), W / 2, H * 0.72, { size: H * 0.13, bold: true, align: 'center', maxWidth: W * 0.9, color: n > 0 ? COLORS.text : COLORS.dim });
        text(ctx, n > 0 ? t('hub.elec.stock', { n }) : t('hub.elec.card.empty'), W / 2, H * 0.87, { size: H * 0.1, align: 'center', maxWidth: W * 0.9, color: n > 0 ? COLORS.dim : COLORS.critical });
      });
    }
  }

  function drawStep() {
    const el = sim().electronics;
    const out = el.output;
    const step = current();
    const busy = anim?.kind === 'scan' ? 'scanning' : anim?.kind === 'remove' ? 'removing' : anim?.kind === 'insert' ? 'inserting' : null;
    const label = busy ?? step.step;
    const n = STEP_NUMBER[step.step];
    const color = step.step === 'ok' ? COLORS.nominal : COLORS.warning;
    const sub = step.step === 'ok' ? t('hub.elec.sub.ok') : t(`hub.elec.quality.${out.quality}`, { cap: out.signalCap ?? 100 });
    stepPanel.renderCustom(`${label}|${message}|${out.quality}|${pulse && step.step === 'scan'}`, (ctx, W, H) => {
      frame(ctx, W, H, color);
      text(ctx, t('hub.elec.title'), W * 0.05, H * 0.1, { size: H * 0.065, color: COLORS.title, bold: true, maxWidth: W * 0.9 });
      // Progress dots 1 · 2 · 3.
      for (let i = 1; i <= 3; i++) {
        const done = step.step === 'ok' || i < n;
        badge(ctx, W * (0.3 + (i - 1) * 0.2), H * 0.28, H * 0.07, done ? '✔' : String(i), done ? COLORS.nominal : i === n ? COLORS.warning : '#4a525a');
      }
      text(ctx, t(`hub.elec.step.${label}`), W / 2, H * 0.5, { size: H * 0.11, bold: true, align: 'center', color: step.step === 'scan' && pulse ? COLORS.title : color, maxWidth: W * 0.92 });
      text(ctx, t(`hub.elec.how.${label}`), W / 2, H * 0.64, { size: H * 0.07, align: 'center', maxWidth: W * 0.92 });
      text(ctx, sub, W / 2, H * 0.77, { size: H * 0.058, align: 'center', color: step.step === 'ok' ? COLORS.nominal : COLORS.dim, maxWidth: W * 0.92 });
      if (message) {
        roundRect(ctx, W * 0.05, H * 0.84, W * 0.9, H * 0.12, H * 0.03);
        ctx.fillStyle = '#3a2a12';
        ctx.fill();
        text(ctx, message, W / 2, H * 0.9, { size: H * 0.065, bold: true, align: 'center', color: COLORS.warning, maxWidth: W * 0.86 });
      }
    });
    scanButton.setState(t('hub.elec.btn.scan'), step.step === 'scan' ? (pulse ? BUTTON.warn : BUTTON.action) : BUTTON.off);
  }

  function refreshAll() {
    const el = sim().electronics;
    if (!el) return;
    if (el !== lastEl) {
      // New game: forget the scan and any running animation.
      lastEl = el;
      scanned = false;
      anim = null;
      flyer.visible = false;
    }
    if (benchStep(el.slots, defaults, true).step === 'ok') scanned = false; // the next fault needs a new scan
    for (const s of el.slots) {
      const view = slots[s.id];
      view.mesh.visible = Boolean(s.partId);
      if (!s.partId) continue;
      const geoKey = `${s.partId}${s.health === 'dried' ? ':swollen' : ''}`;
      if (geoKey !== view.lastGeo) {
        view.mesh.geometry = partGeometry(s.partId, s.health === 'dried');
        view.lastGeo = geoKey;
      }
      view.mesh.rotation.set(0, 0, s.reversed ? Math.PI : 0);
    }
    drawBoard();
    drawCards();
    drawStep();  }

  // ---- 4 Hz refresh: blink, panels, scope ----
  let phase = 0;
  kit.onRefresh(() => {
    const el = sim().electronics;
    if (!el) return;
    pulse = !pulse;
    refreshAll();
    phase = (phase + 1) % 8;
    const out = el.output;
    scope.renderCustom(`${out.quality}|${out.mode}|${out.rippleVpp.toFixed(2)}|${phase}`, (ctx, W, H) => drawScope(ctx, W, H, out, cfg.circuit, phase, t));
  });
}

/** Card icon: axial diode seen from above (matches the silkscreen rectangle with its cathode bar). */
function diodeIcon(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ w, /** @type {boolean} */ on) {
  const h = w * 0.3;
  ctx.strokeStyle = '#c9ccd0';
  ctx.lineWidth = Math.max(2, h * 0.12);
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.75, cy);
  ctx.lineTo(cx + w * 0.75, cy);
  ctx.stroke();
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h * 0.4);
  ctx.fillStyle = on ? '#1b1b1b' : '#33373c';
  ctx.fill();
  ctx.fillStyle = '#bfc3c8';
  ctx.fillRect(cx + w * 0.28, cy - h / 2, w * 0.12, h);
}

/** Card icon: electrolytic capacitor seen from above (matches the silkscreen circle with its «−» half). */
function capIcon(/** @type {CanvasRenderingContext2D} */ ctx, /** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ r, /** @type {boolean} */ on) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = on ? '#2f4f9f' : '#2c3440';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
  ctx.fillStyle = '#a9b0ba';
  ctx.fill();
  ctx.fillStyle = '#e8ecf5';
  ctx.fillRect(cx - r, cy - r * 0.45, r * 0.18, r * 0.9);
}

/**
 * Green PCB with white silkscreen. Marks: broken parts blink red, the empty slot to fill glows green,
 * a progress ring while desoldering and a scan line sweeping the board.
 * @param {CanvasRenderingContext2D} ctx @param {number} W @param {number} H @param {Function} t
 * @param {{ red: Set<string>, ghost: string | null, pulse: boolean, ring: { id: string, p: number } | null, scanX: number | null }} marks
 */
function drawSilkscreen(ctx, W, H, t, { red, ghost, pulse, ring, scanX }) {
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

  // Highlights under the silkscreen.
  for (const [id, [x, y]] of Object.entries(SLOT_POS)) {
    const isCap = id === 'C1';
    const half = isCap ? 0.028 : 0.03;
    if (red.has(id)) {
      ctx.fillStyle = pulse ? 'rgba(255,60,40,0.85)' : 'rgba(255,60,40,0.4)';
      roundRect(ctx, px(x - half), py(y + half * 0.8), s * half * 2, s * half * 1.6, s * 0.006);
      ctx.fill();
    } else if (ghost === id) {
      ctx.strokeStyle = pulse ? '#7dff9a' : '#3fd068';
      ctx.lineWidth = s * 0.003;
      ctx.setLineDash([s * 0.006, s * 0.004]);
      roundRect(ctx, px(x - half), py(y + half * 0.8), s * half * 2, s * half * 1.6, s * 0.006);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.strokeStyle = '#f2f2f2';
  ctx.fillStyle = '#f2f2f2';
  ctx.lineWidth = s * 0.0012;
  ctx.font = font(s * 0.011, true);
  ctx.textAlign = 'center';
  for (const [id, [x, y]] of Object.entries(SLOT_POS)) {
    if (id === 'C1') {
      ctx.beginPath();
      ctx.arc(px(x), py(y), s * 0.015, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath(); // shaded «−» half on −x
      ctx.arc(px(x), py(y), s * 0.015, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.fill();
      ctx.fillText('C1', px(x), py(y - 0.03));
    } else {
      ctx.strokeRect(px(x - 0.017), py(y + 0.008), s * 0.034, s * 0.016);
      ctx.fillRect(px(x + 0.009), py(y + 0.008), s * 0.005, s * 0.016); // cathode bar
      ctx.fillText(id, px(x), py(y - 0.018));
    }
  }
  ctx.textAlign = 'left';
  ctx.fillText('~AC', px(-0.225), py(0.11));
  ctx.fillText('REG 5V', px(0.15), py(0.075));
  ctx.fillText(t('hub.comp.rx_psu').toUpperCase(), px(-0.225), py(-0.13));

  if (ring) {
    const [x, y] = SLOT_POS[/** @type {keyof typeof SLOT_POS} */ (ring.id)];
    ctx.strokeStyle = '#ffcf66';
    ctx.lineWidth = s * 0.004;
    ctx.beginPath();
    ctx.arc(px(x), py(y), s * 0.03, -Math.PI / 2, -Math.PI / 2 + ring.p * Math.PI * 2);
    ctx.stroke();
  }
  if (scanX !== null) {
    const x = scanX * W;
    const grad = ctx.createLinearGradient(x - W * 0.08, 0, x, 0);
    grad.addColorStop(0, 'rgba(120,255,160,0)');
    grad.addColorStop(1, 'rgba(120,255,160,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - W * 0.08, 0, W * 0.08, H);
    ctx.fillStyle = '#b8ffcc';
    ctx.fillRect(x - 2, 0, 4, H);
  }
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
  text(ctx, t('hub.elec.scope.title'), W * 0.02, H * 0.07, { size: H * 0.065, color: COLORS.title, bold: true });
  const good = out.quality === 'ok';
  text(ctx, t(good ? 'hub.elec.scope.good' : 'hub.elec.scope.bad'), W * 0.98, H * 0.07, { size: H * 0.065, bold: true, align: 'right', color: good ? COLORS.nominal : COLORS.critical });
  text(ctx, t('hub.elec.scope.legend'), W / 2, H * 0.94, { size: H * 0.055, align: 'center', color: COLORS.text, maxWidth: W * 0.96 });
}
