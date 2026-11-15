// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Personal pictograms: Sun, CME cloud, magnet, particles, shield, bone, body clock, defender cell.
// Generic shapes (frame, text, bar, tile, badge…) live in src/ui/pictograms.js and are re-exported here.
import { COLORS } from '../../ui/Panel.js';
import { roundRect } from '../../ui/pictograms.js';

export * from '../../ui/pictograms.js';

/** Sun with rays; `angry` adds flare tongues (solar storm). @param {CanvasRenderingContext2D} ctx */
export function sun(ctx, cx, cy, r, angry = false) {
  ctx.strokeStyle = angry ? '#ff7a3f' : '#ffcf66';
  ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const len = angry && i % 3 === 0 ? 1.55 : 1.25;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82);
    ctx.lineTo(cx + Math.cos(a) * r * len, cy + Math.sin(a) * r * len);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.1, cx, cy, r * 0.75);
  g.addColorStop(0, '#fff2b0');
  g.addColorStop(1, angry ? '#ff7a3f' : '#ffb93f');
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
}

/** Puffy particle cloud (CME). @param {CanvasRenderingContext2D} ctx */
export function cloud(ctx, cx, cy, r, color = '#ff9f5f') {
  ctx.fillStyle = color;
  for (const [dx, dy, k] of [[-0.45, 0.1, 0.42], [0, -0.15, 0.55], [0.45, 0.1, 0.42], [0, 0.2, 0.45]]) {
    ctx.beginPath();
    ctx.arc(cx + dx * r, cy + dy * r, k * r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const [dx, dy] of [[-0.3, 0], [0.1, -0.2], [0.35, 0.15], [-0.05, 0.25]]) {
    ctx.beginPath();
    ctx.arc(cx + dx * r, cy + dy * r, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Horseshoe magnet with field arcs (geomagnetic storm). @param {CanvasRenderingContext2D} ctx */
export function magnet(ctx, cx, cy, r) {
  ctx.lineWidth = r * 0.34;
  ctx.strokeStyle = '#d9472b';
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.1, r * 0.5, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#d9472b';
  ctx.fillRect(cx - r * 0.67, cy - r * 0.1, r * 0.34, r * 0.45);
  ctx.fillRect(cx + r * 0.33, cy - r * 0.1, r * 0.34, r * 0.45);
  ctx.fillStyle = '#c9d1d9';
  ctx.fillRect(cx - r * 0.67, cy + r * 0.35, r * 0.34, r * 0.25);
  ctx.fillRect(cx + r * 0.33, cy + r * 0.35, r * 0.34, r * 0.25);
  ctx.strokeStyle = '#7cc4ff';
  ctx.lineWidth = Math.max(2, r * 0.07);
  for (const k of [0.9, 1.1]) {
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.48, r * 0.5 * k, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
}

/** Fast particles (solar particle event): streaks with dots. @param {CanvasRenderingContext2D} ctx */
export function particles(ctx, cx, cy, r, color = '#ffcf66') {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.08);
  for (const [dy, len] of [[-0.5, 0.9], [-0.1, 1.2], [0.3, 0.8], [0.65, 1.05]]) {
    const y = cy + dy * r;
    const x1 = cx + r * 0.7;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(x1 - len * r, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x1, y, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Shield with a check mark (protected) or an exclamation (not protected). @param {CanvasRenderingContext2D} ctx */
export function shield(ctx, cx, cy, r, ok = true) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r * 0.95, cy - r * 0.75, cx + r * 0.85, cy - r * 0.6);
  ctx.quadraticCurveTo(cx + r * 0.8, cy + r * 0.55, cx, cy + r);
  ctx.quadraticCurveTo(cx - r * 0.8, cy + r * 0.55, cx - r * 0.85, cy - r * 0.6);
  ctx.quadraticCurveTo(cx - r * 0.95, cy - r * 0.75, cx, cy - r);
  ctx.closePath();
  ctx.fillStyle = ok ? '#2f8f6f' : '#b83a2e';
  ctx.fill();
  ctx.strokeStyle = '#c9d1d9';
  ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(3, r * 0.17);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (ok) {
    ctx.moveTo(cx - r * 0.38, cy);
    ctx.lineTo(cx - r * 0.08, cy + r * 0.3);
    ctx.lineTo(cx + r * 0.42, cy - r * 0.3);
  } else {
    ctx.moveTo(cx, cy - r * 0.45);
    ctx.lineTo(cx, cy + r * 0.12);
    ctx.moveTo(cx, cy + r * 0.42);
    ctx.lineTo(cx, cy + r * 0.43);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** Bone (muscles and bones). @param {CanvasRenderingContext2D} ctx */
export function bone(ctx, cx, cy, r, color = '#efe6d2') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.6);
  ctx.fillStyle = color;
  ctx.fillRect(-r * 0.6, -r * 0.16, r * 1.2, r * 0.32);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * r * 0.68, sy * r * 0.17, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Clock with a battery mark (body clock + mitochondria, the cell "batteries"). @param {CanvasRenderingContext2D} ctx */
export function bodyClock(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = '#26303a';
  ctx.fill();
  ctx.strokeStyle = '#7cc4ff';
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.stroke();
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - r * 0.5);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + r * 0.35, cy + r * 0.12);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // Small battery badge.
  const bx = cx + r * 0.42;
  const by = cy + r * 0.45;
  ctx.fillStyle = '#11161c';
  roundRect(ctx, bx - r * 0.3, by - r * 0.17, r * 0.6, r * 0.34, r * 0.06);
  ctx.fill();
  ctx.strokeStyle = '#8fe08f';
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.stroke();
  ctx.fillStyle = '#ffbf3f';
  ctx.fillRect(bx - r * 0.24, by - r * 0.11, r * 0.22, r * 0.22);
  ctx.fillStyle = '#8fe08f';
  ctx.fillRect(bx + r * 0.3, by - r * 0.07, r * 0.06, r * 0.14);
}

/** Defender cell (NK cell) next to a sick cell. @param {CanvasRenderingContext2D} ctx */
export function defender(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx + r * 0.42, cy + r * 0.3, r * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = '#8a5a8a';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - r * 0.18, cy - r * 0.1, r * 0.56, 0, Math.PI * 2);
  ctx.fillStyle = '#4fa3d8';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - r * 0.25, cy - r * 0.15, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = '#1f5f8a';
  ctx.fill();
  ctx.fillStyle = '#c9e6ff';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx - r * 0.18 + Math.cos(a) * r * 0.62, cy - r * 0.1 + Math.sin(a) * r * 0.62, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Underground base under a layer of regolith (protection from radiation). @param {CanvasRenderingContext2D} ctx */
export function buriedBase(ctx, cx, cy, r) {
  ctx.fillStyle = '#b5653a';
  ctx.fillRect(cx - r, cy - r * 0.55, r * 2, r * 0.55);
  ctx.fillStyle = '#8a4a2a';
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.arc(cx - r * 0.85 + i * r * 0.28, cy - r * 0.35 + (i % 2) * r * 0.15, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#9aa7b3';
  roundRect(ctx, cx - r * 0.6, cy + r * 0.05, r * 1.2, r * 0.5, r * 0.12);
  ctx.fill();
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(cx - r * 0.12, cy + r * 0.22, r * 0.24, r * 0.33);
}
