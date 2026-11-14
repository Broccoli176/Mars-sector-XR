import * as THREE from 'three';

// SHARED (see docs/COLLABORATION.md): generic hand-held objects for XR grips and the desktop dev hand.
const HAND_POSE = { position: new THREE.Vector3(0, -0.01, -0.04), rotation: new THREE.Euler(0, 0, 0) };
const _pos = new THREE.Vector3();

/**
 * Keeps at most one object per hand. Objects opt in with
 * `userData.grab = { onGrab(handId), onRelease(worldPosition, handId), onUse?(active, handId) }`;
 * `onUse` makes the trigger act on the held object (e.g. the hydro hose sprays) instead of the ray.
 * the owner decides where a released object goes (socket, wall, drop…).
 * Tools are modelled with the grip at the origin and pointing along −z (like the controller).
 */
export class Grab {
  /** @param {THREE.Object3D} scene root used while an object is free */
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, THREE.Object3D>} */
    this.held = new Map();
  }

  /** @param {string} handId */
  isHolding(handId) {
    return this.held.has(handId);
  }

  /**
   * @param {THREE.Object3D} object @param {THREE.Object3D} hand grip or desktop anchor @param {string} handId
   */
  grab(object, hand, handId) {
    if (!object.userData.grab) return false;
    for (const [id, o] of this.held) if (o === object) this.held.delete(id); // hand-to-hand transfer
    if (this.held.has(handId)) this.release(handId);
    hand.add(object);
    object.position.copy(HAND_POSE.position);
    object.rotation.copy(HAND_POSE.rotation);
    this.held.set(handId, object);
    object.userData.grab.onGrab?.(handId);
    return true;
  }

  /**
   * Trigger while holding: forwards to the held object's `onUse`. Returns true if it handled it
   * (then the caller must not use the trigger for the ray). Releasing always forwards `false`.
   * @param {string} handId @param {boolean} active
   */
  use(handId, active) {
    const onUse = this.held.get(handId)?.userData.grab.onUse;
    if (!onUse) return false;
    onUse(active, handId);
    return true;
  }

  /** @param {string} handId */
  release(handId) {
    const object = this.held.get(handId);
    if (!object) return;
    object.userData.grab.onUse?.(false, handId); // never keep "using" an object that left the hand
    this.held.delete(handId);
    object.getWorldPosition(_pos);
    this.scene.attach(object);
    object.userData.grab.onRelease?.(_pos.clone(), handId);
  }
}
