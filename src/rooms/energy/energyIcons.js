// OWNER: teammate (Telecom · Control · Energy) — see docs/COLLABORATION.md
// Energía y oxígeno pictograms: circuit icons, battery, dial gauge, thermometer, O₂ tank, CO₂ filter,
// solar-field top view and dust specks. Generic shapes live in src/ui/pictograms.js (re-exported).
import { COLORS } from '../../ui/Panel.js';
import { font } from '../../ui/theme.js';
import { roundRect } from '../../ui/pictograms.js';

export * from '../../ui/pictograms.js';

/** Stroke helper. @param {CanvasRenderingContext2D} ctx */
function pen(ctx, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/** @type {Record<string, (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) => void>} */
const CIRCUIT_ICONS = {
  // Fan blades (air: O₂ + CO₂).
  lifeSupport(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * r * 0.42, cy + Math.sin(a) * r * 0.42, r * 0.42, r * 0.2, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.background;
    ctx.fill();
  },
  // Flame.
  heating(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.95);
    ctx.quadraticCurveTo(cx + r * 0.85, cy - r * 0.1, cx + r * 0.55, cy + r * 0.55);
    ctx.quadraticCurveTo(cx, cy + r * 1.0, cx - r * 0.55, cy + r * 0.55);
    ctx.quadraticCurveTo(cx - r * 0.85, cy - r * 0.1, cx, cy - r * 0.95);
    ctx.fill();
    ctx.fillStyle = COLORS.background;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.45, r * 0.22, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  // Light bulb.
  lighting(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.2, r * 0.58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - r * 0.3, cy + r * 0.3, r * 0.6, r * 0.45);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(cx - r * 0.3, cy + r * 0.46, r * 0.6, r * 0.07);
  },
  // Antenna dish with waves.
  telecom(ctx, cx, cy, r, color) {
    pen(ctx, color, Math.max(2, r * 0.16));
    ctx.beginPath();
    ctx.arc(cx - r * 0.2, cy - r * 0.1, r * 0.55, 0.25 * Math.PI, 1.25 * Math.PI);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.2, cy + r * 0.3);
    ctx.lineTo(cx - r * 0.2, cy + r * 0.9);
    ctx.stroke();
    for (const k of [0.5, 0.85]) {
      ctx.beginPath();
      ctx.arc(cx - r * 0.2, cy - r * 0.1, r * (0.55 + k * 0.5), -0.55 * Math.PI, -0.15 * Math.PI);
      ctx.stroke();
    }
  },
  // Leaf.
  hydro(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.85, r * 0.45, -0.7, 0, Math.PI * 2);
    ctx.fill();
    pen(ctx, COLORS.background, Math.max(2, r * 0.1));
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.6, cy + r * 0.55);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.45);
    ctx.stroke();
  },
  // Wrench.
  repairBay(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = color;
    ctx.fillRect(-r * 0.13, -r * 0.2, r * 0.26, r * 1.1);
    ctx.beginPath();
    ctx.arc(0, -r * 0.45, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(-r * 0.16, -r * 0.95, r * 0.32, r * 0.5);
    ctx.restore();
  },
};

/** Circuit pictogram. @param {CanvasRenderingContext2D} ctx @param {string} id */
export function circuitIcon(ctx, id, cx, cy, r, color) {
  (CIRCUIT_ICONS[id] ?? CIRCUIT_ICONS.lifeSupport)(ctx, cx, cy, r, color);
  ctx.lineCap = 'butt';
}

/** Battery with charge level 0..1. @param {CanvasRenderingContext2D} ctx */
export function battery(ctx, x, y, w, h, level, color) {
  ctx.fillStyle = '#26303a';
  roundRect(ctx, x, y, w * 0.93, h, h * 0.18);
  ctx.fill();
  ctx.fillRect(x + w * 0.93, y + h * 0.3, w * 0.07, h * 0.4);
  const v = Math.max(0, Math.min(1, level));
  if (v > 0.01) {
    ctx.fillStyle = color;
    roundRect(ctx, x + h * 0.1, y + h * 0.1, (w * 0.93 - h * 0.2) * v, h * 0.8, h * 0.12);
    ctx.fill();
  }
  ctx.strokeStyle = '#9aa7b3';
  ctx.lineWidth = Math.max(2, h * 0.06);
  roundRect(ctx, x, y, w * 0.93, h, h * 0.18);
  ctx.stroke();
}

/**
 * Half-dial gauge with green / amber / red zones and a needle.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ value: number, min: number, max: number, warnAt: number, criticalAt: number, direction: 'low' | 'high' }} r
 */
export function dial(ctx, cx, cy, radius, r) {
  const span = r.max - r.min;
  const k = (/** @type {number} */ v) => Math.max(0, Math.min(1, (v - r.min) / span));
  const ang = (/** @type {number} */ f) => Math.PI + f * Math.PI;
  /** @type {[number, number, string][]} */
  const zones = r.direction === 'low'
    ? [[0, k(r.criticalAt), COLORS.critical], [k(r.criticalAt), k(r.warnAt), COLORS.warning], [k(r.warnAt), 1, COLORS.nominal]]
    : [[0, k(r.warnAt), COLORS.nominal], [k(r.warnAt), k(r.criticalAt), COLORS.warning], [k(r.criticalAt), 1, COLORS.critical]];
  ctx.lineWidth = radius * 0.22;
  for (const [a, b, c] of zones) {
    if (b <= a) continue;
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, ang(a), ang(b));
    ctx.stroke();
  }
  const a = ang(k(r.value));
  pen(ctx, '#ffffff', Math.max(3, radius * 0.08));
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * radius * 0.9, cy + Math.sin(a) * radius * 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineCap = 'butt';
}

