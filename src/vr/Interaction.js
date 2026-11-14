import * as THREE from 'three';

/**
 * Ray picking shared by XR controllers and the desktop dev mode.
 * The first hit decides: interactive → activate, teleport floor → move, anything else blocks.
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
  }

  /**
   * @param {THREE.Raycaster} raycaster
   * @returns {null | { kind: 'interactive' | 'floor' | 'blocked', object: THREE.Object3D, point: THREE.Vector3, distance: number }}
   */
  pick(raycaster = this.raycaster) {
    const hits = raycaster.intersectObjects([...this.interactive, ...this.floors, ...this.blockers], false);
    const hit = hits[0];
    if (!hit) return null;
    const { object } = hit;
    const kind = object.userData.interactive ? 'interactive' : object.userData.teleport ? 'floor' : 'blocked';
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
