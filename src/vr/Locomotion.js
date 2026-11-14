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

  /** @param {THREE.Vector3} out */
  headWorld(out) {
    const cam = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
    cam.updateMatrixWorld(true);
    return out.setFromMatrixPosition(cam.matrixWorld);
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
