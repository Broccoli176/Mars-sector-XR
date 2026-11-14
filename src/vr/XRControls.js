import * as THREE from 'three';

const SNAP_ANGLE = THREE.MathUtils.degToRad(30);
const STICK_THRESHOLD = 0.7;
const STICK_RESET = 0.3;

/**
 * Quest controllers: ray + trigger to press buttons or teleport onto floors, thumbstick snap turn.
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
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 25;
    /** @type {THREE.Object3D | null} */
    this.leftGrip = null;
    /** @type {(grip: THREE.Object3D) => void} */
    this.onLeftGrip = () => {};

    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.16, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#7cc4ff' }),
    );
    this.reticle.visible = false;
    dolly.parent?.add(this.reticle);

    const gripGeometry = new THREE.BoxGeometry(0.04, 0.03, 0.12);
    const gripMaterial = new THREE.MeshLambertMaterial({ color: '#c9d1d9' });

    this.controllers = [0, 1].map((i) => {
      const controller = renderer.xr.getController(i);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: '#ffcf66' }),
      );
      line.scale.z = 5;
      controller.add(line);
      controller.userData.line = line;
      controller.userData.stickArmed = true;
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
      controller.addEventListener('selectstart', () => this.#select(controller));
      dolly.add(controller);

      const grip = renderer.xr.getControllerGrip(i);
      grip.add(new THREE.Mesh(gripGeometry, gripMaterial));
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

  update() {
    if (!this.renderer.xr.isPresenting) {
      this.reticle.visible = false;
      return;
    }
    let reticleShown = false;
    for (const controller of this.controllers) {
      this.raycaster.setFromXRController(/** @type {any} */ (controller));
      const hit = this.interaction.pick(this.raycaster);
      controller.userData.line.scale.z = hit ? hit.distance : 5;
      if (hit?.kind === 'floor' && !reticleShown) {
        this.reticle.position.copy(hit.point).setY(0.01);
        reticleShown = true;
      }
      this.#snapTurn(controller);
    }
    this.reticle.visible = reticleShown;
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
