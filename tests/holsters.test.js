// SHARED (src/vr/Holsters.js) — belt that follows the body, belt button helpers and ring feedback.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Holsters, followYaw, angleDelta } from '../src/vr/Holsters.js';
import { Grab } from '../src/vr/Grab.js';

const deg = THREE.MathUtils.degToRad;
const cfg = { belowHeadMeters: 0.7, sideOffsetMeters: 0.22, forwardOffsetMeters: 0.12, snapRadiusMeters: 0.3, followDeadzoneDeg: 35 };
/** Fake locomotion with a controllable head yaw. */
const fakeLoco = (state = { yaw: 0 }) => ({
  state,
  headWorld: (/** @type {THREE.Vector3} */ o) => o.set(0, 1.6, 0),
  headForward: (/** @type {THREE.Vector3} */ o) => o.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw)),
});

describe('belt holsters', () => {
  it('the belt ignores small head turns and is dragged by big ones', () => {
    expect(followYaw(0, deg(20), deg(35))).toBe(0);
    expect(followYaw(0, deg(50), deg(35))).toBeCloseTo(deg(15));
    expect(followYaw(0, deg(-90), deg(35))).toBeCloseTo(deg(-55));
    expect(angleDelta(deg(170), deg(-170))).toBeCloseTo(deg(-20));
  });

  it('looking around does not move the rings; turning the body does', () => {
    const loco = fakeLoco();
    const h = new Holsters(new THREE.Group(), /** @type {any} */ (loco), cfg);
    h.update();
    const right = h.slots[1].socket.position.clone();
    expect(right.x).toBeCloseTo(0.22);
    expect(right.y).toBeCloseTo(0.9);
    loco.state.yaw = deg(25); // glance to the side
    h.update();
    expect(h.slots[1].socket.position.distanceTo(right)).toBeLessThan(1e-9);
    loco.state.yaw = deg(120); // really turned around
    h.update();
    expect(h.slots[1].socket.position.distanceTo(right)).toBeGreaterThan(0.1);
  });

  it('picks the same-side holster first, then the other one', () => {
    const h = new Holsters(new THREE.Group(), /** @type {any} */ (fakeLoco()), cfg);
    expect(h.pick(-1, (s) => s.item === null)).toBe(0);
    expect(h.pick(1, (s) => s.item === null)).toBe(1);
    h.slots[1].item = 'wrench';
    expect(h.pick(1, (s) => s.item === null)).toBe(0);
    expect(h.pick(-1, (s) => s.item !== null)).toBe(1);
    h.slots[0].item = 'screwdriver';
    expect(h.pick(1, (s) => s.item === null)).toBeNull();
  });

  it('rings light up while holding a tool and turn green within snap range', () => {
    const scene = new THREE.Group();
    const h = new Holsters(scene, /** @type {any} */ (fakeLoco()), cfg);
    const grab = new Grab(scene);
    h.grab = grab;
    const hand = new THREE.Group();
    scene.add(hand);
    const tool = new THREE.Object3D();
    tool.userData = { holsterable: true, grab: { onGrab() {}, onRelease() {} } };
    hand.position.set(1, 1.2, 0); // far from both rings
    grab.grab(tool, hand, 'xr0');
    h.update();
    const mat = (/** @type {number} */ i) => /** @type {THREE.MeshBasicMaterial} */ (h.slots[i].ring.material);
    expect(mat(1).opacity).toBeGreaterThan(0.5);
    hand.position.set(0.22, 0.95, -0.12); // right next to the right ring
    hand.updateMatrixWorld(true);
    h.update();
    expect(h.slots[1].ring.scale.x).toBeGreaterThan(1.2);
    expect(mat(1).color.getHexString()).toBe('7fe07f');
  });
});
