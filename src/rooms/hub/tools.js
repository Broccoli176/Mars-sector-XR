// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Hand tools on the hub tool wall (spec §6.1, §9.3): grabbable, holsterable, droppable.
// Config: src/data/balance/hub.json · Texts: src/data/strings/es/hub.json · Rules: ./toolRules.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../../ui/StationKit.js';
import { font, fitLine } from '../../ui/theme.js';
import { decideRelease, shouldReturnHome, updateT1, toolMotion, TOOL_TIPS, TOOL_EFFECT } from './toolRules.js';

const TOOL_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });
const HOT_TIP_MATERIAL = new THREE.MeshBasicMaterial({ color: '#ff7a2f', toneMapped: false });
const TIP_COLD = new THREE.Color('#ff7a2f');
const TIP_HOT = new THREE.Color('#fff4a8');
/** Reach of a tool from its tip to the part it works on (m). */
const TOOL_REACH = 1.0; // m from the tool tip to the part (generous: you need not touch it)
/** `repair:work` batches: send the accumulated seconds this often (like the hydro hose). */
const WORK_FLUSH_SECONDS = 0.25;
/** Shared pool of effect particles (sparks, solder smoke, sealant foam): 1 draw call for all tools. */
const PARTICLES = 120;
const EFFECTS = {
  sparks: { color: new THREE.Color('#ffd27a'), life: 0.35, speed: 1.6, gravity: 6, rise: 0, spread: 0.9, rate: 70 },
  smoke: { color: new THREE.Color('#bfc6cc'), life: 1.1, speed: 0.12, gravity: -0.35, rise: 0.12, spread: 0.6, rate: 18 },
  foam: { color: new THREE.Color('#f2cf4a'), life: 0.5, speed: 1.1, gravity: 2.5, rise: 0, spread: 0.25, rate: 60 },
};
const _tip = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _fxDir = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _look = new THREE.Vector3();
/** Desktop aims from the eyes, which sit this much further back than a held tool tip (m). */
const DESKTOP_EXTRA_REACH = 0.6;
const _q = new THREE.Quaternion();
// Invisible grab zone around each tool: much easier to hit with the ray than the thin tool itself.
const GRAB_ZONE_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });
// 0.2 × 0.2 × 0.38 m: the tool can be grabbed even if the ray passes beside it (hooks are 0.3 m apart).
const GRAB_ZONE = new THREE.BoxGeometry(0.2, 0.2, 0.38).translate(0, 0, -0.08);
const noRaycast = () => {};
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
    ctx.font = font(H * 0.075, true);
    ctx.fillText(t('hub.toolwall.title'), W / 2, H * 0.03);
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(fitLine(ctx, t('hub.toolwall.hint'), W * 0.94, H * 0.042), W / 2, H * 0.915);
    tools.forEach((tool, i) => {
      const cx = W / 2 + (HOOK_XS[i] / 1.2) * W;
      ctx.strokeStyle = 'rgba(255,207,102,0.5)'; // outline where the tool hangs
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(cx - W * 0.09, H * 0.17, W * 0.18, H * 0.4);
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(fitLine(ctx, t(tool.nameKey), W * 0.24, H * 0.052, true), cx, H * 0.62);
      // Only repairs that can really happen in this build (components[].inGame); a tool without any is
      // labelled as not used yet, so the wall never promises a mechanic that does not exist.
      const repairs = components.filter((c) => c.toolId === tool.id && c.inGame).map((c) => t(c.nameKey));
      ctx.fillStyle = repairs.length ? COLORS.nominal : COLORS.dim;
      if (repairs.length === 0) ctx.fillText(fitLine(ctx, t('hub.toolwall.unused'), W * 0.24, H * 0.042), cx, H * 0.71);
      repairs.forEach((name, j) => ctx.fillText(fitLine(ctx, t('hub.toolwall.repairs', { name }), W * 0.24, H * 0.042), cx, H * (0.71 + j * 0.065)));
    });
  });

  const raycaster = new THREE.Raycaster();
  let now = performance.now() / 1000;

  /** @type {{ id: string, mesh: THREE.Mesh, slot: THREE.Object3D, visual: THREE.Mesh, tipMaterial: THREE.MeshBasicMaterial | null, use: { active: boolean, t: number, heat: number, emit: number, target: string | null, pending: number, sinceFlush: number }, place: string, hand: string, holster: number | null, landedAt: number | null, vy: number, floorY: number, forceHolster: number | null }[]} */
  const items = tools.map((tool, i) => {
    const slot = new THREE.Group();
    slot.position.set(HOOK_XS[i], HOOK_Y, HOOK_Z);
    slot.rotation.x = -Math.PI / 2; // hang pointing down
    g.add(slot);
    // `mesh` is the grab zone (what the ray hits and the hand holds); the visible tool is its child.
    const mesh = new THREE.Mesh(GRAB_ZONE, GRAB_ZONE_MATERIAL);
    const visual = new THREE.Mesh(toolGeometry(tool.id, tool.color, tool.accent), TOOL_MATERIAL);
    visual.name = tool.assetId;
    mesh.add(visual);
    /** @type {THREE.MeshBasicMaterial | null} own copy: heating one iron must not light up a shared material */
    let tipMaterial = null;
    if (tool.id === 'solder_iron') {
      tipMaterial = HOT_TIP_MATERIAL.clone();
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.04, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.145), tipMaterial);
      visual.add(tip);
    }
    slot.add(mesh);
    kit.registerInteractive(mesh);
    const item = { id: tool.id, mesh, slot, visual, tipMaterial, use: { active: false, t: 0, heat: 0, emit: 0, target: /** @type {string | null} */ (null), pending: 0, sinceFlush: 0 }, place: 'wall', hand: 'right', holster: /** @type {number | null} */ (null), landedAt: /** @type {number | null} */ (null), vy: 0, floorY: 0, forceHolster: /** @type {number | null} */ (null) };
    mesh.userData.toolId = tool.id;
    mesh.userData.holsterable = true; // belt rings light up while it is held
    mesh.userData.grab = {
      onGrab: (/** @type {string} */ hand) => onGrab(item, hand),
      onRelease: (/** @type {THREE.Vector3} */ pos) => onRelease(item, pos),
      // Trigger (XR) / F (desktop) while held: use the tool (animation + repair work on the part it points at).
      onUse: (/** @type {boolean} */ active, /** @type {string} */ handId) => setUsing(item, active, handId),
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
    item.hand = hand;
    item.landedAt = null;
    item.mesh.raycast = noRaycast; // a held tool must not block the ray (desktop camera / the other hand)
    updateT1(hubState.t1, 'grab', { wasOnFloor });
    game.intent('item:grab', { itemId: item.id, hand });
  };

  /** @param {typeof items[number]} item @param {THREE.Vector3} pos */
  const onRelease = (item, pos) => {
    item.mesh.raycast = THREE.Mesh.prototype.raycast; // grabbable again from the wall, belt or floor
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

  // A restart creates a new Simulation that knows nothing about the tools already in hand or on the belt:
  // tell it again, so carried tools keep counting for repairs (src/systems/Toolbelt.js).
  let syncedSim = kit.sim();
  kit.onRefresh(() => {
    if (kit.sim() === syncedSim) return;
    syncedSim = kit.sim();
    for (const item of items) {
      if (item.place === 'hand') game.intent('item:grab', { itemId: item.id, hand: item.hand });
      else if (item.place === 'holster' && item.holster !== null) game.intent('item:socket', { itemId: item.id, slot: holsters.slots[item.holster].id });
    }
  });

  // ---- Using a tool: animation, effect particles and repair work on the part it points at ----
  const pPos = new Float32Array(PARTICLES * 3).fill(-100);
  const pVel = new Float32Array(PARTICLES * 3);
  const pCol = new Float32Array(PARTICLES * 3);
  const pLife = new Float32Array(PARTICLES);
  const pMax = new Float32Array(PARTICLES).fill(1);
  /** @type {(typeof EFFECTS)[keyof typeof EFFECTS][]} */
  const pFx = new Array(PARTICLES).fill(EFFECTS.sparks);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.012, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
  particles.frustumCulled = false;
  kit.services.scene.add(particles);
  let nextParticle = 0;
  /** @param {(typeof EFFECTS)[keyof typeof EFFECTS]} fx @param {THREE.Vector3} at @param {THREE.Vector3} dir */
  const spawn = (fx, at, dir) => {
    const i = nextParticle;
    nextParticle = (nextParticle + 1) % PARTICLES;
    pPos.set([at.x, at.y, at.z], i * 3);
    const s = fx.speed * (0.6 + Math.random() * 0.8);
    pVel.set([
      (dir.x + (Math.random() - 0.5) * fx.spread) * s,
      (dir.y + (Math.random() - 0.5) * fx.spread) * s + fx.rise,
      (dir.z + (Math.random() - 0.5) * fx.spread) * s,
    ], i * 3);
    pCol.set([fx.color.r, fx.color.g, fx.color.b], i * 3);
    pLife[i] = 0;
    pMax[i] = fx.life * (0.7 + Math.random() * 0.6);
    pFx[i] = fx;
  };

  /** @param {typeof items[number]} item */
  const flushWork = (item) => {
    const u = item.use;
    if (u.target && u.pending > 0) game.intent('repair:work', { componentId: u.target, seconds: u.pending });
    u.pending = 0;
    u.sinceFlush = 0;
  };
  /** Hand that is using each tool (desktop aims with the crosshair, XR with the tool itself). */
  /** @type {Map<string, string>} */
  const usingHand = new Map();
  /** @param {typeof items[number]} item @param {boolean} active @param {string} [handId] */
  function setUsing(item, active, handId = '') {
    if (!active) flushWork(item);
    usingHand.set(item.id, handId);
    item.use.active = active && item.place === 'hand';
    item.use.t = 0;
    if (!item.use.active) item.use.target = null;
  }

  const toolRay = new THREE.Raycaster();
  toolRay.far = TOOL_REACH;
  /** Which repair target the tool tip points at (or null). @param {THREE.Vector3} from @param {THREE.Vector3} dir */
  const aimedTarget = (from, dir) => {
    if (kit.repairTargets.length === 0) return null;
    toolRay.set(from, dir);
    const hit = toolRay.intersectObjects(kit.repairTargets, false)[0];
    return hit ? /** @type {string} */ (hit.object.userData.repairTarget) : null;
  };

  /** @param {typeof items[number]} item @param {number} dt */
  const animateUse = (item, dt) => {
    const u = item.use;
    if (item.place !== 'hand' && u.active) setUsing(item, false);
    if (u.active) u.t += dt;
    const m = u.active ? toolMotion(item.id, u.t) : { roll: 0, push: 0, heat: 0 };
    // Ease back to rest when the trigger is released.
    const k = u.active ? 1 : Math.min(1, dt * 10);
    item.visual.rotation.z += (m.roll - item.visual.rotation.z) * k;
    item.visual.position.z += (m.push - item.visual.position.z) * k;
    u.heat = u.active ? m.heat : Math.max(0, u.heat - dt * 0.8);
    if (item.tipMaterial) item.tipMaterial.color.copy(TIP_COLD).lerp(TIP_HOT, u.heat);
    if (!u.active) return;

    // Tip position and pointing direction in the world.
    _tip.fromArray(TOOL_TIPS[/** @type {keyof typeof TOOL_TIPS} */ (item.id)] ?? [0, 0, -0.18]);
    item.mesh.localToWorld(_tip);
    _dir.set(0, 0, -1).applyQuaternion(item.mesh.getWorldQuaternion(_q));
    // XR: the tool itself points at the part. Desktop: the tool sits in the corner of the view, so the
    // crosshair (camera ray) aims, from a bit further away.
    let target;
    if (usingHand.get(item.id) === 'desktop' && kit.services.locomotion) {
      kit.services.locomotion.headWorld(_eye);
      kit.services.locomotion.headForward(_look);
      toolRay.far = TOOL_REACH + DESKTOP_EXTRA_REACH;
      target = aimedTarget(_eye, _look);
      toolRay.far = TOOL_REACH;
    } else target = aimedTarget(_tip, _dir);
    const repairs = kit.sim().repairs;
    const comp = target ? repairs?.componentOf(target) : null;
    const working = Boolean(target && comp && comp.toolId === item.id && repairs?.isBroken(target));

    // Repair work in small batches (the simulation decides tool, spares and progress).
    const workTarget = working ? target : null;
    if (workTarget !== u.target) flushWork(item);
    u.target = workTarget;
    if (working) {
      u.pending += dt;
      u.sinceFlush += dt;
      if (u.sinceFlush >= WORK_FLUSH_SECONDS) flushWork(item);
    }

    // Effect particles: sparks only on metal being worked; smoke and foam whenever the tool is used.
    const kind = TOOL_EFFECT[/** @type {keyof typeof TOOL_EFFECT} */ (item.id)];
    if (kind === 'sparks' && !working) return;
    if (kind === 'smoke' && u.heat < 0.5) return;
    const fx = EFFECTS[/** @type {keyof typeof EFFECTS} */ (kind)];
    u.emit += dt * fx.rate;
    if (kind === 'smoke') _fxDir.set(0, 1, 0);
    else if (kind === 'sparks') _fxDir.copy(_dir).negate();
    else _fxDir.copy(_dir);
    while (u.emit >= 1) {
      u.emit -= 1;
      spawn(fx, _tip, _fxDir);
    }
  };

  kit.onFrame((dt) => {
    for (const item of items) animateUse(item, dt);
    for (let i = 0; i < PARTICLES; i++) {
      if (pPos[i * 3 + 1] < -50) continue;
      pLife[i] += dt;
      if (pLife[i] >= pMax[i]) {
        pPos[i * 3 + 1] = -100; // parked
        continue;
      }
      pVel[i * 3 + 1] -= pFx[i].gravity * dt;
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  });

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
