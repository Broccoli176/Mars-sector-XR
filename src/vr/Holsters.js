import * as THREE from 'three';

// SHARED (see docs/COLLABORATION.md): two hip holsters that follow the player's body (spec §9.3).
// They hang below the head and turn with the head's yaw: body-attached, NOT a head-locked HUD.
const _head = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Holsters {
  /**
   * @param {THREE.Object3D} scene
   * @param {import('./Locomotion.js').Locomotion} locomotion
   * @param {{ belowHeadMeters: number, sideOffsetMeters: number, forwardOffsetMeters: number }} cfg
   */
  constructor(scene, locomotion, cfg) {
    this.locomotion = locomotion;
    this.cfg = cfg;
    const ringGeometry = new THREE.TorusGeometry(0.06, 0.006, 6, 24).rotateX(Math.PI / 2);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: '#ffcf66', transparent: true, opacity: 0.35, depthWrite: false });
    /** @type {{ id: string, side: number, socket: THREE.Object3D, item: string | null }[]} */
    this.slots = [-1, 1].map((side) => {
      const socket = new THREE.Group();
      socket.name = side < 0 ? 'SKT_Holster_L' : 'SKT_Holster_R';
      socket.add(new THREE.Mesh(ringGeometry, ringMaterial));
      scene.add(socket);
      return { id: socket.name, side, socket, item: null };
    });
  }

  /** Call once per frame (after locomotion, before render). */
  update() {
    this.locomotion.headWorld(_head);
    this.locomotion.headForward(_fwd);
    if (_fwd.lengthSq() === 0) _fwd.set(0, 0, -1);
    _right.crossVectors(_fwd, UP).normalize();
    const yaw = Math.atan2(-_fwd.x, -_fwd.z);
    for (const slot of this.slots) {
      slot.socket.position
        .copy(_head)
        .addScaledVector(UP, -this.cfg.belowHeadMeters)
        .addScaledVector(_right, slot.side * this.cfg.sideOffsetMeters)
        .addScaledVector(_fwd, this.cfg.forwardOffsetMeters);
      slot.socket.rotation.set(0, yaw, 0);
    }
  }

  /** Positions + occupancy for the release rules. */
  snapshot() {
    return this.slots.map((s) => ({ position: s.socket.position.clone(), item: s.item }));
  }
}
