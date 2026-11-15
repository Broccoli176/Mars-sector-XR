import * as THREE from 'three';

const LOOK_SPEED = 0.0035;
const DRAG_THRESHOLD = 5; // px
const GRAB_RANGE = 3; // m

/**
 * Development-only desktop controls (not a gameplay fallback): drag to look,
 * click to press buttons or teleport onto the floor under the cursor, G to grab/release the tool under the cursor,
 * hold F to use the held object (e.g. spray with the hydro hose), R to flip the held object, H = belt (stow/draw).
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
    this.rover2Control = false;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    /** @type {null | { x: number, y: number, moved: boolean }} */
    this.drag = null;
    /** @type {import('./Grab.js').Grab | null} set by main.js */
    this.grab = null;
    /** @type {import('./Holsters.js').Holsters | null} set by main.js */
    this.holsters = null;
    // Desktop "hand": an anchor in front of the camera, bottom-right of the view.
    this.hand = new THREE.Group();
    this.hand.position.set(0.22, -0.2, -0.45);
    camera.add(this.hand);
    /** Last pointer position in normalized device coordinates (for G). */
    this.lastPointer = new THREE.Vector2(0, 0);

    dom.addEventListener('pointermove', (e) => {
      const rect = dom.getBoundingClientRect();
      this.lastPointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && !e.repeat && !this.renderer.xr.isPresenting) this.grab?.use('desktop', true);
      // R flips the held object (e.g. a diode's orientation at the electronics bench; in XR you turn your wrist).
      if (e.code === 'KeyR' && !e.repeat && !this.renderer.xr.isPresenting) this.grab?.held.get('desktop')?.rotateY(Math.PI);
      // H = belt button (B/Y in XR): stow the held tool, or draw one with an empty hand (right side first).
      if (e.code === 'KeyH' && !e.repeat && !this.renderer.xr.isPresenting) this.holsters?.toggle('desktop', 1, this.hand);
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyF') this.grab?.use('desktop', false);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyG' || e.repeat || this.renderer.xr.isPresenting || !this.grab) return;
      if (this.grab.isHolding('desktop')) {
        this.grab.release('desktop');
        return;
      }
      this.raycaster.setFromCamera(this.lastPointer, this.camera);
      const hit = this.interaction.pick(this.raycaster);
      if (hit?.kind === 'grabbable' && hit.distance <= GRAB_RANGE) this.grab.grab(hit.object, this.hand, 'desktop');
    });

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
    if (this.rover2Control) return;
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

  /** @param {boolean} active */
  setRover2Control(active) {
    this.rover2Control = active;
  }
}
