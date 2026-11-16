// SHARED (see docs/COLLABORATION.md): room visibility culling (AGENTS.md §7).
// Three.js only culls what is outside the camera frustum, so every station behind a wall was still drawn
// (158–243 draw calls per view). On every render this hides what cannot be seen from where the player's head
// is: the rooms with no line of sight through the doors, and inside a room seen through a door, the stations
// outside the visible slice (rules: src/world/visibilityRules.js). Presentation only.
import * as THREE from 'three';
import { buildPortalGraph, roomAt, visibleSectors, circleSeen } from './visibilityRules.js';

/** Extra footprint radius (m): doors that swing open, a tool lifted off its hook, a hose… */
const FOOTPRINT_MARGIN = 0.35;
const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const _matrix = new THREE.Matrix4();
const _frustum = new THREE.Frustum();

/**
 * @typedef {{
 *   object: THREE.Object3D,
 *   roomId?: string,
 *   window?: THREE.Sphere,
 * }} VisibilityEntry
 *   `roomId`: the room the object belongs to (default: the room that contains its position; objects outside
 *   every room are left alone). `window`: world-space sphere around a window opening — the object is a view
 *   through that window, hidden whenever the opening itself is off screen (its own meshes are not frustum-culled).
 */

/**
 * @param {{ scene: THREE.Scene, layout: any, entries: VisibilityEntry[], isAway?: () => boolean }} o
 *   `entries`: station groups, door signs and window views. `isAway`: true while the player is far from the
 *   base (rover first-person view): every room is hidden.
 */
export function createVisibility({ scene, layout, entries, isAway = () => false }) {
  const graph = buildPortalGraph(layout);
  scene.updateMatrixWorld(true);
  /** @type {{ object: THREE.Object3D, roomId: string, cx: number, cz: number, radius: number, window: THREE.Sphere | null, surfaces: { setCulled(culled: boolean): void }[], shown: boolean }[]} */
  const items = [];
  for (const entry of entries) {
    const { object } = entry;
    object.getWorldPosition(_v);
    const roomId = entry.roomId ?? roomAt(graph.rooms, _v.x, _v.z);
    if (!roomId) continue;
    // Footprint on the floor: bounding circle of everything in the object (or of the window opening).
    let cx = _v.x;
    let cz = _v.z;
    let radius = FOOTPRINT_MARGIN;
    if (entry.window) {
      cx = entry.window.center.x;
      cz = entry.window.center.z;
      radius += entry.window.radius;
    } else if (!_box.setFromObject(object).isEmpty()) {
      cx = (_box.min.x + _box.max.x) / 2;
      cz = (_box.min.z + _box.max.z) / 2;
      radius += Math.hypot(_box.max.x - _box.min.x, _box.max.z - _box.min.z) / 2;
    }
    // Canvas surfaces (panels, buttons) stop redrawing while they are hidden.
    /** @type {{ setCulled(culled: boolean): void }[]} */
    const surfaces = [];
    object.traverse((o) => {
      const surface = o.userData.panel ?? o.userData.button;
      if (surface?.setCulled) surfaces.push(surface);
    });
    items.push({ object, roomId, cx, cz, radius, window: entry.window ?? null, surfaces, shown: true });
  }
  /** @type {Map<string, 'all' | number[][]> | null} what was seen in the last render (null = everything) */
  let sectors = null;
  let shownCount = items.length;
  /** Dev switch (`?nocull`): false draws everything, as before this module existed. */
  let enabled = true;

  /** @param {typeof items[number]} item @param {boolean} shown */
  const setShown = (item, shown) => {
    if (item.shown === shown) return;
    item.shown = shown;
    item.object.visible = shown;
    for (const s of item.surfaces) s.setCulled(!shown);
  };

  /**
   * Hides what the camera cannot see. Runs inside every render (scene.onBeforeRender), with the pose that
   * frame is drawn with — in VR that is the headset pose of this very frame.
   * @param {THREE.Camera} camera the camera being rendered (the XR camera in VR)
   */
  const update = (camera) => {
    const e = camera.matrixWorld.elements;
    const ex = e[12];
    const ez = e[14];
    sectors = !enabled ? null : isAway() ? new Map() : visibleSectors(graph, ex, ez);
    let frustumReady = false;
    shownCount = 0;
    for (const item of items) {
      let shown = sectors === null || circleSeen(sectors.get(item.roomId), ex, ez, item.cx, item.cz, item.radius);
      if (shown && item.window) {
        if (!frustumReady) {
          _frustum.setFromProjectionMatrix(_matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
          frustumReady = true;
        }
        shown = _frustum.intersectsSphere(item.window);
      }
      setShown(item, shown);
      if (shown) shownCount++;
    }
  };
  const previous = scene.onBeforeRender;
  scene.onBeforeRender = (renderer, s, camera, target) => {
    previous.call(scene, renderer, s, camera, target);
    update(camera);
  };

  return {
    graph,
    update,
    get enabled() {
      return enabled;
    },
    set enabled(on) {
      enabled = on;
    },
    /** Rooms seen in the last render (null = all of them). */
    get seen() {
      return sectors ? new Set(sectors.keys()) : null;
    },
    /** Objects (stations, signs, window views) drawn in the last render, and how many there are. */
    get stats() {
      return { shown: shownCount, total: items.length };
    },
  };
}
