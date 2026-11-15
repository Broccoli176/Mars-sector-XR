import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Window in the Energía room looking out at the base solar field (3 rows × 6 panels), with the rover
 * charging pad. Reacts to the simulation: panels shine by day (same hours as PowerGrid solar), go dark at
 * night and get a dust layer during storms; the rover is parked outside while it is docked.
 * Budget: unlit materials with baked vertex colours (no extra lights), instanced panels, ≈ 9 draw calls.
 */

/**
 * Pure look of the field for a time of day and weather (tested).
 * @param {number} hour 0–24 @param {boolean} storm @param {{ solarStartHour: number, solarEndHour: number }} cfg
 * @param {number} [dustFactor] PowerGrid.dustFactor (1 = clean panels)
 * @returns {{ daylight: boolean, sky: [number, number, number], ground: number, panel: number, dust: number, soil: number }}
 */
export function fieldLook(hour, storm, cfg, dustFactor = 1) {
  const base = fieldLookClean(hour, storm, cfg);
  // Settled dust dulls the cells (soil 0 = clean, 1 = fully covered); the ochre tint is applied in update().
  const soil = Math.min(1, Math.max(0, 1 - dustFactor));
  return { ...base, panel: base.panel * (1 - 0.6 * soil), soil };
}

/** @param {number} hour @param {boolean} storm @param {{ solarStartHour: number, solarEndHour: number }} cfg */
function fieldLookClean(hour, storm, cfg) {
  const daylight = hour >= cfg.solarStartHour && hour < cfg.solarEndHour;
  if (storm) return { daylight, sky: [0.55, 0.36, 0.26], ground: daylight ? 0.6 : 0.2, panel: daylight ? 0.5 : 0.15, dust: 1 };
  if (!daylight) return { daylight, sky: [0.03, 0.03, 0.06], ground: 0.16, panel: 0.12, dust: 0 };
  // Martian day: butterscotch sky; blue-ish near sunrise/sunset (real Mars sunsets are blue).
  const t = (hour - cfg.solarStartHour) / (cfg.solarEndHour - cfg.solarStartHour);
  const edge = Math.max(0, 1 - Math.min(t, 1 - t) / 0.12); // 1 at sunrise/sunset, 0 by mid-morning
  const sky = /** @type {[number, number, number]} */ ([0.78 - 0.4 * edge, 0.6 - 0.15 * edge, 0.45 + 0.2 * edge]);
  return { daylight, sky, ground: 1, panel: 1, dust: 0 };
}

const DUST_TINT = new THREE.Color(0xb0703f);

/** @param {THREE.BufferGeometry} geo @param {THREE.ColorRepresentation} color */
function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  g.deleteAttribute('uv');
  return g;
}

/**
 * @param {THREE.Scene} scene
 * @param {() => any} getSim current Simulation (replaced on restart)
 * @param {{ center: [number, number, number], width: number, height: number, outward: [number, number] }} win
 *   window centre (world), size, and the outward horizontal direction [x, z]
 */
