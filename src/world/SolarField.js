import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roundedRectGeometry, roundedRingGeometry } from './roundedRect.js';
import { MARS, marsLook, skyFactor } from './marsLook.js';

/**
 * Window in the Energía room looking out at the base solar field (2 rows × 6 panels; visual only, the
 * simulated peak is balance.power.solarKw whatever the count).
 * Reacts to the simulation: panels shine by day (same hours as PowerGrid solar), go dark at night and get a
 * dust layer during storms. The panels turn east–west with the sun tracker (sim.solarTracker.angleDeg;
 * vertical-axis yaw, 0° faces the window). When the electrodynamic dust shield fires (`solar:cleaned`
 * by 'shield', LIMPIAR button on the solar desk) a blue wave sweeps the panels one after another and the
 * dust fades out.
 * Budget: unlit materials with baked vertex colours (no extra lights), instanced panels, ≈ 9 draw calls.
 */

/**
 * Pure look of the field for a time of day and weather (tested).
 * @param {number} hour 0–24 @param {boolean} storm @param {{ solarStartHour: number, solarEndHour: number }} cfg
 * @param {number} [dustFactor] PowerGrid.dustFactor (1 = clean panels)
 * @returns {{ daylight: boolean, sky: [number, number, number], ground: number, panel: number, dust: number, soil: number }}
 */
export function fieldLook(hour, storm, cfg, dustFactor = 1) {
  const base = marsLook(hour, storm, cfg);
  // Settled dust dulls the cells (soil 0 = clean, 1 = fully covered); the ochre tint is applied in update().
  const soil = Math.min(1, Math.max(0, 1 - dustFactor));
  return { ...base, panel: base.panel * (1 - 0.6 * soil), soil };
}

const DUST_TINT = new THREE.Color(0xc06a34);
/** Half the sweep length of the shield wave across a panel (local x, metres). */
const WAVE_HALF_SPAN = 1.15;

/**
 * Pure timing of the shield wave on one panel column (tested). Column `i` starts `stepS` after column `i − 1`;
 * each sweep lasts `durationS − stepS × 5` seconds (6 columns; both rows sweep together), fading in and out.
 * @param {number} elapsedS real seconds since the clean @param {number} panelIndex column 0–5
 * @param {{ durationS: number, stepS: number }} cfg balance.cleanFx
 * @returns {{ active: boolean, x: number, opacity: number }} x in −1…1 across the panel
 */
export function shieldWave(elapsedS, panelIndex, cfg) {
  const sweep = Math.max(0.1, cfg.durationS - cfg.stepS * 5);
  const k = (elapsedS - panelIndex * cfg.stepS) / sweep;
  if (k < 0 || k > 1) return { active: false, x: 0, opacity: 0 };
  return { active: true, x: -1 + 2 * k, opacity: Math.sin(Math.PI * k) };
}

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
 * @param {{ center: [number, number, number], width: number, height: number, radius?: number, outward: [number, number] }} win
 *   window centre (world), size, corner radius, and the outward horizontal direction [x, z]
 */
