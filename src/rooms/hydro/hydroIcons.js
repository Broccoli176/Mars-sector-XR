// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Hidroponía pictograms (crops, food bar, crate, gear, nutrient flask, water gauge).
// Generic shapes (frame, text, bar, drop, tile…) live in src/ui/pictograms.js and are re-exported here.
import { COLORS } from '../../ui/Panel.js';
import { roundRect, leaf, drop } from '../../ui/pictograms.js';

export * from '../../ui/pictograms.js';

/**
 * Water gauge: a bar with the good zone marked in green and a pointer at the current level.
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number} value 0..1 @param {{ dryAt: number, floodAt: number }} cfg
 */
export function waterGauge(ctx, x, y, w, h, value, cfg) {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = '#5a4a2a'; // too dry / too wet ends
  ctx.fill();
  ctx.fillStyle = '#2f8f4f';
  ctx.fillRect(x + w * cfg.dryAt, y, w * (cfg.floodAt - cfg.dryAt), h);
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.strokeStyle = '#0b0f13';
  ctx.lineWidth = 2;
  ctx.stroke();
  const px = x + w * Math.max(0, Math.min(1, value));
  drop(ctx, px, y + h / 2, h * 0.95, '#8fd3ff');
}

/** @type {Record<string, (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => void>} */
const CROPS = {
  lettuce(ctx, cx, cy, r) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      leaf(ctx, cx + Math.cos(a) * r * 0.42, cy + Math.sin(a) * r * 0.36, r * 0.5, r * 0.34, a, i % 2 ? '#5fb23f' : '#7fcf4f');
    }
    leaf(ctx, cx, cy, r * 0.4, r * 0.34, 0, '#a6e070');
  },
  tomato(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.08, r * 0.78, 0, Math.PI * 2);
    ctx.fillStyle = '#e2412f';
    ctx.fill();
    for (let i = 0; i < 5; i++) leaf(ctx, cx, cy - r * 0.6, r * 0.34, r * 0.1, (i / 5) * Math.PI, '#3f8f3f');
    leaf(ctx, cx - r * 0.3, cy - r * 0.15, r * 0.14, r * 0.22, 0.5, 'rgba(255,255,255,0.35)');
  },
  soybean(ctx, cx, cy, r) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.5);
    leaf(ctx, 0, 0, r * 0.9, r * 0.32, 0, '#8fc45a');
    for (const dx of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.arc(dx * r, 0, r * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#c9e08a';
      ctx.fill();
    }
    ctx.restore();
  },
  carrot(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.38, cy - r * 0.25);
    ctx.lineTo(cx + r * 0.38, cy - r * 0.25);
    ctx.lineTo(cx, cy + r * 0.9);
    ctx.closePath();
    ctx.fillStyle = '#f07f1f';
    ctx.fill();
    for (const a of [-0.5, 0, 0.5]) leaf(ctx, cx + a * r * 0.5, cy - r * 0.6, r * 0.14, r * 0.4, a, '#5aa83f');
  },
  sweet_potato(ctx, cx, cy, r) {
    leaf(ctx, cx, cy + r * 0.1, r * 0.85, r * 0.48, -0.35, '#a8527a');
    leaf(ctx, cx - r * 0.2, cy - r * 0.05, r * 0.3, r * 0.12, -0.35, 'rgba(255,255,255,0.25)');
    leaf(ctx, cx + r * 0.55, cy - r * 0.6, r * 0.3, r * 0.2, 0.6, '#5f8a3f');
  },
  quinoa(ctx, cx, cy, r) {
    ctx.strokeStyle = '#6f8f3f';
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.9);
    ctx.lineTo(cx, cy - r * 0.2);
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const k = i / 6;
      ctx.beginPath();
      ctx.arc(cx + (i % 2 ? 1 : -1) * r * 0.2 * (1 - k * 0.6), cy - r * 0.85 + k * r * 0.75, r * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = i % 3 ? '#d9a33f' : '#c4523a';
      ctx.fill();
    }
    leaf(ctx, cx + r * 0.35, cy + r * 0.4, r * 0.34, r * 0.12, -0.6, '#5f9a3f');
    leaf(ctx, cx - r * 0.35, cy + r * 0.55, r * 0.34, r * 0.12, 0.6, '#5f9a3f');
  },
  spirulina(ctx, cx, cy, r) {
    ctx.strokeStyle = '#2fbf7f';
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI * 5;
      const rad = r * 0.1 + (r * 0.8 * i) / 60;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  },
};