export function buildSolarField(scene, getSim, win) {
  const root = new THREE.Group();
  root.name = 'SolarField_System';
  root.position.set(...win.center);
  // Local −z looks outward.
  root.rotation.y = Math.atan2(-win.outward[0], -win.outward[1]);
  scene.add(root);
  const floorY = -win.center[1];

  // ---- Frame + glass (same style as the Telecom window) ----
  const hw = win.width / 2;
  const hh = win.height / 2;
  const frame = new THREE.Mesh(
    mergeGeometries([
      new THREE.BoxGeometry(win.width + 0.04, 0.06, 0.16).translate(0, hh, 0),
      new THREE.BoxGeometry(win.width + 0.04, 0.08, 0.2).translate(0, -hh, 0.02),
      new THREE.BoxGeometry(0.06, win.height, 0.16).translate(-hw, 0, 0),
      new THREE.BoxGeometry(0.06, win.height, 0.16).translate(hw, 0, 0),
    ]),
    new THREE.MeshLambertMaterial({ color: 0x42474e }),
  );
  root.add(frame);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(win.width - 0.06, win.height - 0.04),
    new THREE.MeshBasicMaterial({ color: 0x7eb8d0, transparent: true, opacity: 0.12, depthWrite: false }),
  );
  glass.position.z = 0.01;
  root.add(glass);

  const outside = new THREE.Group();
  outside.position.y = floorY;
  root.add(outside);

  // ---- Ground with gentle dunes (baked shading) ----
  const groundGeo = new THREE.PlaneGeometry(70, 46, 35, 23).rotateX(-Math.PI / 2).translate(0, 0, -24);
  const gp = groundGeo.attributes.position;
  const gc = new Float32Array(gp.count * 3);
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const far = Math.min(1, Math.max(0, (-z - 16) / 20));
    const y = -0.15 + far * (0.6 * Math.sin(x * 0.18) + 0.4 * Math.cos(z * 0.23 + x * 0.05)) + 0.08 * Math.sin(x * 1.3 + z * 0.9);
    gp.setY(i, y);
    const shade = 0.82 + 0.18 * Math.sin(x * 0.18 + 0.6) * far + 0.06 * Math.sin(x * 1.3 + z * 0.9);
    gc.set([0.72 * shade, 0.42 * shade, 0.27 * shade], i * 3);
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  groundGeo.computeVertexNormals();
  const groundMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  outside.add(new THREE.Mesh(groundGeo, groundMat));

  // ---- Sky backdrop (gradient) + sun + stars ----
  const skyGeo = new THREE.PlaneGeometry(120, 40, 1, 8).translate(0, 14, -46);
  const sp = skyGeo.attributes.position;
  const sc = new Float32Array(sp.count * 3);
  for (let i = 0; i < sp.count; i++) {
    const k = Math.min(1, Math.max(0, (sp.getY(i) + 6) / 40));
    sc.set([1 - 0.45 * k, 1 - 0.5 * k, 1 - 0.4 * k], i * 3);
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  outside.add(new THREE.Mesh(skyGeo, skyMat));
  const sun = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), new THREE.MeshBasicMaterial({ color: 0xfff4dc, toneMapped: false }));
  sun.position.set(0, 8, -45.5);
  outside.add(sun);
  const starPos = new Float32Array(120 * 3);
  for (let i = 0; i < 120; i++) starPos.set([(Math.random() - 0.5) * 110, 3 + Math.random() * 30, -45.8], i * 3);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12 }));
  outside.add(stars);

  // ---- Solar panels: 3 rows × 6, tilted towards the sun (one instanced draw call) ----
  const panelGeo = mergeGeometries([
    paint(new THREE.BoxGeometry(2.4, 0.05, 1.3), '#9aa3ad'), // frame
    paint(new THREE.BoxGeometry(2.3, 0.02, 1.2).translate(0, 0.03, 0), '#1d3a78'), // cells
    ...[-0.6, 0, 0.6].map((x) => paint(new THREE.BoxGeometry(0.02, 0.005, 1.2).translate(x, 0.045, 0), '#7f8fa8')), // busbars
  ]);
  const legGeo = paint(new THREE.CylinderGeometry(0.05, 0.05, 1, 6).translate(0, 0.5, 0), '#6b737c');
  const panelMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const legMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const PANELS = 18;
  const panels = new THREE.InstancedMesh(panelGeo, panelMat, PANELS);
  const legs = new THREE.InstancedMesh(legGeo, legMat, PANELS);
  const tmp = new THREE.Object3D();
  let i = 0;
  for (const z of [-10, -13.5, -17]) {
    for (let k = 0; k < 6; k++) {
      const x = -7.5 + k * 3;
      tmp.position.set(x, 0.95, z);
      tmp.rotation.set(0.45, 0, 0); // tilted, facing back towards the base/sun
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      panels.setMatrixAt(i, tmp.matrix);
      tmp.position.set(x, 0, z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 0.9, 1);
      tmp.updateMatrix();
      legs.setMatrixAt(i, tmp.matrix);
      i++;
    }
  }
  outside.add(panels, legs);

  // Dust layer over the panels (storm): same instances, slightly above, transparent.
  const dustLayer = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.32, 0.01, 1.22).translate(0, 0.05, 0),
    new THREE.MeshBasicMaterial({ color: 0xb06a3c, transparent: true, opacity: 0, depthWrite: false }),
    PANELS,
  );
  for (let j = 0; j < PANELS; j++) {
    panels.getMatrixAt(j, tmp.matrix);
    dustLayer.setMatrixAt(j, tmp.matrix);
  }
  outside.add(dustLayer);

  // ---- Inverter box, cable trench to the base, rover charging pad + rover ----
  const props = new THREE.Mesh(
    mergeGeometries([
      paint(new THREE.BoxGeometry(1.2, 1.0, 0.8).translate(-4.5, 0.5, -3.2), '#c9cfd6'),
      paint(new THREE.BoxGeometry(0.15, 0.06, 2.8).translate(-4.5, 0.03, -1.6), '#2a2d31'),
      paint(new THREE.CylinderGeometry(1.6, 1.6, 0.06, 24).translate(2.6, 0.03, -7.2), '#8a8f96'),
      paint(new THREE.BoxGeometry(0.1, 0.07, 6).translate(2.6, 0.03, -3.4), '#2a2d31'),
    ]),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
  );
  outside.add(props);
  const wheel = (/** @type {number} */ x, /** @type {number} */ z) => paint(new THREE.CylinderGeometry(0.26, 0.26, 0.22, 12).rotateZ(Math.PI / 2).translate(x, 0.26, z), '#3a3a3c');
  const roverGeo = mergeGeometries([
    paint(new THREE.BoxGeometry(1.4, 0.45, 1.8).translate(0, 0.85, 0), '#e8e4dc'), // body
    paint(new THREE.BoxGeometry(1.5, 0.08, 1.9).translate(0, 1.1, 0), '#b8b2a6'), // deck
    paint(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6).translate(0.4, 1.7, 0.6), '#d0ccc4'), // mast
    paint(new THREE.BoxGeometry(0.45, 0.22, 0.25).translate(0.4, 2.35, 0.6), '#d8d4cc'), // mast head (cameras)
    paint(new THREE.BoxGeometry(0.6, 0.5, 0.4).rotateX(-0.5).translate(0, 1.15, -1.0), '#5a5f66'), // MMRTG
    paint(new THREE.BoxGeometry(0.12, 0.12, 1.1).translate(-0.6, 0.95, 1.2), '#c9c5bd'), // arm
    ...[-0.8, 0.8].flatMap((x) => [-0.75, 0, 0.75].map((z) => wheel(x, z))),
  ]);
  const roverMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const rover = new THREE.Mesh(roverGeo, roverMat);
  rover.position.set(2.6, 0.06, -7.2);
  rover.rotation.y = 0.9;
  rover.scale.setScalar(0.85);
  outside.add(rover);

  // ---- Dust in the wind (storms) ----
  const DUST = 160;
  const dustPos = new Float32Array(DUST * 3);
  for (let j = 0; j < DUST; j++) dustPos.set([(Math.random() - 0.5) * 30, Math.random() * 6, -1 - Math.random() * 20], j * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xc08050, size: 0.07, transparent: true, opacity: 0.7 }));
  outside.add(dust);

  // Nothing outside should be culled oddly by the window frustum.
  outside.traverse((o) => {
    o.frustumCulled = false;
  });

  const tint = new THREE.Color();
  return {
    root,
    rover,
    /** @param {number} dt real seconds */
    update(dt) {
      const sim = getSim();
      const look = fieldLook(sim.time.clock().hourFloat, Boolean(sim.power.stormActive), sim.power.cfg, sim.power.dustFactor ?? 1);
      skyMat.color.setRGB(...look.sky);
      groundMat.color.setScalar(look.ground);
      tint.setScalar(look.panel);
      if (look.daylight && !look.dust) tint.setRGB(look.panel, look.panel, Math.min(1.25, look.panel * 1.2)); // blue glint
      if (look.soil > 0) tint.lerp(DUST_TINT.clone().multiplyScalar(look.ground), Math.min(0.85, look.soil * 1.6)); // settled dust
      panelMat.color.copy(tint);
      legMat.color.setScalar(look.ground);
      /** @type {THREE.MeshBasicMaterial} */ (props.material).color.setScalar(look.ground);
      roverMat.color.setScalar(Math.max(0.25, look.ground));
      /** @type {THREE.MeshBasicMaterial} */ (dustLayer.material).opacity = 0.55 * look.dust;
      sun.visible = look.daylight && !look.dust;
      stars.visible = !look.daylight && !look.dust;
      rover.visible = Boolean(sim.rover?.docked);
      dust.visible = look.dust > 0;
      if (dust.visible) {
        for (let j = 0; j < DUST; j++) {
          let x = dustPos[j * 3] + dt * (4 + (j % 5));
          if (x > 15) x = -15;
          dustPos[j * 3] = x;
        }
        dustGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
