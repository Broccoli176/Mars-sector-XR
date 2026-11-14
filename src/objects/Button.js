import * as THREE from 'three';

const SIDE_MATERIAL = new THREE.MeshLambertMaterial({ color: '#2a3138' });

/**
 * Physical push button with a canvas label on its front face.
 * Interaction code calls `userData.onSelect()`; the button never touches simulation state itself.
 */
export class Button {
  /**
   * @param {{ width?: number, height?: number, depth?: number, label: string, color?: string, onSelect: () => void }} opts
   */
  constructor({ width = 0.14, height = 0.09, depth = 0.05, label, color = '#2f6fb3', onSelect }) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = Math.max(64, Math.round((256 * height) / width));
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const front = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    // BoxGeometry material order: +x, -x, +y, -y, +z (front), -z
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), [
      SIDE_MATERIAL, SIDE_MATERIAL, SIDE_MATERIAL, SIDE_MATERIAL, front, SIDE_MATERIAL,
    ]);
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
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = Math.round(canvas.height * 0.42);
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    while (ctx.measureText(label).width > canvas.width * 0.9 && size > 12) {
      size -= 2;
      ctx.font = `bold ${size}px system-ui, sans-serif`;
    }
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);
    this.texture.needsUpdate = true;
  }

  /** Press animation. @param {number} dt */
  update(dt) {
    if (this.pressTime > 0) this.pressTime = Math.max(0, this.pressTime - dt);
    const pressed = this.pressTime > 0 ? this.depth * 0.6 : 0;
    this.mesh.position.z = this.depth / 2 + 0.005 - pressed;
  }
}
