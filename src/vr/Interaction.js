import * as THREE from 'three';

/**
 * Ray picking shared by XR controllers and the desktop dev mode.
 * The first hit decides: interactive → activate, teleport floor → move, grabbable (userData.grab) → can be
 * grabbed with the grip button / G key, anything else blocks.
 */
export class Interaction {
  /**
   * @param {THREE.Object3D[]} interactive buttons
   * @param {THREE.Object3D[]} floors teleport targets (COL_Floor_*)
   * @param {THREE.Object3D[]} blockers walls
   */
  constructor(interactive, floors, blockers) {
    this.interactive = interactive;
    this.floors = floors;
    this.blockers = blockers;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 25;
    /** @type {THREE.Object3D[]} every pickable object; rebuilt only when a list grows (XR picks twice a frame) */
    this.targets = [];
    this.targetCount = -1;
    /** @type {THREE.Intersection[]} reused hit list */
    this.hits = [];
  }

  /**
   * @param {THREE.Raycaster} raycaster
   * @returns {null | { kind: 'interactive' | 'grabbable' | 'floor' | 'blocked', object: THREE.Object3D, point: THREE.Vector3, distance: number }}
   */
  pick(raycaster = this.raycaster) {
    const count = this.interactive.length + this.floors.length + this.blockers.length;
    if (count !== this.targetCount) {
      this.targets = [...this.interactive, ...this.floors, ...this.blockers];
      this.targetCount = count;
    }
    this.hits.length = 0;
    const hit = raycaster.intersectObjects(this.targets, false, this.hits)[0];
    if (!hit) return null;
    const { object } = hit;
    const kind = object.userData.grab
      ? 'grabbable'
      : object.userData.interactive ? 'interactive' : object.userData.teleport ? 'floor' : 'blocked';
    return { kind, object, point: hit.point, distance: hit.distance };
  }

  /**
   * @param {ReturnType<Interaction['pick']>} hit
   * @param {(point: THREE.Vector3) => void} teleport
   */
  activate(hit, teleport) {
    if (!hit) return;
    if (hit.kind === 'interactive') hit.object.userData.onSelect?.();
    else if (hit.kind === 'floor') teleport(hit.point);
  }
}
