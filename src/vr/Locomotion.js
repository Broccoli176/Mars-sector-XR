import * as THREE from 'three';

const _head = new THREE.Vector3();
const _after = new THREE.Vector3();

/**
 * Moves the player rig (dolly) so the head lands on a target, and snap-turns around the head.
 * Works for both the XR camera and the desktop camera.
 */
export class Locomotion {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Group} dolly
   * @param {THREE.PerspectiveCamera} camera
   */
  constructor(renderer, dolly, camera) {
    this.renderer = renderer;
    this.dolly = dolly;
    this.camera = camera;
  }

  /**
   * Head position in world space. Always use the user camera: in XR three.js copies the headset pose
   * into it (child of the dolly). The internal XR ArrayCamera has no parent, so recomputing its
   * world matrix would drop the dolly transform.
   * @param {THREE.Vector3} out
   */
  headWorld(out) {
    this.camera.updateMatrixWorld(true);
    return out.setFromMatrixPosition(this.camera.matrixWorld);
  }

  /** Head forward direction flattened to the floor (unit vector, or zero if looking straight up/down). @param {THREE.Vector3} out */
  headForward(out) {
    this.camera.updateMatrixWorld(true);
    this.camera.getWorldDirection(out);
    out.y = 0;
    return out.lengthSq() < 1e-6 ? out.set(0, 0, 0) : out.normalize();
  }

  /** @param {THREE.Vector3} point floor point */
  teleport(point) {
    this.headWorld(_head);
    this.dolly.position.x += point.x - _head.x;
    this.dolly.position.z += point.z - _head.z;
  }

  /** @param {number} radians */
  rotate(radians) {
    this.headWorld(_head);
    this.dolly.rotation.y += radians;
    this.dolly.updateMatrixWorld(true);
    this.headWorld(_after);
    this.dolly.position.x += _head.x - _after.x;
    this.dolly.position.z += _head.z - _after.z;
  }
}
