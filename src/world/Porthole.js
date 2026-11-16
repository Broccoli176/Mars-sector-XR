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
  const rockGeo = new THREE.DodecahedronGeometry(0.3, 1); // polyhedra are already non-indexed
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
  // Dish antenna on an az–el pedestal, a little to the side of the window's centre beam so it is not hidden.
  const antennaRoot = new THREE.Group();
  antennaRoot.position.set(0.85, 0, -2.4);
  exterior.add(antennaRoot);
  // Lit by the base's existing lights (no extra light). Vertex colours carry seams, stripes and paint.
  const metalMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const dishMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mastHeight = 1.7;
  /** Paints a geometry one colour (vertex colours) so several parts share one material and draw call. */
  const tone = (/** @type {THREE.BufferGeometry} */ geo, /** @type {THREE.ColorRepresentation} */ color) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const c = new THREE.Color(color);
    const data = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < data.length; i += 3) data.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(data, 3));
    g.deleteAttribute('uv');
    return g;
  };

  // Static pedestal: concrete pad, tapered column with a hazard band, cable conduit and a junction box.
  const stripes = [];
  for (let i = 0; i < 8; i++) {
    stripes.push(tone(new THREE.CylinderGeometry(0.135, 0.135, 0.06, 16).translate(0, 0.32 + i * 0.06, 0), i % 2 ? '#1b1d20' : '#e0b024'));
  }
  const pedestal = new THREE.Mesh(
    mergeGeometries([
      tone(new THREE.BoxGeometry(0.9, 0.12, 0.9).translate(0, 0.06, 0), '#8f8a84'), // concrete pad
      tone(new THREE.CylinderGeometry(0.1, 0.13, mastHeight, 16).translate(0, mastHeight / 2, 0), '#d7dbe0'), // column
      ...stripes,
      tone(new THREE.CylinderGeometry(0.025, 0.025, mastHeight - 0.2, 6).translate(0.15, (mastHeight - 0.2) / 2 + 0.1, 0.05), '#2a2d31'), // conduit
      tone(new THREE.BoxGeometry(0.2, 0.26, 0.12).translate(0.2, 0.45, 0.12), '#9aa3ad'), // junction box
      tone(new THREE.BoxGeometry(0.12, 0.05, 0.01).translate(0.2, 0.5, 0.185), '#e0b024'), // warning label
    ]),
    metalMat,
  );
  antennaRoot.add(pedestal);

  // Blinking aviation beacon on top of the feed support (emissive only — no light source).
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2222, toneMapped: false });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), beaconMat);

  // Azimuth stage: turntable with a gear ring and the elevation yoke (turns with the antenna).
  const yawPivot = new THREE.Group();
  yawPivot.position.set(0, mastHeight, 0);
  antennaRoot.add(yawPivot);
  const gearTeeth = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    gearTeeth.push(tone(new THREE.BoxGeometry(0.035, 0.05, 0.03).translate(0, 0.03, 0.2).rotateY(a), '#6b737c'));
  }
  const turntable = new THREE.Mesh(
    mergeGeometries([
      tone(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 24).translate(0, 0.03, 0), '#9aa3ad'),
      ...gearTeeth,
      tone(new THREE.BoxGeometry(0.06, 0.42, 0.14).translate(-0.24, 0.27, 0), '#cfd4da'), // yoke arm (left)
      tone(new THREE.BoxGeometry(0.06, 0.42, 0.14).translate(0.24, 0.27, 0), '#cfd4da'), // yoke arm (right)
      tone(new THREE.BoxGeometry(0.16, 0.14, 0.16).translate(0.33, 0.12, 0), '#3a4048'), // azimuth motor
    ]),
    metalMat,
  );
  yawPivot.add(turntable);

  // Elevation stage: the dish, its feed and the counterweight tilt together.
  const pitchPivot = new THREE.Group();
  pitchPivot.position.set(0, 0.44, 0);
  yawPivot.add(pitchPivot);
  const dishGroup = new THREE.Group();
  dishGroup.rotation.x = -1.1; // looks up at the sky (the relay satellite); pitchPivot adds the aiming
  pitchPivot.add(dishGroup);

  // Parabolic reflector z = r² / 4f (lathe), opening towards +z, 12 panel petals with thin seams.
  const R = 0.72;
  const F = 0.46;
  const profile = [];
  for (let i = 0; i <= 10; i++) {
    const r = (i / 10) * R;
    profile.push(new THREE.Vector2(r, (r * r) / (4 * F)));
  }
  const reflector = new THREE.LatheGeometry(profile, 48).rotateX(Math.PI / 2).toNonIndexed();
  reflector.computeVertexNormals();
  {
    const pos = reflector.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const angle = Math.atan2(y, x);
      const seam = Math.abs(((angle / (Math.PI * 2)) * 12) % 1 - 0.5) > 0.47; // near a petal edge
      const r = Math.hypot(x, y) / R;
      const shade = (seam ? 0.72 : 0.93) - 0.06 * r;
      col.set([shade, shade * 1.01, shade * 1.03], i * 3);
    }
    reflector.setAttribute('color', new THREE.BufferAttribute(col, 3));
    reflector.deleteAttribute('uv');
  }
  const rimDepth = (R * R) / (4 * F);
  // Back structure: hub, 8 radial ribs and the rim ring; feed: 4-strut tripod/quadripod, horn and LNB box.
  /** Bar between two points (cylinder, merged into the hardware mesh). @param {THREE.Vector3} from @param {THREE.Vector3} to @param {number} r */
  const bar = (from, to, r) => {
    const g = new THREE.CylinderGeometry(r, r, from.distanceTo(to), 6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()));
    return g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  };
  // Back ribs: from the hub out to the rim, just behind the reflector surface.
  const ribs = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (let s = 0; s < 3; s++) {
      const r0 = (s / 3) * R * 0.96;
      const r1 = ((s + 1) / 3) * R * 0.96;
      const p0 = new THREE.Vector3(Math.cos(a) * r0, Math.sin(a) * r0, (r0 * r0) / (4 * F) - 0.025);
      const p1 = new THREE.Vector3(Math.cos(a) * r1, Math.sin(a) * r1, (r1 * r1) / (4 * F) - 0.025);
      ribs.push(tone(bar(p0, p1, 0.014), '#8a929b'));
    }
  }
  const struts = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const from = new THREE.Vector3(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, rimDepth * 0.92);
    const to = new THREE.Vector3(0, 0, F - 0.04);
    const len = from.distanceTo(to);
    const strutGeo = new THREE.CylinderGeometry(0.011, 0.011, len, 6);
    strutGeo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()));
    strutGeo.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    struts.push(tone(strutGeo, '#b9c0c8'));
  }
  const hardware = new THREE.Mesh(
    mergeGeometries([
      tone(new THREE.TorusGeometry(R, 0.022, 8, 48).translate(0, 0, 0).rotateZ(0).translate(0, 0, rimDepth), '#7d858e'), // rim
      tone(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 16).rotateX(Math.PI / 2).translate(0, 0, -0.04), '#6b737c'), // hub
      ...ribs,
      ...struts,
      tone(new THREE.CylinderGeometry(0.035, 0.05, 0.1, 12).rotateX(Math.PI / 2).translate(0, 0, F - 0.02), '#d7dbe0'), // feed horn
      tone(new THREE.BoxGeometry(0.07, 0.07, 0.09).translate(0, 0, F + 0.07), '#2f343a'), // LNB / receiver
      tone(new THREE.BoxGeometry(0.5, 0.05, 0.06).translate(0, 0, -0.08), '#9aa3ad'), // elevation axle
      tone(new THREE.BoxGeometry(0.2, 0.12, 0.18).translate(0, -0.08, -0.26), '#4a5058'), // counterweight
    ]),
    metalMat,
  );
  const dishBowl = new THREE.Mesh(reflector, dishMat);
  dishGroup.add(dishBowl, hardware);
  beacon.position.set(0, 0.06, F + 0.14);
  dishGroup.add(beacon);

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
    root,
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
