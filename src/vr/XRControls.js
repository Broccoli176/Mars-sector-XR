import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

const RAY_COLOR = '#ffcf66';
const RAY_RADIUS = 0.004;
const DEFAULT_RAY_LENGTH = 5;
const SNAP_ANGLE = THREE.MathUtils.degToRad(30);
const STICK_THRESHOLD = 0.7;
const STICK_RESET = 0.3;
const GRAB_RANGE = 3; // m — prototype ray grab (direct grab is the spec target)
const BELT_BUTTON = 5; // xr-standard: B (right) / Y (left) — stow/draw a tool on the belt

/**
 * Quest controllers: ray + trigger to press buttons or teleport onto floors, grip button to grab/release
 * tools (src/vr/Grab.js), thumbstick snap turn. While holding an object with `onUse`, the trigger uses it.
 * B/Y: stow the held tool in the belt holster on that side, or draw one with an empty hand (src/vr/Holsters.js).
 * Prototype note: physical controls are pressed with the ray; direct grab comes later (AGENTS.md §2).
 */
export class XRControls {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Group} dolly
   * @param {import('./Interaction.js').Interaction} interaction
   * @param {import('./Locomotion.js').Locomotion} locomotion
   */
  constructor(renderer, dolly, interaction, locomotion) {
    this.renderer = renderer;
    this.interaction = interaction;
    this.locomotion = locomotion;
    this.rover2Control = false;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 25;
    /** @type {THREE.Object3D | null} */
    this.leftGrip = null;
    /** @type {(grip: THREE.Object3D) => void} */
    this.onLeftGrip = () => {};
    /** @type {import('./Grab.js').Grab | null} set by main.js */
    this.grab = null;
    /** @type {import('./Holsters.js').Holsters | null} set by main.js */
    this.holsters = null;

    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.16, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#7cc4ff' }),
    );
    this.reticle.visible = false;
    dolly.parent?.add(this.reticle);

    // Real controller models (Quest Touch profiles fetched from the WebXR input-profiles CDN),
    // with a simple box shown until the model has loaded (or if it cannot load offline).
    const modelFactory = new XRControllerModelFactory();
    const fallbackGeometry = new THREE.BoxGeometry(0.04, 0.03, 0.12);
    const fallbackMaterial = new THREE.MeshLambertMaterial({ color: '#c9d1d9' });
    // Thick ray (1 px GL lines are nearly invisible in emulators) + hit dot.
    const rayGeometry = new THREE.CylinderGeometry(RAY_RADIUS, RAY_RADIUS, 1, 8, 1, true)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -0.5);
    const rayMaterial = new THREE.MeshBasicMaterial({ color: RAY_COLOR, transparent: true, opacity: 0.85 });
    const dotGeometry = new THREE.SphereGeometry(0.012, 12, 8);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: RAY_COLOR });
    /** @type {{ model: THREE.Object3D, fallback: THREE.Object3D }[]} */
    this.gripModels = [];

    this.controllers = [0, 1].map((i) => {
      const controller = renderer.xr.getController(i);
      const line = new THREE.Mesh(rayGeometry, rayMaterial);
      line.scale.z = DEFAULT_RAY_LENGTH;
      controller.add(line);
      controller.userData.line = line;
      const dot = new THREE.Mesh(dotGeometry, dotMaterial);
      dot.visible = false;
      controller.add(dot);
      controller.userData.dot = dot;
      controller.userData.stickArmed = true;
      controller.userData.beltDown = false;
      controller.addEventListener('connected', (e) => {
        controller.userData.inputSource = e.data;
        if (e.data.handedness === 'left') {
          this.leftGrip = grip;
          this.onLeftGrip(grip);
        }
      });
      controller.addEventListener('disconnected', () => {
        controller.userData.inputSource = null;
      });
      controller.addEventListener('selectstart', () => {
        if (this.rover2Control) return;
        if (this.grab?.use('xr' + i, true)) return; // held object with onUse (hose…) takes the trigger
        this.#select(controller);
      });
      controller.addEventListener('selectend', () => this.grab?.use('xr' + i, false));
      controller.addEventListener('squeezestart', () => this.#squeeze(controller, grip, 'xr' + i));
      controller.addEventListener('squeezeend', () => this.grab?.release('xr' + i));
      dolly.add(controller);

      const grip = renderer.xr.getControllerGrip(i);
      controller.userData.grip = grip;
      const model = modelFactory.createControllerModel(grip);
      const fallback = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
      grip.add(model, fallback);
      this.gripModels.push({ model, fallback });
      dolly.add(grip);
      return controller;
    });
  }

  /** @param {THREE.Object3D} controller */
  #select(controller) {
    this.raycaster.setFromXRController(/** @type {any} */ (controller));
    const hit = this.interaction.pick(this.raycaster);
    this.interaction.activate(hit, (p) => this.locomotion.teleport(p));
  }

  /** Grip button: grab the grabbable object under the ray. @param {THREE.Object3D} controller @param {THREE.Object3D} grip @param {string} handId */
  #squeeze(controller, grip, handId) {
    if (!this.grab) return;
    this.raycaster.setFromXRController(/** @type {any} */ (controller));
    const hit = this.interaction.pick(this.raycaster);
    if (hit?.kind === 'grabbable' && hit.distance <= GRAB_RANGE) this.grab.grab(hit.object, grip, handId);
  }

  update() {
    if (!this.renderer.xr.isPresenting) {
      this.reticle.visible = false;
      return;
    }
    for (const { model, fallback } of this.gripModels) fallback.visible = model.children.length === 0;
    let reticleShown = false;
    for (const controller of this.controllers) {
      this.raycaster.setFromXRController(/** @type {any} */ (controller));
      const hit = this.interaction.pick(this.raycaster);
      const length = hit ? hit.distance : DEFAULT_RAY_LENGTH;
      controller.userData.line.scale.z = length;
      controller.userData.dot.visible = Boolean(hit);
      controller.userData.dot.position.set(0, 0, -length);
      if (hit?.kind === 'floor' && !reticleShown) {
        this.reticle.position.copy(hit.point).setY(0.01);
        reticleShown = true;
      }
      if (!this.rover2Control) {
        this.#snapTurn(controller);
        this.#beltButton(controller, this.controllers.indexOf(controller));
      }
    }
    this.reticle.visible = reticleShown;
  }

  /** @param {boolean} active */
  setRover2Control(active) {
    this.rover2Control = active;
  }

  /** @returns {{ drive: number, turn: number, cleanPressed: boolean, exitPressed: boolean }} */
  getRover2Input() {
    const sources = this.controllers.map((controller) => controller.userData.inputSource);
    const left = sources.find((source) => source?.handedness === 'left');
    const buttonsPressed = (index) => sources.some((source) => Boolean(source?.gamepad?.buttons[index]?.pressed));
    const gamepad = left?.gamepad;
    if (!gamepad) {
      return { drive: 0, turn: 0, cleanPressed: buttonsPressed(4), exitPressed: buttonsPressed(5) };
    }
    const axes = gamepad.axes;
    const stickX = axes.length >= 4 ? axes[2] : axes[0];
    const stickY = axes.length >= 4 ? axes[3] : axes[1];
    return {
      drive: Math.abs(stickY ?? 0) > 0.15 ? -(stickY ?? 0) : 0,
      turn: Math.abs(stickX ?? 0) > 0.15 ? stickX ?? 0 : 0,
      cleanPressed: buttonsPressed(4),
      exitPressed: buttonsPressed(5),
    };
  }

  /** B/Y pressed (edge): stow or draw on the belt, with a haptic tick. @param {THREE.Object3D} controller @param {number} i */
  #beltButton(controller, i) {
    const source = controller.userData.inputSource;
    const pressed = Boolean(source?.gamepad?.buttons[BELT_BUTTON]?.pressed);
    if (pressed && !controller.userData.beltDown && this.holsters) {
      const side = source.handedness === 'left' ? -1 : 1;
      const ok = this.holsters.toggle('xr' + i, side, controller.userData.grip);
      pulse(source, ok ? 0.6 : 0.15, ok ? 60 : 25);
    }
    controller.userData.beltDown = pressed;
  }

  /** @param {THREE.Object3D} controller */
  #snapTurn(controller) {
    const gamepad = controller.userData.inputSource?.gamepad;
    if (!gamepad) return;
    const x = gamepad.axes[2] ?? gamepad.axes[0] ?? 0;
    if (controller.userData.stickArmed && Math.abs(x) > STICK_THRESHOLD) {
      controller.userData.stickArmed = false;
      this.locomotion.rotate(x > 0 ? -SNAP_ANGLE : SNAP_ANGLE);
    } else if (Math.abs(x) < STICK_RESET) {
      controller.userData.stickArmed = true;
    }
  }
}

/** Short vibration on the controller, if supported. @param {any} source XRInputSource @param {number} intensity @param {number} ms */
function pulse(source, intensity, ms) {
  try {
    source?.gamepad?.hapticActuators?.[0]?.pulse?.(intensity, ms);
  } catch {
    // haptics are optional
  }
}
