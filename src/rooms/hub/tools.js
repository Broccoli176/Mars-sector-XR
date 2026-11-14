// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Hand tools on the hub tool wall (spec §6.1, §9.3): grabbable, holsterable, droppable.
// Config: src/data/balance/hub.json · Texts: src/data/strings/es/hub.json · Rules: ./toolRules.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../../ui/StationKit.js';
import { decideRelease, shouldReturnHome, updateT1 } from './toolRules.js';

const TOOL_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });
const HOT_TIP_MATERIAL = new THREE.MeshBasicMaterial({ color: '#ff7a2f', toneMapped: false });
const GRAVITY = 9.8; // m/s² (Earth-like feel; kinematic drop only, no physics engine — spec D11)
const HOOK_XS = [-0.45, -0.15, 0.15, 0.45];
const HOOK_Y = 0.2;
const HOOK_Z = 0.07;
const _pos = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);

/** @param {THREE.BufferGeometry} geo @param {THREE.ColorRepresentation} color */
function paint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geo;
}
/** Cylinder along the tool axis (−z forward). */
const rod = (/** @type {number} */ r1, /** @type {number} */ r2, /** @type {number} */ len) =>
  new THREE.CylinderGeometry(r1, r2, len, 10).rotateX(Math.PI / 2);

/**
 * Procedural low-poly tool, grip at the origin, pointing along −z. One merged mesh (1 draw call).
 * @param {string} id @param {string} color @param {string} accent
 */
export function toolGeometry(id, color, accent) {
  /** @type {[THREE.BufferGeometry, string][]} */
  let parts;
  switch (id) {
    case 'wrench':
      parts = [
        [new THREE.BoxGeometry(0.026, 0.012, 0.17).translate(0, 0, -0.07), color],
        [new THREE.CylinderGeometry(0.034, 0.034, 0.014, 12).translate(0, 0, -0.17), accent],
        [new THREE.BoxGeometry(0.03, 0.016, 0.05).translate(0, 0, 0.02), accent],
      ];
      break;
    case 'screwdriver':
      parts = [
        [rod(0.017, 0.015, 0.1), accent],
        [rod(0.004, 0.004, 0.13).translate(0, 0, -0.115), color],
        [new THREE.BoxGeometry(0.008, 0.003, 0.012).translate(0, 0, -0.185), color],
      ];
      break;
    case 'solder_iron':
      parts = [
        [rod(0.015, 0.013, 0.11), accent],
        [rod(0.007, 0.006, 0.07).translate(0, 0, -0.09), color],
      ];
      break;
    case 'sealant_gun':
    default:
      parts = [
        [new THREE.BoxGeometry(0.045, 0.06, 0.15).translate(0, 0.04, -0.06), color],
        [new THREE.BoxGeometry(0.028, 0.085, 0.035).translate(0, -0.02, 0), accent],
        [rod(0.008, 0.005, 0.08).translate(0, 0.045, -0.17), accent],
      ];
  }
  return mergeGeometries(parts.map(([g, c]) => paint(g, c)));
}

/**
 * Builds the tool wall: pegboard panel + 4 tools on hooks, and wires grab/holster/drop behaviour.
 * @param {THREE.Group} g station group (south wall of the hub)
 * @param {import('../../ui/StationKit.js').StationKit} kit
 * @param {{ t1: ReturnType<typeof import('./toolRules.js').createT1> }} hubState shared with the training board
 */
