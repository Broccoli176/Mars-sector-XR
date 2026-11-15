import * as THREE from 'three';
import { BUTTON, font } from '../ui/theme.js';

// Shared by every button: one body material → 1 draw call per body, 1 per label face.
const BODY_MATERIAL = new THREE.MeshLambertMaterial({ color: '#30373e' });
const LABEL_INSET = 0.012; // m of body rim visible around the label

/**
 * Physical push button: a housing box plus a canvas label face on its front.
 * Interaction code calls `userData.onSelect()`; the button never touches simulation state itself.
 */
export class Button {
  /**
   * @param {{ width?: number, height?: number, depth?: number, label: string, color?: string, onSelect: () => void }} opts
   */
  constructor({ width = 0.14, height = 0.09, depth = 0.05, label, color = BUTTON.action, onSelect }) {
    this.canvas = document.createElement('canvas');
    // The canvas has the aspect of the label face (not of the housing), so glyphs are never squashed.
    const faceW = Math.max(0.01, width - LABEL_INSET * 2);
    const faceH = Math.max(0.01, height - LABEL_INSET * 2);
    this.canvas.width = 384;
    this.canvas.height = Math.max(72, Math.round((384 * faceH) / faceW));
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4; // desk buttons are read at a grazing angle

    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), BODY_MATERIAL);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(faceW, faceH),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }),
    );
    face.position.z = depth / 2 + 0.001;
    this.mesh.add(face);
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
    this.setState(label, color);
  }

  /** @param {string} label @param {string} color */
  setState(label, color) {
    const key = `${label}|${color}`;
    if (key === this.key) return;
    this.key = key;
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    // Soft vertical gradient reads as a slightly convex key cap. It only darkens: the label keeps its contrast.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const base = new THREE.Color(color);
    g.addColorStop(0, `#${base.getHexString()}`);
    g.addColorStop(1, `#${base.clone().offsetHSL(0, 0, -0.08).getHexString()}`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, 0, W, Math.max(3, H * 0.035));
    ctx.fillStyle = BUTTON.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = Math.round(H * 0.44);
    ctx.font = font(size, true);
    while (ctx.measureText(label).width > W * 0.88 && size > 18) {
      size -= 2;
      ctx.font = font(size, true);
    }
    ctx.fillText(label, W / 2, H / 2 + 2);
    this.texture.needsUpdate = true;
  }

  /** Press animation. @param {number} dt */
  update(dt) {
    if (this.pressTime > 0) this.pressTime = Math.max(0, this.pressTime - dt);
    const pressed = this.pressTime > 0 ? this.depth * 0.6 : 0;
    this.mesh.position.z = this.depth / 2 + 0.005 - pressed;
  }
}
