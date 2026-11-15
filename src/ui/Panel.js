import * as THREE from 'three';
import { COLORS, TYPE, font, wrapLines, ellipsize } from './theme.js';

export { COLORS };

/**
 * Diegetic panel: a world-space plane with a CanvasTexture.
 * Redraws only when its content key changes (cheap at 4 Hz).
 */
export class Panel {
  /**
   * @param {number} width metres
   * @param {number} height metres
   * @param {{ pxPerMeter?: number, minEm?: number }} [opts] resolution is never below the theme default;
   *   `minEm` (metres) is the smallest body text, by default the theme minimum (scaled down on tiny panels).
   */
  constructor(width, height, { pxPerMeter = TYPE.pxPerMeter, minEm } = {}) {
    // Same density on both axes (square texels), capped by the longest side.
    const density = Math.min(Math.max(pxPerMeter, TYPE.pxPerMeter), TYPE.maxCanvas / Math.max(width, height));
    this.pxPerMeter = density;
    this.minEm = minEm ?? Math.min(TYPE.minEm, height / 10);
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width * density);
    this.canvas.height = Math.round(height * density);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }),
    );
    this.mesh.userData.panel = this; // dev diagnostics (?debug): find panels from the scene
    this.key = '';
    /** True when the last `renderLines` had to cut text with «…» (dev diagnostics). */
    this.truncated = false;
  }

  /**
   * Standard layout: title + lines. Each line: string or { text, color, size }.
   * Text is scaled to fill the panel but never below `minEm`; a title wraps to two rows at most and
   * whatever still does not fit ends in «…».
   * @param {string} title
   * @param {(string | { text: string, color?: string, size?: number })[]} lines
   * @param {{ border?: string }} [opts]
   */
  renderLines(title, lines, { border = COLORS.border } = {}) {
    const key = JSON.stringify([title, lines, border]);
    if (key === this.key) return;
    this.key = key;

    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const items = lines.map((line) => (typeof line === 'string' ? { text: line } : line));
    const minPx = this.minEm * this.pxPerMeter;
    const minUnit = minPx / TYPE.body;

    /**
     * Wraps everything for a given layout unit.
     * @param {number} unit
     */
    const layout = (unit) => {
      const pad = unit * TYPE.pad;
      const maxWidth = W - pad * 2;
      ctx.font = font(unit * TYPE.title, true);
      const titleRows = title ? wrapLines(ctx, title, maxWidth) : [];
      if (titleRows.length > 2) {
        titleRows.length = 2;
        titleRows[1] = ellipsize(ctx, titleRows[1], maxWidth, true);
      }
      const titleHeight = title ? unit * (TYPE.titleBlock + (titleRows.length - 1) * TYPE.title * 1.15) : 0;
      /** @type {{ text: string, size: number, color: string, gap: number }[]} */
      const rows = [];
      let height = pad + titleHeight;
      for (const item of items) {
        const size = Math.max(minPx, unit * TYPE.body * (item.size ?? 1));
        ctx.font = font(size);
        const parts = wrapLines(ctx, item.text, maxWidth);
        parts.forEach((text, i) => {
          // A wrapped paragraph gets a little air after it so blocks read as blocks.
          const gap = parts.length > 1 && i === parts.length - 1 ? size * 0.25 : 0;
          rows.push({ text, size, color: item.color ?? COLORS.text, gap });
          height += size * TYPE.lineHeight + gap;
        });
      }
      return { pad, maxWidth, titleRows, titleHeight, rows, height };
    };

    // Start from the unwrapped estimate and shrink until the wrapped text fits or the minimum is reached.
    const lineUnits = items.reduce((sum, item) => sum + TYPE.body * (item.size ?? 1) * TYPE.lineHeight * item.text.split('\n').length, 0);
    let unit = Math.max(minUnit, Math.min(H / ((title ? TYPE.titleBlock : 0) + lineUnits + 1.2), W / 14));
    let plan = layout(unit);
    while (plan.height > H - plan.pad * 0.5 && unit > minUnit) {
      unit = Math.max(minUnit, unit * 0.94);
      plan = layout(unit);
    }
    const { pad, maxWidth, titleRows, rows } = plan;

    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(4, unit * 0.12);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);

    let y = pad;
    ctx.textBaseline = 'top';
    if (title) {
      ctx.fillStyle = COLORS.title;
      ctx.font = font(unit * TYPE.title, true);
      titleRows.forEach((row, i) => ctx.fillText(row, pad, y + i * unit * TYPE.title * 1.15));
      y += plan.titleHeight;
      // Thin rule: separates the title from the body.
      ctx.fillStyle = border;
      ctx.fillRect(pad, y - unit * 0.2, maxWidth, Math.max(2, unit * 0.05));
    }
    const bottom = H - pad * 0.5;
    this.truncated = false;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (y + row.size > bottom) break;
      ctx.font = font(row.size);
      ctx.fillStyle = row.color;
      const next = rows[i + 1];
      const lastThatFits = next && y + row.size * TYPE.lineHeight + row.gap + next.size > bottom;
      if (lastThatFits) this.truncated = true;
      ctx.fillText(lastThatFits ? ellipsize(ctx, row.text, maxWidth, true) : row.text, pad, y);
      y += row.size * TYPE.lineHeight + row.gap;
    }
    this.texture.needsUpdate = true;
  }

  /**
   * Custom drawing with change detection.
   * @param {string} key @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} draw
   */
  renderCustom(key, draw) {
    if (key === this.key) return;
    this.key = key;
    draw(this.ctx, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
  }
}
