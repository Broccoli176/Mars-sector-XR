import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Window in the Energía room looking out at the base solar field (one row × 6 panels), Rover 2 and a Tesla
 * coil. Reacts to the simulation: panels shine by day (same hours as PowerGrid solar), go dark at
 * night and get a dust layer during storms; Rover 2 can be driven from the energy console. The panels turn
 * east–west with the sun tracker (sim.solarTracker.angleDeg; vertical-axis yaw, 0° faces the window).
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

function buildTeslaCoil(scale = 2) {
  const windingPoints = Array.from({ length: 97 }, (_, i) => {
    const progress = i / 96;
    const angle = progress * Math.PI * 10;
    return new THREE.Vector3(Math.cos(angle) * 0.13, 0.2 + progress * 0.95, Math.sin(angle) * 0.13);
  });
  const geometry = mergeGeometries([
    paint(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12).translate(0, 0.06, 0), '#39434d'),
    paint(new THREE.CylinderGeometry(0.075, 0.075, 1.4, 8).translate(0, 0.77, 0), '#78838d'),
    paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(windingPoints), 96, 0.018, 5, false), '#c98245'),
    paint(new THREE.TorusGeometry(0.24, 0.045, 8, 18).rotateX(Math.PI / 2).translate(0, 1.43, 0), '#c98245'),
    paint(new THREE.SphereGeometry(0.12, 12, 8).translate(0, 1.46, 0), '#7cc4ff'),
  ]);
  const coil = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true }));
  coil.name = 'TeslaCoil_FieldProp';
  coil.scale.setScalar(scale);
  coil.position.set(0, 0, -12.3);
  return coil;
}

/**
 * @param {THREE.Scene} scene
 * @param {() => any} getSim current Simulation (replaced on restart)
 * @param {{ center: [number, number, number], width: number, height: number, outward: [number, number] }} win
 *   window centre (world), size, and the outward horizontal direction [x, z]
 * @param {{ camera: THREE.PerspectiveCamera, dolly: THREE.Group }} controlView
 */
