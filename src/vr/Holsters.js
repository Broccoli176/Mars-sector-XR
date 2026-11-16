import * as THREE from 'three';

// SHARED (see docs/COLLABORATION.md): two hip holsters on a belt that follows the player's body (spec §9.3).
// Body-attached, NOT a head-locked HUD: the belt only turns when the head turns more than a dead zone,
// so looking around (or down at the belt) does not move it.
// Two ways to holster: the belt button (B/Y on Quest, H on desktop) or releasing the tool next to a ring.
const _head = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _pos = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
// Colours are parsed once here: this runs every frame and must not create garbage (no hex strings to parse).
const IDLE = { color: new THREE.Color('#ffcf66'), opacity: 0.22, scale: 1 };
const HOLDING = { color: new THREE.Color('#ffcf66'), opacity: 0.75, scale: 1 };
const SNAP = { color: new THREE.Color('#7fe07f'), opacity: 0.95, scale: 1.35 };

/** Shortest signed angle a − b in (−π, π]. @param {number} a @param {number} b */
export function angleDelta(a, b) {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Belt yaw that lags the head: unchanged inside ±deadzone, dragged along beyond it.
 * @param {number} bodyYaw @param {number} headYaw @param {number} deadzone radians
 */
export function followYaw(bodyYaw, headYaw, deadzone) {
  const d = angleDelta(headYaw, bodyYaw);
  if (Math.abs(d) <= deadzone) return bodyYaw;
  return bodyYaw + d - Math.sign(d) * deadzone;
}

export class Holsters {
  /**
   * @param {THREE.Object3D} scene
   * @param {import('./Locomotion.js').Locomotion} locomotion
   * @param {{ belowHeadMeters: number, sideOffsetMeters: number, forwardOffsetMeters: number, snapRadiusMeters: number, followDeadzoneDeg?: number }} cfg
   */
  constructor(scene, locomotion, cfg) {
    this.locomotion = locomotion;
    this.cfg = cfg;
    /** @type {import('./Grab.js').Grab | null} set by main.js (to highlight rings while holding something) */
    this.grab = null;
    /**
     * Belt button handler, registered by whoever owns the holsterable objects (hub tools).
     * Returns true if something was stowed or drawn.
     * @type {((handId: string, side: -1 | 1, hand: THREE.Object3D) => boolean) | null}
     */
    this.onBelt = null;
    this.bodyYaw = /** @type {number | null} */ (null);
    const ringGeometry = new THREE.TorusGeometry(0.07, 0.007, 6, 24).rotateX(Math.PI / 2);
    /** @type {{ id: string, side: -1 | 1, socket: THREE.Object3D, ring: THREE.Mesh, item: string | null }[]} */
    this.slots = /** @type {const} */ ([-1, 1]).map((side) => {
      const socket = new THREE.Group();
      socket.name = side < 0 ? 'SKT_Holster_L' : 'SKT_Holster_R';
      const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: IDLE.color, opacity: IDLE.opacity, transparent: true, depthWrite: false, toneMapped: false }));
      ring.scale.setScalar(IDLE.scale);
      socket.add(ring);
      scene.add(socket);
      return { id: socket.name, side, socket, ring, item: null };
    });
  }

  /**
   * Belt button: stow what this hand holds, or draw a tool with an empty hand.
   * @param {string} handId @param {-1 | 1} side hand side (left −1, right 1) @param {THREE.Object3D} hand
   */
  toggle(handId, side, hand) {
    return this.onBelt ? this.onBelt(handId, side, hand) : false;
  }

  /** Preferred free/occupied slot index for a hand side: same side first, then the other. @param {-1 | 1} side @param {(s: Holsters['slots'][number]) => boolean} ok */
  pick(side, ok) {
    const order = side < 0 ? [0, 1] : [1, 0];
    return order.find((i) => ok(this.slots[i])) ?? null;
  }

  /** Call once per frame (after locomotion, before render). */
  update() {
    this.locomotion.headWorld(_head);
    this.locomotion.headForward(_fwd);
    if (_fwd.lengthSq() > 0) {
      const headYaw = Math.atan2(-_fwd.x, -_fwd.z);
      const deadzone = THREE.MathUtils.degToRad(this.cfg.followDeadzoneDeg ?? 35);
      this.bodyYaw = this.bodyYaw === null ? headYaw : followYaw(this.bodyYaw, headYaw, deadzone);
    }
    const yaw = this.bodyYaw ?? 0;
    _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    _right.crossVectors(_fwd, UP).normalize();
    for (const slot of this.slots) {
      slot.socket.position
        .copy(_head)
        .addScaledVector(UP, -this.cfg.belowHeadMeters)
        .addScaledVector(_right, slot.side * this.cfg.sideOffsetMeters)
        .addScaledVector(_fwd, this.cfg.forwardOffsetMeters);
      slot.socket.rotation.set(0, yaw, 0);
    }
    this.#highlight();
  }

  /** Rings: faint when idle, bright while holding something, green + bigger when a held object is in snap range. */
  #highlight() {
    const held = this.grab?.held;
    let holding = false;
    if (held) for (const o of held.values()) if (o.userData.holsterable) holding = true;
    for (const slot of this.slots) {
      let look = holding && slot.item === null ? HOLDING : IDLE;
      if (held && holding && slot.item === null) {
        for (const o of held.values()) {
          if (o.userData.holsterable && o.getWorldPosition(_pos).distanceTo(slot.socket.position) <= this.cfg.snapRadiusMeters) look = SNAP;
        }
      }
      const m = /** @type {THREE.MeshBasicMaterial} */ (slot.ring.material);
      m.color.copy(look.color);
      m.opacity = slot.item ? 0.1 : look.opacity;
      slot.ring.scale.setScalar(look.scale);
    }
  }

  /** Positions + occupancy for the release rules. */
  snapshot() {
    return this.slots.map((s) => ({ position: s.socket.position.clone(), item: s.item }));
  }
}