export function buildSolarField(scene, getSim, win) {
  const root = new THREE.Group();
  root.name = 'SolarField_System';
  root.position.set(...win.center);
  // Local −z looks outward.
  root.rotation.y = Math.atan2(-win.outward[0], -win.outward[1]);
  scene.add(root);
  const floorY = -win.center[1];

  // ---- Rounded frame + glass ----
  const hh = win.height / 2;
  const radius = win.radius ?? 0;
  // Rounded frame (ring a little wider than the opening) + a short sill on the straight bottom edge.
  const frame = new THREE.Mesh(
    mergeGeometries([
      roundedRingGeometry(
        { w: win.width + 0.1, h: win.height + 0.1, r: radius + 0.05 },
        { w: win.width - 0.06, h: win.height - 0.06, r: Math.max(0, radius - 0.03) },
        0.16,
      ),
      new THREE.BoxGeometry(Math.max(0.2, win.width - 2 * radius), 0.05, 0.12).translate(0, -hh - 0.02, 0.12),
    ]),
    new THREE.MeshLambertMaterial({ color: 0x42474e }),
  );
  root.add(frame);
  const glass = new THREE.Mesh(
    roundedRectGeometry(win.width - 0.06, win.height - 0.06, Math.max(0, radius - 0.03)),
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
    gc.set([MARS.ground[0] * shade, MARS.ground[1] * shade, MARS.ground[2] * shade], i * 3);
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
    sc.set(skyFactor(k), i * 3);
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

  // ---- Solar panels: 2 rows × 6, tilted towards the sun (one instanced draw call) ----
  const panelGeo = mergeGeometries([
    paint(new THREE.BoxGeometry(2.4, 0.05, 1.3), '#9aa3ad'), // frame
    paint(new THREE.BoxGeometry(2.3, 0.02, 1.2).translate(0, 0.03, 0), '#1d3a78'), // cells
    ...[-0.6, 0, 0.6].map((x) => paint(new THREE.BoxGeometry(0.02, 0.005, 1.2).translate(x, 0.045, 0), '#7f8fa8')), // busbars
  ]);
  const legGeo = paint(new THREE.CylinderGeometry(0.05, 0.05, 1, 6).translate(0, 0.5, 0), '#6b737c');
  const panelMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const legMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const COLS = 6;
  const ROWS = 2;
  const PANELS = COLS * ROWS;
  /** Row depth (z) and x offset: the back row sits between the front panels so it shows through the gaps. */
  const ROW_Z = [-10, -13.5];
  const ROW_X_OFFSET = [0, 1.5];
  const panels = new THREE.InstancedMesh(panelGeo, panelMat, PANELS);
  panels.name = 'SolarPanels';
  const legs = new THREE.InstancedMesh(legGeo, legMat, PANELS);
  legs.name = 'SolarPanelSupports';
  const tmp = new THREE.Object3D();
  /** @type {[number, number][]} panel positions (x, z) */
  const slots = [];
  let i = 0;
  for (let k = 0; k < PANELS; k++) {
    const row = Math.floor(k / COLS);
    const x = -7.5 + (k % COLS) * 3 + ROW_X_OFFSET[row];
    const z = ROW_Z[row];
    slots.push([x, z]);
    tmp.position.set(x, 0.95, z);
    tmp.rotation.set(0, 0, 0); // tilted towards the window by the tracker in update()
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
  outside.add(panels, legs);

  // Dust layer over the panels (storm): same instances, slightly above, transparent.
  const dustLayer = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.32, 0.01, 1.22).translate(0, 0.05, 0),
    new THREE.MeshBasicMaterial({ color: 0xc2703a, transparent: true, opacity: 0, depthWrite: false }),
    PANELS,
  );
  dustLayer.name = 'SolarPanelDust';
  for (let j = 0; j < PANELS; j++) {
    panels.getMatrixAt(j, tmp.matrix);
    dustLayer.setMatrixAt(j, tmp.matrix);
  }
  outside.add(dustLayer);

  // Electrodynamic shield wave: one thin glowing bar per panel, swept across it after a clean.
  const wave = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.22, 0.012, 1.22).translate(0, 0.06, 0),
    new THREE.MeshBasicMaterial({ color: 0x7cc4ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    PANELS,
  );
  wave.name = 'SolarPanelShieldWave';
  wave.visible = false;
  outside.add(wave);

  // ---- Inverter box + cable trench to the base ----
  const props = new THREE.Mesh(
    mergeGeometries([
      paint(new THREE.BoxGeometry(1.2, 1.0, 0.8).translate(-4.5, 0.5, -3.2), '#c9cfd6'),
      paint(new THREE.BoxGeometry(0.15, 0.06, 2.8).translate(-4.5, 0.03, -1.6), '#2a2d31'),
    ]),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
  );
  outside.add(props);

  // ---- Dust in the wind (storms) ----
  const DUST = 160;
  const dustPos = new Float32Array(DUST * 3);
  for (let j = 0; j < DUST; j++) dustPos.set([(Math.random() - 0.5) * 30, Math.random() * 6, -1 - Math.random() * 20], j * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xcf8f66, size: 0.07, transparent: true, opacity: 0.7 }));
  outside.add(dust);

  // Nothing outside should be culled oddly by the window frustum.
  outside.traverse((o) => {
    o.frustumCulled = false;
  });

  const fx = getSim().balance.cleanFx ?? { durationS: 2.4, stepS: 0.25, fadeSoilPerS: 0.6 };
  /** Real seconds since the last shield clean; Infinity = idle. */
  let cleanElapsed = Infinity;
  /** Dust shown on the panels; follows the simulated dust at a limited rate so a clean fades it out. */
  let shownSoil = NaN;
  let wiredBus = null;
  const onCleaned = (/** @type {any} */ e) => {
    if (e?.by === 'shield') cleanElapsed = 0;
  };
  const bindSimulationBus = () => {
    const bus = getSim().bus;
    if (!bus || bus === wiredBus) return;
    wiredBus?.off('solar:cleaned', onCleaned);
    wiredBus = bus;
    wiredBus.on('solar:cleaned', onCleaned);
    cleanElapsed = Infinity;
  };
  const panelMatrix = new THREE.Matrix4();
  const offset = new THREE.Matrix4();

  const tint = new THREE.Color();
  let shownAngle = NaN;
  /** Speed at which panels smoothly rotate mechanically (degrees per real second). */
  const SLEW_SPEED_DEG_PER_SEC = 38;
  /** Rotate every panel (and its dust layer) around its vertical axis. @param {number} deg */
  const rotatePanels = (deg) => {
    const yawDeg = THREE.MathUtils.clamp(deg, -90, 90);
    const yawRad = THREE.MathUtils.degToRad(yawDeg);
    const tiltRad = THREE.MathUtils.degToRad(60);
    slots.forEach(([x, z], j) => {
      tmp.position.set(x, 1.07, z);
      tmp.rotation.set(tiltRad, yawRad, 0, 'YXZ');
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      panels.setMatrixAt(j, tmp.matrix);
      dustLayer.setMatrixAt(j, tmp.matrix);
    });
    panels.instanceMatrix.needsUpdate = true;
    dustLayer.instanceMatrix.needsUpdate = true;
  };
  return {
    root,
    /** True while the shield wave animation is playing. */
    get isCleaning() {
      return cleanElapsed < fx.durationS;
    },
    /** @param {number} dt real seconds */
    update(dt) {
      bindSimulationBus();
      const sim = getSim();
      const look = fieldLook(sim.time.clock().hourFloat, Boolean(sim.power.stormActive), sim.power.cfg, sim.power.dustFactor ?? 1);
      skyMat.color.setRGB(...look.sky);
      groundMat.color.setScalar(look.ground);
      tint.setScalar(look.panel);
      if (look.daylight && !look.dust) tint.setRGB(look.panel, look.panel, Math.min(1.25, look.panel * 1.2)); // blue glint
      // Shown dust drops gradually (shield clean) but rises instantly with the simulation.
      if (Number.isNaN(shownSoil) || look.soil > shownSoil) shownSoil = look.soil;
      else shownSoil = Math.max(look.soil, shownSoil - fx.fadeSoilPerS * dt);
      if (shownSoil > 0) tint.lerp(DUST_TINT.clone().multiplyScalar(look.ground), Math.min(0.85, shownSoil * 1.6)); // settled dust
      panelMat.color.copy(tint);
      legMat.color.setScalar(look.ground);
      /** @type {THREE.MeshBasicMaterial} */ (props.material).color.setScalar(look.ground);
      /** @type {THREE.MeshBasicMaterial} */ (dustLayer.material).opacity = 0.55 * look.dust;
      // Panels smoothly animate toward the tracker angle.
      const tracker = sim.solarTracker;
      const isStopped = sim.phase === 'training' || sim.time.speed === 0;
      const targetDeg = tracker ? (isStopped ? tracker.targetDeg : tracker.targetDeg) : 0;
      if (Number.isNaN(shownAngle)) {
        shownAngle = targetDeg;
        rotatePanels(shownAngle);
      } else {
        const diff = targetDeg - shownAngle;
        if (Math.abs(diff) > 0.05) {
          const step = Math.sign(diff) * Math.min(Math.abs(diff), SLEW_SPEED_DEG_PER_SEC * dt);
          shownAngle += step;
          rotatePanels(shownAngle);
          if (isStopped && tracker) {
            tracker.angleDeg = shownAngle;
          }
        } else if (shownAngle !== targetDeg) {
          shownAngle = targetDeg;
          rotatePanels(shownAngle);
          if (isStopped && tracker) {
            tracker.angleDeg = shownAngle;
          }
        }
      }
      // Shield wave: sweep each panel in turn, following the tracker angle (shownAngle).
      if (cleanElapsed < fx.durationS) {
        cleanElapsed += dt;
        let peak = 0;
        slots.forEach((_, j) => {
          const w = shieldWave(cleanElapsed, j % COLS, fx);
          panels.getMatrixAt(j, panelMatrix);
          offset.makeTranslation(w.x * WAVE_HALF_SPAN, 0, 0);
          if (!w.active) offset.makeScale(0, 0, 0);
          wave.setMatrixAt(j, panelMatrix.multiply(offset));
          peak = Math.max(peak, w.opacity);
        });
        wave.instanceMatrix.needsUpdate = true;
        /** @type {THREE.MeshBasicMaterial} */ (wave.material).opacity = 0.9 * peak;
        wave.visible = cleanElapsed < fx.durationS;
      } else {
        wave.visible = false;
      }
      // The window faces east: the morning sun climbs in view, after noon it is behind the base.
      const hour = sim.time.clock().hourFloat;
      const elevation = 90 - Math.abs((hour - 12) * 15);
      sun.position.y = 0.5 + Math.max(0, elevation) * 0.2;
      sun.visible = look.daylight && !look.dust && hour < 12.5;
      stars.visible = !look.daylight && !look.dust;
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