/** Thermometer with a fill level 0..1. @param {CanvasRenderingContext2D} ctx */
export function thermometer(ctx, cx, cy, h, level, color) {
  const w = h * 0.24;
  ctx.fillStyle = '#26303a';
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h * 0.8, w / 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + h * 0.32, w * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  const v = Math.max(0.05, Math.min(1, level));
  const top = cy + h * 0.25 - h * 0.68 * v;
  ctx.fillRect(cx - w * 0.22, top, w * 0.44, cy + h * 0.3 - top);
  ctx.beginPath();
  ctx.arc(cx, cy + h * 0.32, w * 0.6, 0, Math.PI * 2);
  ctx.fill();
}

/** Gas tank, full or empty. @param {CanvasRenderingContext2D} ctx */
export function tank(ctx, cx, cy, h, full, label = 'O₂') {
  const w = h * 0.45;
  ctx.fillStyle = full ? '#5f87a8' : '#3a4652';
  roundRect(ctx, cx - w / 2, cy - h * 0.38, w, h * 0.86, w * 0.45);
  ctx.fill();
  ctx.fillStyle = '#9aa7b3';
  ctx.fillRect(cx - w * 0.15, cy - h * 0.5, w * 0.3, h * 0.14);
  ctx.fillStyle = full ? '#ffffff' : '#8b98a5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(h * 0.2, true);
  ctx.fillText(label, cx, cy + h * 0.06);
  ctx.textAlign = 'left';
}

/** Pleated CO₂ filter cartridge, darker as it gets used. @param {CanvasRenderingContext2D} ctx */
export function filterCartridge(ctx, cx, cy, size, fraction) {
  const w = size;
  const h = size * 0.7;
  const life = Math.max(0, Math.min(1, fraction));
  const shade = Math.round(70 + 150 * life);
  ctx.fillStyle = `rgb(${shade}, ${shade}, ${Math.round(shade * 0.9)})`;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h * 0.1);
  ctx.fill();
  pen(ctx, '#4a525a', Math.max(2, size * 0.04));
  for (let i = 1; i < 6; i++) {
    const x = cx - w / 2 + (i * w) / 6;
    ctx.beginPath();
    ctx.moveTo(x, cy - h / 2 + 3);
    ctx.lineTo(x, cy + h / 2 - 3);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

/**
 * Top view of the solar field: the Sun direction, the panel row orientation and an alignment arc.
 * 0° = facing the window (east); positive = towards the west, like SolarTracker.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ panelDeg: number, sunDeg: number | null, stowed: boolean }} o
 */
export function fieldTopView(ctx, cx, cy, r, { panelDeg, sunDeg, stowed }) {
  ctx.fillStyle = '#3a2418';
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.fill();
  // Angle → canvas direction: 0° straight up (outside the window), ±90° to the sides.
  const dir = (/** @type {number} */ deg) => -Math.PI / 2 + (deg * Math.PI) / 180;
  if (sunDeg !== null) {
    const a = dir(sunDeg);
    const sx = cx + Math.cos(a) * r * 0.82;
    const sy = cy + Math.sin(a) * r * 0.82;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = '#ffcf66';
    ctx.fill();
  }
  // Panel: a bar perpendicular to its facing direction, plus a short facing arrow.
  const a = dir(stowed ? 90 : panelDeg);
  ctx.save();
  ctx.translate(cx, cy - r * 0.05);
  ctx.rotate(a + Math.PI / 2);
  ctx.fillStyle = stowed ? '#8b98a5' : '#2f6fb3';
  ctx.fillRect(-r * 0.4, -r * 0.06, r * 0.8, r * 0.12);
  ctx.restore();
  if (!stowed) {
    pen(ctx, '#7cc4ff', Math.max(2, r * 0.05));
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.05);
    ctx.lineTo(cx + Math.cos(a) * r * 0.5, cy - r * 0.05 + Math.sin(a) * r * 0.5);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
  ctx.fillStyle = '#9aa7b3';
  ctx.fillRect(cx - r, cy, r * 2, r * 0.05);
}

/** Dust specks over a bar area, more for higher `amount` (0..1). @param {CanvasRenderingContext2D} ctx */
export function dustSpecks(ctx, x, y, w, h, amount) {
  ctx.fillStyle = '#b5653a';
  const n = Math.round(30 * Math.max(0, Math.min(1, amount)));
  for (let i = 0; i < n; i++) {
    const fx = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const fy = (Math.sin(i * 78.233) * 12345.678) % 1;
    ctx.beginPath();
    ctx.arc(x + Math.abs(fx) * w, y + Math.abs(fy) * h, Math.max(1.5, h * 0.06), 0, Math.PI * 2);
    ctx.fill();
  }
}
