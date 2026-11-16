import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Panel, COLORS } from './Panel.js';
import { BUTTON } from './theme.js';
import { Button } from '../objects/Button.js';
import { createMachineTexture } from '../world/textures.js';

/**
 * SHARED (see docs/COLLABORATION.md): helpers every room uses to build its stations.
 * Change it only in a small announced PR — both people depend on it.
 */

/** Panel and button colours shared by all rooms (defined in theme.js). */
export { COLORS, BUTTON };

/** @param {string} status nominal | warning | critical */
export const statusColor = (status) => COLORS[/** @type {'nominal'|'warning'|'critical'} */ (status)] ?? COLORS.text;

/**
 * Label + colour for the "Iniciar turno / Reiniciar" buttons (Control PC and the hub training board).
 * @param {import('../systems/Simulation.js').Simulation} s @param {Function} t
 * @returns {[string, string]}
 */
export function startButtonState(s, t) {
  if (s.phase === 'training') return [t('ui.button.start_shift'), BUTTON.on];
  if (s.phase === 'over' || s.phase === 'won') return [t('ui.button.restart'), BUTTON.danger];
  return [t('ui.button.in_progress'), BUTTON.off];
}

/**
 * Biomonitor content (Control bio panel and the wrist device in main.js).
 * @param {Panel} panel @param {import('../systems/Simulation.js').Simulation} s @param {Function} t
 */
export function renderBio(panel, s, t) {
  const h = s.resources.get('health');
  const causes = Object.keys(s.crew.activeCauses).map((c) => t(`cause.${c}`));
  panel.renderLines(t('ui.bio.title'), [
    { text: t('ui.bio.health', { value: Math.round(h.value) }), color: statusColor(h.status), size: 1.5 },
    { text: t('ui.bio.causes', { list: causes.length ? causes.join(', ') : t('ui.bio.none') }), color: causes.length ? COLORS.critical : COLORS.dim },
    // Cost of switching the lights off: no recovery in the dark.
    ...(s.crew.regenBlocked === 'dark' && h.value < h.max ? [{ text: t('ui.bio.dark'), color: COLORS.warning }] : []),
  ], { border: statusColor(h.status) });
}

/**
 * Creates the per-scene kit passed to every room builder as `kit`.
 * Room builders must only READ simulation state (`kit.sim()`) and emit intents (`kit.game.intent()`).
 * @param {{ game: import('../core/Game.js').Game, t: Function, interactive: THREE.Object3D[], services?: Record<string, any> }} ctx
 */
