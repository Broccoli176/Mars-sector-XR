// SHARED (src/vr/Grab.js) — "use while holding" contract used by the hydro hose.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Grab } from '../src/vr/Grab.js';

describe('Grab.use (trigger while holding)', () => {
  it('forwards the trigger to a held object with onUse, and stops using it on release', () => {
    const scene = new THREE.Group();
    const hand = new THREE.Group();
    /** @type {boolean[]} */
    const uses = [];
    const hose = new THREE.Object3D();
    hose.userData.grab = { onGrab() {}, onRelease() {}, onUse: (/** @type {boolean} */ a) => uses.push(a) };
    const wrench = new THREE.Object3D();
    wrench.userData.grab = { onGrab() {}, onRelease() {} };
    const grab = new Grab(scene);

    expect(grab.use('xr0', true)).toBe(false); // empty hand: the ray keeps the trigger
    grab.grab(wrench, hand, 'xr0');
    expect(grab.use('xr0', true)).toBe(false); // held object without onUse: ray too
    grab.grab(hose, hand, 'xr1');
    expect(grab.use('xr1', true)).toBe(true);
    grab.release('xr1');
    expect(uses).toEqual([true, false]);
  });
});