export function buildToolWall(g, kit, hubState) {
  const { t, game } = kit;
  const { grab, holsters, floors } = kit.services;
  const cfg = game.data.balance;
  const tools = cfg.tools;
  const components = cfg.components;

  // Pegboard with outlines, names and what each tool repairs (static canvas).
  const panel = kit.addPanel(g, 1.2, 0.72);
  panel.renderCustom('toolwall', (ctx, W, H) => {
    ctx.fillStyle = '#2b3138';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; // pegboard holes
    for (let y = H * 0.16; y < H * 0.97; y += H * 0.06) for (let x = W * 0.03; x < W; x += W * 0.04) ctx.fillRect(x, y, 3, 3);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 5;
    ctx.strokeRect(2.5, 2.5, W - 5, H - 5);
    ctx.fillStyle = COLORS.title;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `bold ${Math.round(H * 0.075)}px system-ui, sans-serif`;
    ctx.fillText(t('hub.toolwall.title'), W / 2, H * 0.03);
    ctx.fillStyle = COLORS.dim;
    ctx.font = `${Math.round(H * 0.036)}px system-ui, sans-serif`;
    ctx.fillText(t('hub.toolwall.hint'), W / 2, H * 0.92, W * 0.94);
    tools.forEach((tool, i) => {
      const cx = W / 2 + (HOOK_XS[i] / 1.2) * W;
      ctx.strokeStyle = 'rgba(255,207,102,0.5)'; // outline where the tool hangs
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(cx - W * 0.09, H * 0.17, W * 0.18, H * 0.4);
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.text;
      ctx.font = `bold ${Math.round(H * 0.052)}px system-ui, sans-serif`;
      ctx.fillText(t(tool.nameKey), cx, H * 0.62, W * 0.24);
      ctx.fillStyle = COLORS.dim;
      ctx.font = `${Math.round(H * 0.038)}px system-ui, sans-serif`;
      const repairs = components.filter((c) => c.toolId === tool.id).map((c) => t(c.nameKey));
      repairs.forEach((name, j) => ctx.fillText(name, cx, H * (0.71 + j * 0.065), W * 0.24));
    });
  });

  const raycaster = new THREE.Raycaster();
  let now = performance.now() / 1000;

  /** @type {{ id: string, mesh: THREE.Mesh, slot: THREE.Object3D, place: string, holster: number | null, landedAt: number | null, vy: number, floorY: number, forceHolster: number | null }[]} */
  const items = tools.map((tool, i) => {
    const slot = new THREE.Group();
    slot.position.set(HOOK_XS[i], HOOK_Y, HOOK_Z);
    slot.rotation.x = -Math.PI / 2; // hang pointing down
    g.add(slot);
    const mesh = new THREE.Mesh(toolGeometry(tool.id, tool.color, tool.accent), TOOL_MATERIAL);
    mesh.name = tool.assetId;
    if (tool.id === 'solder_iron') {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.04, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.145), HOT_TIP_MATERIAL);
      mesh.add(tip);
    }
    slot.add(mesh);
    kit.registerInteractive(mesh);
    const item = { id: tool.id, mesh, slot, place: 'wall', holster: /** @type {number | null} */ (null), landedAt: /** @type {number | null} */ (null), vy: 0, floorY: 0, forceHolster: /** @type {number | null} */ (null) };
    mesh.userData.toolId = tool.id;
    mesh.userData.holsterable = true; // belt rings light up while it is held
    mesh.userData.grab = {
      onGrab: (/** @type {string} */ hand) => onGrab(item, hand),
      onRelease: (/** @type {THREE.Vector3} */ pos) => onRelease(item, pos),
    };
    return item;
  });

  /** @param {typeof items[number]} item */
  const returnHome = (item) => {
    item.slot.add(item.mesh);
    item.mesh.position.set(0, 0, 0);
    item.mesh.rotation.set(0, 0, 0);
    item.place = 'wall';
    item.landedAt = null;
  };

  /** @param {typeof items[number]} item @param {string} hand */
  const onGrab = (item, hand) => {
    const wasOnFloor = item.place === 'floor' || item.place === 'falling';
    if (item.holster !== null) holsters.slots[item.holster].item = null;
    item.holster = null;
    item.place = 'hand';
    item.landedAt = null;
    updateT1(hubState.t1, 'grab', { wasOnFloor });
    game.intent('item:grab', { itemId: item.id, hand });
  };

  /** @param {typeof items[number]} item @param {THREE.Vector3} pos */
  const onRelease = (item, pos) => {
    item.slot.getWorldPosition(_pos);
    // Belt button: straight into the chosen holster, wherever the hand is.
    const forced = item.forceHolster;
    item.forceHolster = null;
    const decision = forced !== null ? { kind: /** @type {const} */ ('holster'), index: forced } : decideRelease(pos, {
      holsters: holsters.snapshot(),
      home: _pos,
      holsterRadius: cfg.holster.snapRadiusMeters,
      wallRadius: cfg.toolWall.snapRadiusMeters,
    });
    if (decision.kind === 'holster') {
      const slot = holsters.slots[decision.index];
      slot.socket.add(item.mesh);
      item.mesh.position.set(0, -0.03, 0);
      item.mesh.rotation.set(-Math.PI / 2, 0, 0);
      slot.item = item.id;
      item.holster = decision.index;
      item.place = 'holster';
      updateT1(hubState.t1, 'holster');
      game.intent('item:socket', { itemId: item.id, slot: slot.id });
      return;
    }
    if (decision.kind === 'wall') {
      returnHome(item);
      game.intent('item:socket', { itemId: item.id, slot: 'toolwall' });
      return;
    }
    // Drop: fall straight down onto the floor under it (no physics engine, spec D11).
    raycaster.set(pos.clone().add(new THREE.Vector3(0, 0.05, 0)), _down);
    const hit = raycaster.intersectObjects(floors, false)[0];
    game.intent('item:release', { itemId: item.id });
    updateT1(hubState.t1, 'drop');
    if (!hit) {
      returnHome(item); // released outside any floor (e.g. into a wall) → straight back to its hook
      return;
    }
    item.floorY = hit.point.y + 0.02;
    item.vy = 0;
    item.place = 'falling';
    item.mesh.rotation.set(0, item.mesh.rotation.y, 0); // lie flat
  };

  // Belt button (B/Y in XR, H on desktop): stow the held tool in this side's holster (or the other one),
  // or, with an empty hand, draw the tool holstered on this side (or the other one).
  holsters.onBelt = (/** @type {string} */ handId, /** @type {-1 | 1} */ side, /** @type {THREE.Object3D} */ hand) => {
    const heldMesh = grab.held.get(handId);
    if (heldMesh) {
      const item = items.find((x) => x.mesh === heldMesh);
      if (!item) return false;
      const index = holsters.pick(side, (s) => s.item === null);
      if (index === null) return false; // both holsters full
      item.forceHolster = index;
      grab.release(handId);
      return true;
    }
    const index = holsters.pick(side, (s) => s.item !== null);
    if (index === null) return false;
    const item = items.find((x) => x.holster === index);
    if (!item) return false;
    grab.grab(item.mesh, hand, handId);
    return true;
  };

  kit.onFrame((dt) => {
    // Real wall-clock seconds (spec: "returns after 10 real s"); frame dt is clamped on slow frames.
    now = performance.now() / 1000;
    for (const item of items) {
      if (item.place === 'falling') {
        item.vy -= GRAVITY * dt;
        item.mesh.position.y += item.vy * dt;
        if (item.mesh.position.y <= item.floorY) {
          item.mesh.position.y = item.floorY;
          item.place = 'floor';
          item.landedAt = now;
        }
      } else if (item.place === 'floor' && shouldReturnHome(item.landedAt, now, cfg.toolWall.dropReturnSeconds)) {
        returnHome(item);
      }
    }
  });

  return { items, grab };
}
