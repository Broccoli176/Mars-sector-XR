// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Hull leak on the north wall of the Sala central (event `leak`, spec §3.4): a crack that hisses vapour while
// the leak is open and keeps a patch of yellow sealant foam once the sealant gun closes it.
// Presentation only: reads `sim().lifeSupport.leaks`; the repair itself goes through Repairs (repair:work).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addRepairPoint } from '../../ui/RepairPoint.js';

const VAPOUR = 40;

/**
 * @param {THREE.Group} g station group (wall face at z = 0, +z into the room)
 * @param {string} leakId e.g. `hull_seal_hub`
 * @param {import('../../ui/StationKit.js').StationKit} kit
 */
export function buildHullLeak(g, leakId, kit) {
  const { sim } = kit;

  // Crack: a zig-zag of thin dark slivers on the wall (1 draw call), shown only while the leak is open.
  const crackParts = [];
  const pts = [[-0.16, 0.12], [-0.06, 0.04], [-0.1, -0.02], [0.02, -0.06], [-0.02, -0.12], [0.12, -0.16]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    crackParts.push(new THREE.BoxGeometry(len, 0.012, 0.006).rotateZ(Math.atan2(y1 - y0, x1 - x0)).translate((x0 + x1) / 2, (y0 + y1) / 2, 0.004));
  }
  const crack = new THREE.Mesh(mergeGeometries(crackParts), new THREE.MeshBasicMaterial({ color: '#141414' }));
  crack.visible = false;
  g.add(crack);

  // Sealant foam patch, left on the wall after a successful seal.
  const foam = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 8).scale(1, 1, 0.25), new THREE.MeshLambertMaterial({ color: '#e8c74a' }));
  foam.position.z = 0.01;
  foam.visible = false;
  g.add(foam);

  // Hissing vapour jet (1 draw call).
  const pos = new Float32Array(VAPOUR * 3);
  const vel = new Float32Array(VAPOUR * 3);
  const life = new Float32Array(VAPOUR);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const vapour = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#dfe8ee', size: 0.014, transparent: true, opacity: 0.6, depthWrite: false }));
  vapour.frustumCulled = false;
  vapour.visible = false;
  g.add(vapour);
  const respawn = (/** @type {number} */ i) => {
    pos.set([(Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, 0.02], i * 3);
    vel.set([(Math.random() - 0.5) * 0.4, 0.15 + Math.random() * 0.3, 0.8 + Math.random() * 0.6], i * 3);
    life[i] = Math.random() * 0.6;
  };
  for (let i = 0; i < VAPOUR; i++) respawn(i);

  addRepairPoint(g, kit, { targetId: leakId, x: 0, y: 0, z: 0.12, size: 0.4, labelY: 0.4 });

  let wasLeaking = false;
  let shownSim = sim();
  kit.onRefresh(() => {
    const s = sim();
    if (s !== shownSim) {
      shownSim = s; // restart: a fresh wall
      wasLeaking = false;
      foam.visible = false;
    }
    const leaking = s.lifeSupport.leaks.includes(leakId);
    if (wasLeaking && !leaking) foam.visible = true;
    wasLeaking = leaking;
    crack.visible = leaking;
    vapour.visible = leaking;
  });
  kit.onFrame((dt) => {
    if (!vapour.visible) return;
    for (let i = 0; i < VAPOUR; i++) {
      life[i] += dt;
      if (life[i] > 0.6) {
        respawn(i);
        life[i] = 0;
      }
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    geo.attributes.position.needsUpdate = true;
  });
}
