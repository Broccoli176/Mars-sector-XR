import * as THREE from 'three';

const LOOK_SPEED = 0.0035;
const DRAG_THRESHOLD = 5; // px

/**
 * Development-only desktop controls (not a gameplay fallback): drag to look,
 * click to press buttons or teleport onto the floor under the cursor.
 * Keyboard movement lives in KeyboardLocomotion (works on desktop and in XR emulators).
 */
export class DesktopControls {
  /**
   * @param {HTMLElement} dom
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Group} dolly
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('./Interaction.js').Interaction} interaction
   * @param {import('./Locomotion.js').Locomotion} locomotion
   */
  constructor(dom, renderer, dolly, camera, interaction, locomotion) {
    this.renderer = renderer;
    this.dolly = dolly;
    this.camera = camera;
    this.interaction = interaction;
    this.locomotion = locomotion;
    this.pitch = 0;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    /** @type {null | { x: number, y: number, moved: boolean }} */
    this.drag = null;

    dom.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY, moved: false };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag || this.renderer.xr.isPresenting) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      this.drag.moved = true;
      this.dolly.rotation.y -= dx * LOOK_SPEED;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * LOOK_SPEED, -1.3, 1.3);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    });
    window.addEventListener('pointerup', (e) => {
      if (this.drag && !this.drag.moved && !this.renderer.xr.isPresenting) this.#click(e, dom);
      this.drag = null;
    });
  }

  /** @param {PointerEvent} e @param {HTMLElement} dom */
  #click(e, dom) {
    const rect = dom.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.interaction.pick(this.raycaster);
    this.interaction.activate(hit, (p) => this.locomotion.teleport(p));
  }

  update() {
    if (this.renderer.xr.isPresenting) return;
    this.camera.rotation.set(this.pitch, 0, 0);
  }
}
