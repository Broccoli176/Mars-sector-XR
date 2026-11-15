// SHARED (see docs/COLLABORATION.md): one typography + colour theme for every diegetic text surface
// (Panel, Button, pictograms and the room canvases). Plain data and 2D-canvas helpers: no Three.js and
// no DOM access at import time, so headless tests can load it.

/** Quest Browser resolves `system-ui` to Roboto. */
export const FONT = 'system-ui, sans-serif';

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

/** Button face colours. Every one keeps the white label at ≥ 4.5:1 contrast. */
export const BUTTON = { on: '#267a4b', off: '#4a525a', warn: '#9a6412', danger: '#b83a2e', action: '#2f6fb3', info: '#227a90', label: '#ffffff' };

/**
 * Type scale. Sizes in metres are physical sizes on the panel, so they read the same on every panel.
 * `minEm` ≈ 1.3° at 1 m: text never shrinks below it; what does not fit ends in «…» instead.
 */
export const TYPE = {
  pxPerMeter: 640, // canvas resolution floor: sharper than the old 420 while all panels stay near 110 MB
  maxCanvas: 2048, // px per side
  minEm: 0.022, // m, smallest body text
  lineHeight: 1.3,
  title: 0.95, // × layout unit
  body: 0.8, // × layout unit
  titleBlock: 1.35, // × layout unit, title row + rule
  pad: 0.6, // × layout unit
};

/** @param {number} px @param {boolean} [bold] */
export const font = (px, bold = false) => `${bold ? 'bold ' : ''}${Math.max(1, Math.round(px))}px ${FONT}`;

/**
 * Greedy word wrap with the current canvas font. Honours explicit `\n`.
 * @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} maxWidth
 * @returns {string[]}
 */
export function wrapLines(ctx, text, maxWidth) {
  /** @type {string[]} */
  const out = [];
  for (const paragraph of String(text).split('\n')) {
    if (ctx.measureText(paragraph).width <= maxWidth) {
      out.push(paragraph);
      continue;
    }
    let current = '';
    for (const word of paragraph.split(' ')) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(candidate).width > maxWidth) {
        out.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) out.push(current);
  }
  return out;
}

/** A line that is too wide shrinks down to this fraction of its size before it is cut with «…». */
const MIN_SHRINK = 0.72;

/**
 * Sets the canvas font for a single line that must fit `maxWidth` and returns the text to draw:
 * shrinks a little first, then cuts with «…».
 * @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} maxWidth @param {number} size px @param {boolean} [bold]
 */
export function fitLine(ctx, text, maxWidth, size, bold = false) {
  ctx.font = font(size, bold);
  const width = ctx.measureText(text).width;
  if (width <= maxWidth) return text;
  ctx.font = font(size * Math.max(MIN_SHRINK, maxWidth / width), bold);
  return ellipsize(ctx, text, maxWidth);
}

/**
 * Cuts `text` so that it fits `maxWidth` with a trailing «…» (current canvas font).
 * @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} maxWidth @param {boolean} [force] add «…» even if it fits
 */
export function ellipsize(ctx, text, maxWidth, force = false) {
  if (!force && ctx.measureText(text).width <= maxWidth) return text;
  let cut = text.replace(/[\s.,;:]+$/, '');
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1).replace(/[\s.,;:]+$/, '');
  return `${cut}…`;
}
