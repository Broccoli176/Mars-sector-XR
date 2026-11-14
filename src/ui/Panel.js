import * as THREE from 'three';

export const COLORS = {
  background: '#11161c',
  border: '#3a4652',
  text: '#d8e1e8',
  dim: '#8b98a5',
  title: '#ffcf66',
  nominal: '#8fe08f',
  warning: '#ffbf3f',
  critical: '#ff6b5c',
  info: '#7cc4ff',
};

/**
 * Greedy word wrap with the current canvas font.
 * @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} maxWidth
 */
function wrap(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return [text];
  /** @type {string[]} */
  const out = [];
  let current = '';
  for (const word of text.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      out.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Diegetic panel: a world-space plane with a CanvasTexture.
 * Redraws only when its content key changes (cheap at 4 Hz).
 */
export class Panel {
  /**
   * @param {number} width metres
   * @param {number} height metres
   * @param {{ pxPerMeter?: number }} [opts]
   */
  constructor(width, height, { pxPerMeter = 420 } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.min(1024, Math.round(width * pxPerMeter));
    this.canvas.height = Math.min(1024, Math.round(height * pxPerMeter));
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
    this.key = '';
  }

  /**
   * Standard layout: title + lines. Each line: string or { text, color, size }.
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

    // Fit the text block to the panel: start from the unwrapped estimate, shrink until wrapped text fits.
    const lineUnits = items.reduce((sum, item) => sum + 0.8 * (item.size ?? 1) * 1.3 * item.text.split('\n').length, 0);
    let unit = Math.min(H / ((title ? 1.35 : 0) + lineUnits + 1.2), W / 14);
    for (let attempt = 0; attempt < 8; attempt++) {
      const padTry = unit * 0.6;
      let height = padTry + (title ? unit * 1.35 : 0);
      for (const item of items) {
        const size = unit * 0.8 * (item.size ?? 1);
        ctx.font = `${Math.round(size)}px system-ui, sans-serif`;
        const rows = item.text.split('\n').flatMap((p) => wrap(ctx, p, W - padTry * 2)).length;
        height += rows * size * 1.3;
      }
      if (height <= H - padTry * 0.5) break;
      unit *= 0.9;
    }
    const pad = unit * 0.6;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(4, unit * 0.12);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);

    let y = pad;
    ctx.textBaseline = 'top';
    if (title) {
      ctx.fillStyle = COLORS.title;
      ctx.font = `bold ${Math.round(unit * 0.95)}px system-ui, sans-serif`;
      ctx.fillText(title, pad, y, W - pad * 2);
      y += unit * 1.35;
    }
    const maxWidth = W - pad * 2;
    for (const item of items) {
      const size = unit * 0.8 * (item.size ?? 1);
      ctx.font = `${Math.round(size)}px system-ui, sans-serif`;
      ctx.fillStyle = item.color ?? COLORS.text;
      for (const part of item.text.split('\n').flatMap((p) => wrap(ctx, p, maxWidth))) {
        if (y + size > H - pad * 0.5) break;
        ctx.fillText(part, pad, y, maxWidth);
        y += size * 1.3;
      }
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
