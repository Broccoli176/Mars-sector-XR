import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MARS, marsLook, paintSky, bakeShade, groundVariation } from './marsLook.js';

/**
 * Panoramic window in the Telecom room with a real 3D Mars diorama outside (original design: teammate B).
 * - Industrial frame with rivets and a centre beam, tinted glass.
 * - Procedural dunes + faceted rocks, a dish antenna that turns with sim.telecom.angle,
 *   a blinking beacon, day/night sun, stars + Phobos at night, wind-blown dust (faster in storms).
 * - Ground, rocks, sky and day/night light come from the shared Mars look (src/world/marsLook.js),
 *   the same as the Energía solar field and the Control rover world.
 *
 * Quest budget notes (AGENTS.md §7):
 * - NO extra dynamic lights: terrain and rocks use baked vertex shading (fixed sun direction) on
 *   unlit materials, tinted per time of day; lit parts only use the base's existing lights.
 * - Repeated parts are merged or instanced (frame, rivets, struts, receiver legs, rocks).
 *
 * @param {THREE.Scene} scene
 * @param {() => any} getSim returns the current Simulation (it is replaced on restart)
 * @param {{ center: [number, number, number], width: number, height: number }} [win] window opening (world)
 */
export function buildPorthole(scene, getSim, win = { center: [0, 1.6, 0], width: 1.8, height: 0.96 }) {
  const root = new THREE.Group();
  root.name = 'Porthole_System';
  scene.add(root);
  const [wx, wy, wz] = win.center;

  // ---------------------------------------------------------------------------
  // 1. Frame + glass
  // ---------------------------------------------------------------------------
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x42474e });
  const hw = win.width / 2 + 0.02;
  const hh = win.height / 2;
  const frame = new THREE.Mesh(
    mergeGeometries([
      new THREE.BoxGeometry(win.width + 0.04, 0.06, 0.16).translate(0, hh, 0), // top
      new THREE.BoxGeometry(win.width + 0.04, 0.08, 0.2).translate(0, -hh, 0.02), // sill
      new THREE.BoxGeometry(0.06, win.height, 0.16).translate(-hw + 0.03, 0, 0),
      new THREE.BoxGeometry(0.06, win.height, 0.16).translate(hw - 0.03, 0, 0),
      new THREE.BoxGeometry(0.08, win.height, 0.14), // centre beam
    ]),
    frameMat,
  );
  frame.position.set(wx, wy, wz);
  root.add(frame);

  // Rivets along top and sill: one instanced draw call.
  const rivetPositions = [];
  for (let x = -hw + 0.12; x <= hw - 0.12 + 1e-6; x += 0.2) rivetPositions.push([x, hh, 0.08], [x, -hh, 0.1]);
  const rivets = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8).rotateX(Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x22262a }),
    rivetPositions.length,
  );
  const tmp = new THREE.Object3D();
  rivetPositions.forEach(([x, y, z], i) => {
    tmp.position.set(wx + x, wy + y, wz + z);
    tmp.updateMatrix();
    rivets.setMatrixAt(i, tmp.matrix);
  });
  root.add(rivets);

  // Unlit tinted glass (no PBR cost for a single transparent quad).
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(win.width - 0.06, win.height - 0.04),
    new THREE.MeshBasicMaterial({ color: 0x7eb8d0, transparent: true, opacity: 0.14, depthWrite: false }),
  );
  glass.position.set(wx, wy, wz + 0.01);
  root.add(glass);

  // ---------------------------------------------------------------------------
  // 2. Exterior diorama. Coordinates below are RELATIVE to the window centre (x across, -z outward),
  //    so the window can move with the layout. Everything stays at z < -0.3 (beyond the wall).
  // ---------------------------------------------------------------------------
  const exterior = new THREE.Group();
  exterior.name = 'Exterior_Mars_3D';
  exterior.position.set(wx, 0, wz);
  root.add(exterior);
  const SUN_DIR = new THREE.Vector3(0.45, 0.8, 0.4).normalize(); // baked key light

  /** Bakes simple diffuse shading into vertex colours. @param {THREE.BufferGeometry} geo @param {THREE.ColorRepresentation} base */
  const bake = (geo, base, ambient = 0.38) => {
    const c = new THREE.Color(base);
    const n = geo.attributes.normal;
    const colors = new Float32Array(n.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < n.count; i++) {
      v.fromBufferAttribute(n, i);
      const k = ambient + (1 - ambient) * Math.max(0, v.dot(SUN_DIR));
      colors.set([c.r * k, c.g * k, c.b * k], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  };

  // Dunes
  // 20 × 24 m keeps the terrain clear of neighbouring rooms and corridors.
  const terrainGeo = new THREE.PlaneGeometry(20, 24, 20, 20).rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const elevation = Math.sin(x * 0.22) * 0.45 + Math.cos(z * 0.18) * 0.5 + Math.sin(x * 0.45 + z * 0.28) * 0.28;
    pos.setY(i, Math.max(-0.25, elevation));
  }
  terrainGeo.computeVertexNormals();
  const terrainMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const terrain = new THREE.Mesh(bakeShade(terrainGeo, MARS.ground, SUN_DIR, 0.55, groundVariation), terrainMat);
  terrain.position.set(0, 0, -12.3); // south edge 0.3 m behind the window
  exterior.add(terrain);

  // Rocks (instanced)
  const rockCoords = [
    { x: -0.8, z: -1.9, s: 0.9, rot: 0.4 },
    { x: 0.9, z: -2.2, s: 0.7, rot: 1.2 },
    { x: -1.3, z: -3.6, s: 1.4, rot: 2.1 },
    { x: 1.6, z: -3.3, s: 1.1, rot: 0.8 },
    { x: -0.2, z: -4.6, s: 0.6, rot: 1.7 },
    { x: 0.6, z: -5.3, s: 1.6, rot: 2.9 },
  ];
  const rockGeo = new THREE.DodecahedronGeometry(0.3, 1).toNonIndexed();
  rockGeo.computeVertexNormals();
  bakeShade(rockGeo, MARS.rock, SUN_DIR, 0.35);
  const rockMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCoords.length);
  rockCoords.forEach((rc, i) => {
    tmp.position.set(rc.x, 0.15 * rc.s, rc.z);
    tmp.scale.set(rc.s, rc.s * 0.7, rc.s * 1.1);
    tmp.rotation.set(rc.rot * 0.5, rc.rot, rc.rot * 0.3);
    tmp.updateMatrix();
    rocks.setMatrixAt(i, tmp.matrix);
  });
  tmp.scale.set(1, 1, 1);
  tmp.rotation.set(0, 0, 0);
  exterior.add(rocks);

  // ---------------------------------------------------------------------------
  // 3. Dish antenna (turns with sim.telecom.alignment)
  // ---------------------------------------------------------------------------
  const antennaRoot = new THREE.Group();
  antennaRoot.position.set(0, 0, -2.4);
  exterior.add(antennaRoot);
  const metalMat = new THREE.MeshLambertMaterial({ color: 0x5a636c });
  const dishMat = new THREE.MeshLambertMaterial({ color: 0xd2d7de });
  const mastHeight = 1.9;

  /** Strut cylinder rotated like the original lattice. */
  const strut = (/** @type {number} */ a) => {
    const g = new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35));
    return g.applyMatrix4(m).translate(Math.cos(a) * 0.35, 0.5, Math.sin(a) * 0.35);
  };
  const mast = new THREE.Mesh(
    mergeGeometries([
      new THREE.CylinderGeometry(0.06, 0.14, mastHeight, 8).translate(0, mastHeight / 2, 0),
      ...[0, 1, 2, 3].map((i) => strut((i * Math.PI) / 2)),
    ]),
    metalMat,
  );
  antennaRoot.add(mast);

  // Blinking beacon (emissive only — no light source)
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2222, toneMapped: false });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), beaconMat);
  beacon.position.set(0, mastHeight + 0.45, 0);
  antennaRoot.add(beacon);

  const yawPivot = new THREE.Group();
  yawPivot.position.set(0, mastHeight, 0);
  antennaRoot.add(yawPivot);
  const pitchPivot = new THREE.Group();
  pitchPivot.position.set(0, 0.12, 0);
  yawPivot.add(pitchPivot);

  const receiverParts = [
    new THREE.TorusGeometry(0.65, 0.03, 8, 28).rotateX(Math.PI / 2), // rim
    new THREE.ConeGeometry(0.04, 0.22, 8).rotateX(Math.PI / 2).translate(0, 0, 0.32), // horn
  ];
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const leg = new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6);
    leg.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.55, 0, angle + Math.PI / 2)));
    receiverParts.push(leg.translate((Math.cos(angle) * 0.4) / 2, (Math.sin(angle) * 0.4) / 2, 0.16));
  }
  const receiver = new THREE.Mesh(mergeGeometries(receiverParts), metalMat);
  const dishBowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.42).rotateX(-Math.PI / 2),
    dishMat,
  );
  pitchPivot.add(receiver, dishBowl);

  // ---------------------------------------------------------------------------
  // 4. Sky: gradient backdrop (shared Mars look), sun, stars, Phobos
  // ---------------------------------------------------------------------------
  const skyGeo = paintSky(new THREE.PlaneGeometry(64, 36, 1, 10).translate(0, 16, -24.5), 0, 30);
  const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  exterior.add(new THREE.Mesh(skyGeo, skyMat));
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffeedd, toneMapped: false }));
  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffaa66, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  sunMesh.add(sunGlow);
  exterior.add(sunMesh);

  const starCount = 110;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 26;
    starPositions[i * 3 + 1] = 2.0 + Math.random() * 14;
    starPositions[i * 3 + 2] = -7.1 - Math.random() * 16;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.9 }));
  exterior.add(stars);

  const phobos = new THREE.Mesh(
    bake(new THREE.DodecahedronGeometry(0.35, 1), 0xb4a89c),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
  );
  phobos.scale.set(1.4, 0.9, 1.1);
  phobos.position.set(4.5, 9.0, -15.1);
  exterior.add(phobos);

  // ---------------------------------------------------------------------------
  // 5. Wind-blown dust
  // ---------------------------------------------------------------------------
  const dustCount = 80;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSpeeds = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = -4.0 + Math.random() * 8.0;
    dustPositions[i * 3 + 1] = 0.5 + Math.random() * 3.5;
    dustPositions[i * 3 + 2] = -0.4 - Math.random() * 6.0;
    dustSpeeds[i] = 1.5 + Math.random() * 2.5;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({ color: MARS.dust, size: 0.045, transparent: true, opacity: 0.45, depthWrite: false });
  exterior.add(new THREE.Points(dustGeo, dustMat));

  // ---------------------------------------------------------------------------
  // 6. Per-frame update
  // ---------------------------------------------------------------------------
  let totalTime = 0;

  return {
    /** @param {number} dt real seconds */
    update(dt) {
      totalTime += dt;
      const sim = getSim();
      const hour = sim.time.clock().hourFloat;
      const storm = Boolean(sim.power.stormActive);
      const alignment = sim.telecom.alignment;
      const motorBroken = sim.telecom.motorBroken;

      // A. Sun path 06:00 (east) → 18:00 (west); tint unlit exterior by time of day.
      const isDay = hour >= 6 && hour < 18;
      const dayProgress = (hour - 6) / 12;
      const sunAngle = Math.PI - dayProgress * Math.PI;
      sunMesh.position.set(Math.cos(sunAngle) * 16.0, Math.sin(sunAngle) * 13.0, -13.1);
      const look = marsLook(hour, storm, sim.power.cfg);
      skyMat.color.setRGB(...look.sky);
      terrainMat.color.setScalar(look.ground);
      rockMat.color.setScalar(look.ground);
      sunMesh.visible = isDay && !storm;
      stars.visible = !isDay && !storm;
      phobos.visible = !isDay && !storm;

      // B. Dish follows the manually controlled azimuth; a broken motor leaves it jittering off target.
      let targetYaw = THREE.MathUtils.degToRad(sim.telecom.angle);
      let targetPitch = 0.35 + alignment * 0.35;
      if (motorBroken) {
        targetYaw = 0.65 + Math.sin(totalTime * 8) * 0.02;
        targetPitch = -0.15;
      }
      const k = Math.min(1, dt * 2.5);
      yawPivot.rotation.y += (targetYaw - yawPivot.rotation.y) * k;
      pitchPivot.rotation.x += (targetPitch - pitchPivot.rotation.x) * k;

      // C. Beacon blink
      beaconMat.color.setHex(Math.sin(totalTime * 4.5) > 0 ? 0xff2222 : 0x330000);

      // D. Dust
      const d = dustGeo.attributes.position.array;
      const wind = storm ? 4.5 : 1.0;
      dustMat.opacity = storm ? 0.75 : 0.35;
      dustMat.size = storm ? 0.065 : 0.04;
      for (let i = 0; i < dustCount; i++) {
        d[i * 3] += dustSpeeds[i] * dt * wind;
        if (d[i * 3] > 4.0) {
          d[i * 3] = -4.0;
          d[i * 3 + 1] = 0.8 + Math.random() * 2.8;
          d[i * 3 + 2] = -0.4 - Math.random() * 5.0;
        }
      }
      dustGeo.attributes.position.needsUpdate = true;
    },
  };
}