export function buildSolarField(scene, getSim, win, controlView) {
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

  // ---- Solar panels: one row × 6, tilted towards the sun (one instanced draw call) ----
  const panelGeo = mergeGeometries([
    paint(new THREE.BoxGeometry(2.4, 0.05, 1.3), '#9aa3ad'), // frame
    paint(new THREE.BoxGeometry(2.3, 0.02, 1.2).translate(0, 0.03, 0), '#1d3a78'), // cells
    ...[-0.6, 0, 0.6].map((x) => paint(new THREE.BoxGeometry(0.02, 0.005, 1.2).translate(x, 0.045, 0), '#7f8fa8')), // busbars
  ]);
  const legGeo = paint(new THREE.CylinderGeometry(0.05, 0.05, 1, 6).translate(0, 0.5, 0), '#6b737c');
  const panelMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const legMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const PANELS = 6;
  const PANEL_ROW_Z = -10;
  const panels = new THREE.InstancedMesh(panelGeo, panelMat, PANELS);
  panels.name = 'SolarPanels';
  const legs = new THREE.InstancedMesh(legGeo, legMat, PANELS);
  legs.name = 'SolarPanelSupports';
  const tmp = new THREE.Object3D();
  /** @type {[number, number][]} panel positions (x, z) */
  const slots = [];
  let i = 0;
  for (let k = 0; k < PANELS; k++) {
    const x = -7.5 + k * 3;
    slots.push([x, PANEL_ROW_Z]);
    tmp.position.set(x, 0.95, PANEL_ROW_Z);
    tmp.rotation.set(0, 0, 0); // tilted towards the window by the tracker in update()
    tmp.scale.setScalar(1);
    tmp.updateMatrix();
    panels.setMatrixAt(i, tmp.matrix);
    tmp.position.set(x, 0, PANEL_ROW_Z);
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
    new THREE.MeshBasicMaterial({ color: 0xb06a3c, transparent: true, opacity: 0, depthWrite: false }),
    PANELS,
  );
  dustLayer.name = 'SolarPanelDust';
  for (let j = 0; j < PANELS; j++) {
    panels.getMatrixAt(j, tmp.matrix);
    dustLayer.setMatrixAt(j, tmp.matrix);
  }
  outside.add(dustLayer);

  // ---- Inverter box, cable trench to the base, rover charging pad + Rover 2 ----
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
  const rover2Mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const rover2 = new THREE.Mesh(roverGeo, rover2Mat);
  rover2.name = 'Rover2_Cleaning';
  const rover2Cfg = getSim().balance.rover2;
  rover2.position.set(rover2Cfg.start.x, 0.06, rover2Cfg.start.z);
  rover2.rotation.y = rover2Cfg.start.headingRad;
  rover2.scale.setScalar(0.85);
  outside.add(rover2);
  outside.add(buildTeslaCoil());

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

  const { camera, dolly } = controlView;
  const controlKeys = new Set();
  const savedDollyPosition = new THREE.Vector3();
  const savedDollyRotation = new THREE.Euler();
  const savedCameraRotation = new THREE.Euler();
  let controllingRover2 = false;
  let cleanWasPressed = false;
  let exitWasPressed = false;
  let wiredBus = null;
  const driveCodes = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  const exitRover2Control = () => {
    if (!controllingRover2) return;
    controllingRover2 = false;
    controlKeys.clear();
    dolly.position.copy(savedDollyPosition);
    dolly.rotation.copy(savedDollyRotation);
    camera.rotation.copy(savedCameraRotation);
  };
  const enterRover2Control = () => {
    const sim = getSim();
    if (sim.phase !== 'playing') {
      sim.bus.emit('hint', { key: 'solar.rover2.not_playing' });
      return;
    }
    controllingRover2 = true;
    savedDollyPosition.copy(dolly.position);
    savedDollyRotation.copy(dolly.rotation);
    savedCameraRotation.copy(camera.rotation);
  };
  const toggleRover2Control = () => {
    if (controllingRover2) exitRover2Control();
    else enterRover2Control();
  };
  const cleanWithRover2 = () => {
    const sim = getSim();
    if (sim.phase !== 'playing') {
      sim.bus.emit('hint', { key: 'solar.rover2.not_playing' });
      return;
    }
    const nearest = Math.min(...slots.map(([x, z]) => Math.hypot(rover2.position.x - x, rover2.position.z - z)));
    if (nearest > rover2Cfg.cleanRangeM) {
      sim.bus.emit('hint', { key: 'solar.rover2.too_far' });
      return;
    }
    sim.bus.emit('solar:clean', { by: 'rover2' });
  };
  const onControlIntent = () => toggleRover2Control();
  const onCleanIntent = () => cleanWithRover2();
  const bindSimulationBus = () => {
    const bus = getSim().bus;
    if (bus === wiredBus) return;
    wiredBus?.off('rover2:control', onControlIntent);
    wiredBus?.off('rover2:clean', onCleanIntent);
    wiredBus = bus;
    wiredBus.on('rover2:control', onControlIntent);
    wiredBus.on('rover2:clean', onCleanIntent);
    exitRover2Control();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (event) => {
      if (!controllingRover2) return;
      if (driveCodes.has(event.code)) {
        event.preventDefault();
        controlKeys.add(event.code);
      } else if (event.code === 'KeyE' && !event.repeat) {
        event.preventDefault();
        cleanWithRover2();
      } else if (event.code === 'KeyQ' || event.code === 'Escape') {
        event.preventDefault();
        exitRover2Control();
      }
    });
    window.addEventListener('keyup', (event) => controlKeys.delete(event.code));
  }

  const tint = new THREE.Color();
  let shownAngle = NaN;
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
    get isControllingRover2() {
      return controllingRover2;
    },
    /** @param {number} dt real seconds @param {{ drive?: number, turn?: number, cleanPressed?: boolean, exitPressed?: boolean }} [xrInput] */
    update(dt, xrInput = {}) {
      bindSimulationBus();
      const sim = getSim();
      if (controllingRover2 && sim.phase !== 'playing') exitRover2Control();
      const look = fieldLook(sim.time.clock().hourFloat, Boolean(sim.power.stormActive), sim.power.cfg, sim.power.dustFactor ?? 1);
      skyMat.color.setRGB(...look.sky);
      groundMat.color.setScalar(look.ground);
      tint.setScalar(look.panel);
      if (look.daylight && !look.dust) tint.setRGB(look.panel, look.panel, Math.min(1.25, look.panel * 1.2)); // blue glint
      if (look.soil > 0) tint.lerp(DUST_TINT.clone().multiplyScalar(look.ground), Math.min(0.85, look.soil * 1.6)); // settled dust
      panelMat.color.copy(tint);
      legMat.color.setScalar(look.ground);
      /** @type {THREE.MeshBasicMaterial} */ (props.material).color.setScalar(look.ground);
      rover2Mat.color.setRGB(0.67, 0.78, 0.9).multiplyScalar(Math.max(0.25, look.ground));
      /** @type {THREE.MeshBasicMaterial} */ (dustLayer.material).opacity = 0.55 * look.dust;
      // Panels follow the tracker angle (only rebuilt when it changes).
      const angle = sim.solarTracker?.angleDeg ?? 0;
      if (!(Math.abs(angle - shownAngle) <= 0.05)) { // also true on the first frame (shownAngle NaN)
        shownAngle = angle;
        rotatePanels(angle);
      }
      if (controllingRover2) {
        const drive = THREE.MathUtils.clamp(
          Number(controlKeys.has('KeyW') || controlKeys.has('ArrowUp')) -
            Number(controlKeys.has('KeyS') || controlKeys.has('ArrowDown')) + (xrInput.drive ?? 0),
          -1,
          1,
        );
        const turn = THREE.MathUtils.clamp(
          Number(controlKeys.has('KeyD') || controlKeys.has('ArrowRight')) -
            Number(controlKeys.has('KeyA') || controlKeys.has('ArrowLeft')) + (xrInput.turn ?? 0),
          -1,
          1,
        );
        rover2.rotation.y += turn * rover2Cfg.turnSpeedRadPerSec * dt;
        const distance = drive * rover2Cfg.moveSpeedMps * dt;
        const bounds = rover2Cfg.bounds;
        rover2.position.x = THREE.MathUtils.clamp(
          rover2.position.x + Math.sin(rover2.rotation.y) * distance,
          bounds.minX,
          bounds.maxX,
        );
        rover2.position.z = THREE.MathUtils.clamp(
          rover2.position.z + Math.cos(rover2.rotation.y) * distance,
          bounds.minZ,
          bounds.maxZ,
        );
        if (xrInput.cleanPressed && !cleanWasPressed) cleanWithRover2();
        if (xrInput.exitPressed && !exitWasPressed) exitRover2Control();
        cleanWasPressed = Boolean(xrInput.cleanPressed);
        exitWasPressed = Boolean(xrInput.exitPressed);
      }
      if (controllingRover2) {
        const roverWorldPosition = rover2.getWorldPosition(new THREE.Vector3());
        const forward = rover2.getWorldDirection(new THREE.Vector3());
        const cameraYaw = Math.atan2(-forward.x, -forward.z);
        dolly.position.set(
          roverWorldPosition.x - forward.x * rover2Cfg.followDistanceM,
          roverWorldPosition.y + rover2Cfg.followHeightM - camera.position.y,
          roverWorldPosition.z - forward.z * rover2Cfg.followDistanceM,
        );
        dolly.rotation.set(0, cameraYaw, 0);
        camera.rotation.set(rover2Cfg.followPitchRad, 0, 0);
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