/** Crop pictogram inside a dark disc. @param {CanvasRenderingContext2D} ctx @param {string} cropId */
export function cropIcon(ctx, cropId, cx, cy, r, ring = '#3a4652') {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#1b232c';
  ctx.fill();
  ctx.strokeStyle = ring;
  ctx.lineWidth = Math.max(3, r * 0.1);
  ctx.stroke();
  (CROPS[cropId] ?? CROPS.lettuce)(ctx, cx, cy, r * 0.72);
}

/** Two-leaf sprout (growth start / "sow" step). @param {CanvasRenderingContext2D} ctx */
export function sprout(ctx, cx, cy, r, color = '#7fcf4f') {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.8);
  ctx.lineTo(cx, cy - r * 0.1);
  ctx.stroke();
  leaf(ctx, cx - r * 0.4, cy - r * 0.3, r * 0.45, r * 0.22, 0.6, color);
  leaf(ctx, cx + r * 0.4, cy - r * 0.3, r * 0.45, r * 0.22, -0.6, color);
}

/** Wrapped food bar. @param {CanvasRenderingContext2D} ctx */
export function foodBar(ctx, cx, cy, w, color = '#e0a030') {
  const h = w * 0.36;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h * 0.25);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(cx - w * 0.12, cy - h / 2, w * 0.24, h);
  ctx.strokeStyle = '#0b0f13';
  ctx.lineWidth = 2;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h * 0.25);
  ctx.stroke();
}

/** Harvest crate. @param {CanvasRenderingContext2D} ctx */
export function crate(ctx, cx, cy, size, color = '#b98a4a') {
  const s = size;
  ctx.fillStyle = color;
  ctx.fillRect(cx - s / 2, cy - s * 0.35, s, s * 0.7);
  ctx.strokeStyle = '#0b0f13';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - s / 2, cy - s * 0.35, s, s * 0.7);
  ctx.beginPath();
  ctx.moveTo(cx - s / 2, cy);
  ctx.lineTo(cx + s / 2, cy);
  ctx.stroke();
}

/** Gear (the food processor). @param {CanvasRenderingContext2D} ctx */
export function gear(ctx, cx, cy, r, color = '#9aa7b3', turn = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(turn);
  ctx.fillStyle = color;
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-r * 0.16, -r, r * 0.32, r * 0.4);
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.background;
  ctx.fill();
  ctx.restore();
}

/** Nutrient flask with a fill level 0..1. @param {CanvasRenderingContext2D} ctx */
export function flask(ctx, cx, cy, size, level, color = '#b77fe0') {
  const w = size * 0.7;
  const h = size;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.fillStyle = '#26303a';
  roundRect(ctx, x, y + h * 0.2, w, h * 0.8, w * 0.18);
  ctx.fill();
  const v = Math.max(0, Math.min(1, level));
  ctx.fillStyle = color;
  ctx.fillRect(x + 2, y + h * 0.2 + h * 0.8 * (1 - v), w - 4, h * 0.8 * v - 2);
  ctx.fillStyle = '#26303a';
  ctx.fillRect(cx - w * 0.2, y, w * 0.4, h * 0.22);
  ctx.strokeStyle = '#9aa7b3';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y + h * 0.2, w, h * 0.8, w * 0.18);
  ctx.stroke();
}

