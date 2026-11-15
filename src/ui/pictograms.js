// SHARED (see docs/COLLABORATION.md): canvas pictograms for diegetic panels (Panel.renderCustom).
// Big drawings instead of text so young players can read a panel at a glance. Plain 2D canvas, no Three.js.
import { COLORS } from './Panel.js';

const FONT = 'system-ui, sans-serif';

/** Rounded rectangle path. */
export function roundRect(/** @type {CanvasRenderingContext2D} */ ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Small leaf (ellipse) rotated by `angle`. */
export function leaf(/** @type {CanvasRenderingContext2D} */ ctx, cx, cy, rx, ry, angle, color) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, angle, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Panel background + coloured frame. @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} h @param {string} [border] */
export function frame(ctx, w, h, border = COLORS.border) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, w, h);
  const lw = Math.max(4, Math.round(h * 0.03));
  ctx.strokeStyle = border;
  ctx.lineWidth = lw;
  ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
}

/**
 * Single line of text, shrunk to fit `maxWidth`.
 * @param {CanvasRenderingContext2D} ctx @param {string} str @param {number} x @param {number} y
 * @param {{ size: number, color?: string, bold?: boolean, align?: CanvasTextAlign, maxWidth?: number }} o
 */
export function text(ctx, str, x, y, { size, color = COLORS.text, bold = false, align = 'left', maxWidth }) {
  let px = size;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = `${bold ? 'bold ' : ''}${Math.round(px)}px ${FONT}`;
  if (maxWidth) {
    const width = ctx.measureText(str).width;
    if (width > maxWidth) {
      px *= maxWidth / width;
      ctx.font = `${bold ? 'bold ' : ''}${Math.round(px)}px ${FONT}`;
    }
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.textAlign = 'left';
}

/**
 * Progress bar 0..1 with rounded ends.
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number} value 0..1 @param {string} color
 */
export function bar(ctx, x, y, w, h, value, color) {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = '#26303a';
  ctx.fill();
  const v = Math.max(0, Math.min(1, value));
  if (v > 0.01) {
    roundRect(ctx, x, y, Math.max(h, w * v), h, h / 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

/** Water drop centred on (cx, cy). @param {CanvasRenderingContext2D} ctx */
export function drop(ctx, cx, cy, size, color = '#6fc3ff') {
  const r = size * 0.42;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.75);
  ctx.quadraticCurveTo(cx + r * 1.5, cy + r * 0.2, cx, cy + r * 1.1);
  ctx.quadraticCurveTo(cx - r * 1.5, cy + r * 0.2, cx, cy - size * 0.75);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#0b2a40';
  ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.stroke();
}

/** Right-pointing arrow. @param {CanvasRenderingContext2D} ctx */
export function arrow(ctx, cx, cy, size, color = COLORS.dim) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - size / 2, cy - size * 0.18);
  ctx.lineTo(cx + size * 0.1, cy - size * 0.18);
  ctx.lineTo(cx + size * 0.1, cy - size * 0.42);
  ctx.lineTo(cx + size / 2, cy);
  ctx.lineTo(cx + size * 0.1, cy + size * 0.42);
  ctx.lineTo(cx + size * 0.1, cy + size * 0.18);
  ctx.lineTo(cx - size / 2, cy + size * 0.18);
  ctx.closePath();
  ctx.fill();
}

/** Sun (lights on) or moon (lights off). @param {CanvasRenderingContext2D} ctx @param {boolean} on */
export function lightIcon(ctx, cx, cy, r, on) {
  if (on) {
    ctx.strokeStyle = '#ffcf66';
    ctx.lineWidth = Math.max(2, r * 0.16);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffcf66';
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = '#8b98a5';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.32, cy - r * 0.2, r * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.background;
    ctx.fill();
  }
}

/** Numbered step badge. @param {CanvasRenderingContext2D} ctx */
export function badge(ctx, cx, cy, r, label, color) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  text(ctx, label, cx, cy + r * 0.05, { size: r * 1.3, color: '#0b0f13', bold: true, align: 'center' });
}

/** Rounded tile (step card). @param {CanvasRenderingContext2D} ctx */
export function tile(ctx, x, y, w, h, fill, stroke, lineWidth = 3) {
  roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.12);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}
