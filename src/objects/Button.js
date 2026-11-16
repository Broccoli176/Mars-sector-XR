import * as THREE from 'three';
import { BUTTON, font } from '../ui/theme.js';

/** Housing colour (rim around the label and the sides). Unlit: it is what the old lit housing looked like. */
const BODY_COLOR = '#22272d';
const LABEL_INSET = 0.012; // m of housing rim visible around the label
/** Label resolution (px per metre of label), capped: sharp at arm's length on Quest 3 without wasting memory. */
const LABEL_PX_PER_M = 2800;
const LABEL_MAX_PX = 384;

/**
 * Physical push button drawn with ONE draw call: a box whose front face shows a canvas (housing rim + label) and
 * whose other faces sample the rim colour of the same canvas. 61 buttons used to cost 122 draw calls.
 * Interaction code calls `userData.onSelect()`; the button never touches simulation state itself.
 */
export class Button {
  /**
   * @param {{ width?: number, height?: number, depth?: number, label: string, color?: string, onSelect: () => void }} opts
   */
  constructor({ width = 0.14, height = 0.09, depth = 0.05, label, color = BUTTON.action, onSelect }) {
    this.canvas = document.createElement('canvas');
    // The canvas has the aspect of the whole front face, so glyphs are never squashed.
    const faceW = Math.max(0.01, width - LABEL_INSET * 2);
    const labelPx = Math.min(LABEL_MAX_PX, Math.round(faceW * LABEL_PX_PER_M));
    const pxPerM = labelPx / faceW;
    this.canvas.width = Math.max(32, Math.round(width * pxPerM));
    this.canvas.height = Math.max(24, Math.round(height * pxPerM));
    /** Rim width in canvas pixels. */
    this.rim = Math.min(LABEL_INSET * pxPerM, this.canvas.width * 0.4, this.canvas.height * 0.4);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4; // desk buttons are read at a grazing angle

    // Box faces are built in the order +x, −x, +y, −y, +z, −z (4 vertices each). The front (+z) keeps its
    // 0…1 UVs; every other face collapses onto one texel in the middle of the top rim (housing colour).
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const uv = geometry.attributes.uv;
    const rimV = 1 - this.rim / 2 / this.canvas.height;
    for (let i = 0; i < uv.count; i++) if (i < 16 || i >= 20) uv.setXY(i, 0.5, rimV);
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    this.mesh.position.z = depth / 2 + 0.005;
    this.mesh.userData.interactive = true;
    this.mesh.userData.onSelect = () => {
      this.pressTime = 0.15;
      onSelect();
    };
    this.mesh.userData.button = this;
    this.depth = depth;
    this.pressTime = 0;
    this.key = '';
    /** Set by src/world/Visibility.js while the button's room is hidden: drawing waits until it is shown again. */
    this.culled = false;
    /** @type {[string, string] | null} label and colour requested while hidden */
    this.pending = null;
    this.setState(label, color);
  }

  /** @param {string} label @param {string} color */
  setState(label, color) {
    const key = `${label}|${color}`;
    if (key === this.key) {
      this.pending = null;
      return;
    }
    if (this.culled) {
      this.pending = [label, color];
      return;
    }
    this.key = key;
    this.pending = null;
    const { ctx, canvas, rim } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = BODY_COLOR;
    ctx.fillRect(0, 0, W, H);
    const w = W - rim * 2;
    const h = H - rim * 2;
    // Soft vertical gradient reads as a slightly convex key cap. It only darkens: the label keeps its contrast.
    const g = ctx.createLinearGradient(0, rim, 0, rim + h);
    const base = new THREE.Color(color);
    g.addColorStop(0, `#${base.getHexString()}`);
    g.addColorStop(1, `#${base.clone().offsetHSL(0, 0, -0.08).getHexString()}`);
    ctx.fillStyle = g;
    ctx.fillRect(rim, rim, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(rim, rim, w, Math.max(3, h * 0.035));
    ctx.fillStyle = BUTTON.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = Math.round(h * 0.44);
    ctx.font = font(size, true);
    while (ctx.measureText(label).width > w * 0.88 && size > 14) {
      size -= 2;
      ctx.font = font(size, true);
    }
    ctx.fillText(label, W / 2, H / 2 + 2);
    this.texture.needsUpdate = true;
  }

  /** Room shown/hidden (src/world/Visibility.js): on show, draws what was requested while hidden. @param {boolean} culled */
  setCulled(culled) {
    this.culled = culled;
    if (culled || !this.pending) return;
    const [label, color] = this.pending;
    this.setState(label, color);
  }

  /** Press animation. @param {number} dt */
  update(dt) {
    if (this.pressTime > 0) this.pressTime = Math.max(0, this.pressTime - dt);
    const pressed = this.pressTime > 0 ? this.depth * 0.6 : 0;
    this.mesh.position.z = this.depth / 2 + 0.005 - pressed;
  }
}