export function createStationKit({ game, t, interactive, services = {} }) {
  /** @type {Button[]} */
  const buttons = [];
  /** @type {(() => void)[]} */
  const refreshers = [];
  /** @type {((dt: number) => void)[]} */
  const frameFns = [];
  /** @type {THREE.Mesh[]} solid furniture: collision + teleport ray blockers */
  const solids = [];
  /** @type {THREE.Object3D[]} invisible aim volumes of repair points (userData.repairTarget), see RepairPoint.js */
  const repairTargets = [];

  // Props share one machinery texture; materials are cached per tint colour.
  const machineTexture = createMachineTexture();
  /** @type {Map<string, THREE.MeshLambertMaterial>} */
  const propMaterials = new Map();
  const lambert = (/** @type {string} */ color) => {
    let m = propMaterials.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, map: machineTexture });
      propMaterials.set(color, m);
    }
    return m;
  };

  // Static furniture (addBox / addCylinder) is merged into ONE vertex-coloured mesh per station (bakeStatic):
  // the boxes themselves stay as invisible proxies for collision and for blocking the ray.
  const staticMaterial = new THREE.MeshLambertMaterial({ map: machineTexture, vertexColors: true });
  /** @type {{ mesh: THREE.Mesh, color: string }[]} */
  let pendingStatic = [];
  /** @param {THREE.Mesh} m @param {string} color @param {{ dynamic?: boolean }} [opts] */
  const furniture = (m, color, { dynamic = false } = {}) => {
    solids.push(m);
    if (!dynamic) pendingStatic.push({ mesh: m, color });
    return m;
  };
  let refreshCursor = 0;
  let refreshDebt = 0;

  /** Registers a button created by hand (custom placement). @param {Button} b */
  const registerButton = (b) => {
    buttons.push(b);
    interactive.push(b.mesh);
    return b;
  };

  return {
    game,
    t,
    /** Current simulation (it is replaced on restart — always call, never cache). */
    sim: () => game.sim,
    lambert,
    solids,
    /** Aim volumes of broken parts; the tools in hand raycast against them (src/rooms/hub/tools.js). */
    repairTargets,
    registerButton,
    /** Scene-level helpers from main.js: { scene, grab, holsters, floors, renderer, locomotion } (renderer: read-only XR diagnostics; locomotion: head position, read-only). */
    services,

    /** Makes an object pickable by the ray (buttons, grabbable tools). @param {THREE.Object3D} obj */
    registerInteractive(obj) {
      interactive.push(obj);
      return obj;
    },

    /** Called every frame with real seconds (animations). @param {(dt: number) => void} fn */
    onFrame(fn) {
      frameFns.push(fn);
    },

    /** Called at 4 Hz to redraw panels from simulation state. @param {() => void} fn */
    onRefresh(fn) {
      refreshers.push(fn);
    },

    /** Wall push button in station-local coordinates. @param {THREE.Object3D} parent @param {ConstructorParameters<typeof Button>[0]} opts @param {number} x @param {number} y */
    addButton(parent, opts, x, y) {
      const b = new Button(opts);
      const holder = new THREE.Group();
      holder.position.set(x, y, 0);
      holder.add(b.mesh);
      parent.add(holder);
      return registerButton(b);
    },

    /**
     * @param {THREE.Object3D} parent @param {number} w @param {number} h @param {number} [x] @param {number} [y]
     * @param {{ pxPerMeter?: number, minEm?: number }} [opts] canvas resolution (never below the theme default) and smallest text
     */
    addPanel(parent, w, h, x = 0, y = 0, opts = {}) {
      const p = new Panel(w, h, opts);
      p.mesh.position.set(x, y, 0);
      parent.add(p.mesh);
      return p;
    },

    /**
     * Furniture box (station-local, y relative to station height). Solid, and static: boxes added to the station
     * group are merged into one draw call after the station is built. Pass `{ dynamic: true }` as the last
     * argument if you move, hide or recolour the returned mesh later.
     */
    addBox(/** @type {THREE.Object3D} */ parent, w, h, d, x, y, z, color, /** @type {{ dynamic?: boolean }} */ opts = {}) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
      m.position.set(x, y, z);
      parent.add(m);
      return furniture(m, color, opts);
    },

    /** Furniture cylinder (station-local). Solid and static, like `addBox`. */
    addCylinder(/** @type {THREE.Object3D} */ parent, r, h, x, y, z, color, /** @type {{ dynamic?: boolean }} */ opts = {}) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), lambert(color));
      m.position.set(x, y, z);
      parent.add(m);
      return furniture(m, color, opts);
    },

    /**
     * @internal used by Stations.js after each station is built: merges the static furniture added directly to
     * the station group into one mesh (1 draw call). Furniture parented elsewhere keeps its own mesh.
     * @param {THREE.Object3D} g
     */
    _bakeStatic(g) {
      const mine = pendingStatic.filter((e) => e.mesh.parent === g);
      pendingStatic = [];
      if (mine.length === 0) return;
      const parts = mine.map(({ mesh, color }) => {
        mesh.updateMatrix();
        const geo = mesh.geometry.clone().applyMatrix4(mesh.matrix);
        const c = new THREE.Color(color);
        const colors = new Float32Array(geo.attributes.position.count * 3);
        for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geo;
      });
      const merged = new THREE.Mesh(mergeGeometries(parts), staticMaterial);
      merged.name = 'PROP_Static';
      g.add(merged);
      for (const { mesh } of mine) mesh.visible = false; // still a collision box and a ray blocker
    },

    /** @internal used by Stations.js */
    _refreshAll() {
      for (const r of refreshers) r();
    },
    /**
     * @internal used by Stations.js: every refresher still runs once per `period`, but a few per frame in
     * turn instead of all in the same frame (that was a CPU spike four times a second).
     * @param {number} dt real seconds @param {number} period seconds
     */
    _refreshSpread(dt, period) {
      const n = refreshers.length;
      if (n === 0) return;
      refreshDebt = Math.min(n, refreshDebt + (dt / period) * n);
      while (refreshDebt >= 1) {
        refreshDebt -= 1;
        refreshers[refreshCursor]();
        refreshCursor = (refreshCursor + 1) % n;
      }
    },
    /** @internal used by Stations.js @param {number} dt */
    _animate(dt) {
      for (const b of buttons) b.update(dt);
      for (const fn of frameFns) fn(dt);
    },
  };
}

/** @typedef {ReturnType<typeof createStationKit>} StationKit */
