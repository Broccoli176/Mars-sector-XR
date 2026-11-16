// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Hidroponía · Agricultura. Soilless growing bench (4 NFT channels with rockwool cubes, LED grow lights,
// seed kiosk), watering hose, water + nutrient tanks, spirulina bioreactor, wall guide, and the kitchen
// (pantry, one-button food processor, bar dispenser).
// Panels are pictograms (hydroIcons.js) so young players can read them; every station has an «Info» button
// that opens a text sheet with the rigorous version. Real facts: src/data/real/csa_food.json (CSA) +
// bioregen_crops.json (NASA NTRS).
// The simulation (src/systems/Food.js, src/systems/Kitchen.js) owns the state; this file only reads it and
// emits intents: hydro:sow, hydro:water, hydro:feed, food:harvest, kitchen:auto, kitchen:eat.
// Placement: src/data/stations/hydro.json
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, BUTTON, statusColor } from '../../ui/StationKit.js';
import { Panel } from '../../ui/Panel.js';
import { moistureState, nextSeed, plantStage, currentStep, createWaterBatcher } from './hydroRules.js';
import { cropGeometry, paint } from './plants.js';
import { freshnessLines, freshnessLevel } from './kitchenRules.js';
import * as icon from './hydroIcons.js';
import { addInfo } from '../../ui/InfoSheet.js';

const TRAY_XS = [-1.2, -0.4, 0.4, 1.2];
const TRAY_W = 0.7;
const TRAY_D = 0.42;
const TRAY_Z = 0.32;
const GAUGE_H = 0.18; // m, sight tube that shows the water level of a channel

/** Shared between the bench (hose targets, chosen seed) and the hose station. Presentation-only. */
const hydroState = {
  /** @type {THREE.Mesh[]} invisible aim volumes, userData.trayId */
  targets: [],
  /** @type {string | null} tray currently under the spray */
  watering: null,
};

/** One material for all static, vertex-coloured props of the room. */
const STATIC_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });
const pbox = (/** @type {number} */ w, /** @type {number} */ h, /** @type {number} */ d, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z, /** @type {string} */ color) =>
  paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
const pcyl = (/** @type {number} */ r, /** @type {number} */ len, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z, /** @type {string} */ color, alongX = false) => {
  const geo = new THREE.CylinderGeometry(r, r, len, 10);
  if (alongX) geo.rotateZ(Math.PI / 2);
  return paint(geo.translate(x, y, z), color);
};
/** Merges painted parts into one static mesh (1 draw call). @param {THREE.Object3D} g @param {THREE.BufferGeometry[]} parts */
function addStatic(g, parts) {
  const mesh = new THREE.Mesh(mergeGeometries(parts), STATIC_MATERIAL);
  g.add(mesh);
  return mesh;
}

const FRESH_COLORS = { fresh: COLORS.nominal, soon: COLORS.warning, urgent: COLORS.critical };

/** Crate colour per raw item in the pantry. */
const CROP_COLORS = /** @type {Record<string, string>} */ ({
  lettuce: '#5fbf4a', tomato: '#d9472b', soybean: '#c9b25a', quinoa: '#d8c89a',
  carrot: '#e8862a', sweet_potato: '#9a4f6a', spirulina: '#2f8f6f',
});

/** Wrapper colour per recipe (bars in the dispenser + panel). */
const RECIPE_COLORS = /** @type {Record<string, string>} */ ({
  bar_energy: '#e0a030', bar_protein: '#4fa3d8', ration_fresh: '#6fcf5a', bar_single: '#c8b48a',
});

/** @type {Record<string, (g: THREE.Group, station: any, kit: import('../../ui/StationKit.js').StationKit) => void>} */
export const builders = {
  /**
   * Growing bench: 4 soilless channels (rockwool cubes, water sight tube with the good zone in green),
   * nutrient pipes, LED grow lights, one pictogram panel + one action button per channel, and the seed kiosk.
   */
  hydro_racks(g, station, kit) {
    const { t, game, sim } = kit;
    const cfg = game.data.balance.food;
    const cropIds = cfg.crops.map((/** @type {any} */ c) => c.id);
    const hours = cfg.crops.map((/** @type {any} */ c) => c.growthHours);
    const kcals = cfg.crops.map((/** @type {any} */ c) => c.kcal);
    const floorY = -station.y;
    const benchTop = 0.9 - station.y;
    const plantY = benchTop + 0.135;
    const gaugeY = benchTop + 0.1;
    const ledY = benchTop + 1.5;
    kit.addBox(g, 3.2, 0.9, 0.55, 0, 0.45 - station.y, TRAY_Z, '#5b5f52');

    // ---- Static hardware: channels, rockwool cubes, sight-tube plates, pipes, pump, light fixture (1 draw call) ----
    /** @type {THREE.BufferGeometry[]} */
    const parts = [];
    for (const x of TRAY_XS) {
      parts.push(pbox(TRAY_W, 0.09, TRAY_D, x, benchTop + 0.045, TRAY_Z, '#e8edf0'));
      parts.push(pbox(TRAY_W - 0.06, 0.012, TRAY_D - 0.06, x, benchTop + 0.096, TRAY_Z, '#c4ccd2'));
      for (const dz of [-0.1, 0.1]) {
        for (const dx of [-0.2, 0, 0.2]) parts.push(pbox(0.075, 0.04, 0.075, x + dx, benchTop + 0.115, TRAY_Z + dz, '#b9a36a'));
      }
      // Sight tube back plate + the good zone in green.
      const gx = x - 0.31;
      parts.push(pbox(0.05, GAUGE_H + 0.02, 0.008, gx, gaugeY + GAUGE_H / 2, TRAY_Z + 0.17, '#20272e'));
      parts.push(pbox(0.05, GAUGE_H * (cfg.floodAt - cfg.dryAt), 0.006, gx, gaugeY + (GAUGE_H * (cfg.dryAt + cfg.floodAt)) / 2, TRAY_Z + 0.176, '#2f8f4f'));
      // Feed stub from the manifold into the channel.
      parts.push(pcyl(0.012, 0.1, x, benchTop + 0.14, TRAY_Z - 0.2, '#6fae7a'));
    }
    parts.push(pcyl(0.02, 3.2, 0, benchTop + 0.19, TRAY_Z - 0.2, '#6fae7a', true)); // nutrient manifold
    parts.push(pcyl(0.022, 0.9, -1.64, floorY + 0.45, TRAY_Z + 0.1, '#6fae7a')); // return to the pump
    parts.push(pbox(0.24, 0.26, 0.3, -1.78, floorY + 0.13, TRAY_Z + 0.1, '#3f5a6a')); // pump
    parts.push(pbox(0.04, 1.5, 0.04, -1.58, benchTop + 0.75, TRAY_Z - 0.2, '#4a525a'));
    parts.push(pbox(0.04, 1.5, 0.04, 1.58, benchTop + 0.75, TRAY_Z - 0.2, '#4a525a'));
    parts.push(pbox(3.2, 0.05, 0.32, 0, ledY, TRAY_Z - 0.06, '#3a4048')); // light housing
    addStatic(g, parts);

    // ---- LED grow lights: pink (red + blue LEDs) when lit, dark at night or without power ----
    const ledMat = new THREE.MeshBasicMaterial({ color: '#2a1a2a', toneMapped: false });
    const leds = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.012, 0.24), ledMat);
    leds.position.set(0, ledY - 0.03, TRAY_Z - 0.06);
    g.add(leds);

    // ---- Water level in each sight tube (instanced, colour per state) ----
    const level = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.013, 0.013, GAUGE_H, 8).translate(0, GAUGE_H / 2, 0),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      4,
    );
    const tmp = new THREE.Object3D();
    const color = new THREE.Color();
    TRAY_XS.forEach((x, i) => {
      tmp.position.set(x - 0.31, gaugeY, TRAY_Z + 0.19);
      tmp.updateMatrix();
      level.setMatrixAt(i, tmp.matrix);
      level.setColorAt(i, color.set('#6fc3ff'));
    });
    g.add(level);

    // ---- Seed kiosk (one seed choice for the whole bench) ----
    const KIOSK_X = -2.02;
    let seed = cropIds[0];
    const kiosk = new Panel(0.46, 0.46, { pxPerMeter: 560 });
    kiosk.mesh.position.set(KIOSK_X, 0.1, 0.01);
    g.add(kiosk.mesh);
    kit.addButton(g, { width: 0.3, height: 0.08, label: t('hydro.btn.seed'), color: BUTTON.info, onSelect: () => {
      seed = nextSeed(cropIds, seed);
    } }, KIOSK_X, -0.2);
    const dots = (/** @type {number[]} */ all, /** @type {number} */ v) => {
      const min = Math.min(...all);
      const max = Math.max(...all);
      return 1 + Math.round((4 * (v - min)) / Math.max(1, max - min));
    };

    // ---- Channels: plant, hose target, panel, action button ----
    const trays = TRAY_XS.map((x, i) => {
      const trayId = cfg.trays[i].id;
      const material = new THREE.MeshLambertMaterial({ vertexColors: true });
      const plant = new THREE.Mesh(cropGeometry('lettuce', 'sprout'), material);
      plant.position.set(x, plantY, TRAY_Z);
      plant.visible = false;
      g.add(plant);
      // Invisible aim volume for the hose (channel + plant), never in the ray-interactive list.
      const target = new THREE.Mesh(new THREE.BoxGeometry(TRAY_W, 0.5, TRAY_D), new THREE.MeshBasicMaterial());
      target.position.set(x, benchTop + 0.25, TRAY_Z);
      target.visible = false;
      target.userData.trayId = trayId;
      g.add(target);
      hydroState.targets.push(target);

      const panel = new Panel(0.74, 0.34, { pxPerMeter: 640 });
      panel.mesh.position.set(x, 0.42, 0.01);
      g.add(panel.mesh);

      const actionBtn = kit.addButton(g, { width: 0.34, height: 0.09, label: '', onSelect: () => {
        const tray = sim().food.tray(trayId);
        if (!tray) return;
        if (!tray.cropId) game.intent('hydro:sow', { trayId, cropId: seed });
        else if (tray.ready) game.intent('food:harvest', { trayId });
      } }, x, benchTop - 0.1);
      actionBtn.mesh.parent?.position.setZ(TRAY_Z + 0.29); // on the front lip of the bench
      return { trayId, plant, material, panel, actionBtn, index: i, lastGeo: '', lastScale: -1 };
    });

    addInfo(g, kit, {
      bx: KIOSK_X, by: -0.31, px: 0, py: 0.5, w: 2.2, h: 0.95,
      title: () => t('hydro.info.racks.title'),
      lines: () => {
        const hydro = game.data.balance.circuits.hydro;
        return [
          { text: t('hydro.info.racks.1'), size: 0.8 },
          { text: t('hydro.info.racks.2', { dry: Math.round(cfg.dryAt * 100), flood: Math.round(cfg.floodAt * 100) }), size: 0.8 },
          { text: t('hydro.info.racks.3', { start: hydro.activeStartHour, end: hydro.activeEndHour }), size: 0.8 },
          { text: t('hydro.info.racks.4', { co2: cfg.photosynthesis?.co2PerTrayHour ?? 0 }), color: COLORS.info, size: 0.8 },
          { text: t('hydro.info.racks.5'), size: 0.8 },
          { text: t('hydro.info.general'), color: COLORS.dim, size: 0.65 },
        ];
      },
    });

    kit.onRefresh(() => {
      const s = sim();
      const f = s.food;
      const crops = f.crops;
      const powered = Boolean(s.power.served.hydro);
      ledMat.color.set(f.lightsOn ? '#ff5fd0' : '#2a1a2a');

      // Seed kiosk.
      const sc = crops[seed];
      const seedName = t(`real.crop.${seed}`);
      const timeDots = dots(hours, sc.growthHours);
      const foodDots = dots(kcals, sc.kcal);
      kiosk.renderCustom(`seed|${seed}`, (ctx, w, h) => {
        icon.frame(ctx, w, h, COLORS.info);
        icon.text(ctx, t('hydro.seed.title'), w / 2, h * 0.1, { size: h * 0.1, color: COLORS.title, bold: true, align: 'center' });
        icon.cropIcon(ctx, seed, w / 2, h * 0.38, h * 0.2, COLORS.info);
        icon.text(ctx, seedName, w / 2, h * 0.66, { size: h * 0.11, bold: true, align: 'center', maxWidth: w * 0.9 });
        /** @param {string} label @param {number} n @param {number} y @param {string} c */
        const row = (label, n, y, c) => {
          icon.text(ctx, label, w * 0.08, y, { size: h * 0.075, color: COLORS.dim });
          for (let k = 0; k < 5; k++) {
            ctx.beginPath();
            ctx.arc(w * 0.5 + k * w * 0.095, y, h * 0.03, 0, Math.PI * 2);
            ctx.fillStyle = k < n ? c : '#26303a';
            ctx.fill();
          }
        };
        row(t('hydro.seed.time'), timeDots, h * 0.79, COLORS.warning);
        row(t('hydro.seed.food'), foodDots, h * 0.9, COLORS.nominal);
      });

      trays.forEach((v) => {
        const tray = f.tray(v.trayId);
        if (!tray) return;
        const state = moistureState(tray.moisture, cfg);

        // Sight tube.
        tmp.position.set(TRAY_XS[v.index] - 0.31, gaugeY, TRAY_Z + 0.19);
        tmp.scale.set(1, Math.max(0.04, Math.min(1, tray.moisture)), 1);
        tmp.updateMatrix();
        level.setMatrixAt(v.index, tmp.matrix);
        level.setColorAt(v.index, color.set(state === 'ok' ? '#6fc3ff' : state === 'dry' ? '#ffbf3f' : '#ff6b5c'));

        const title = t('hydro.tray.title', { n: v.index + 1 });
        if (!tray.cropId) {
          v.panel.renderCustom(`empty|${title}`, (ctx, w, h) => {
            icon.frame(ctx, w, h);
            icon.sprout(ctx, h * 0.38, h * 0.5, h * 0.24, COLORS.dim);
            icon.text(ctx, title, h * 0.8, h * 0.2, { size: h * 0.12, color: COLORS.title, bold: true });
            icon.text(ctx, t('hydro.tray.empty_title'), h * 0.8, h * 0.48, { size: h * 0.19, color: COLORS.dim, bold: true, maxWidth: w - h * 0.9 });
            icon.text(ctx, t('hydro.tray.empty_hint'), h * 0.8, h * 0.76, { size: h * 0.15, color: COLORS.info, maxWidth: w - h * 0.9 });
          });
          v.actionBtn.setState(t('hydro.btn.sow'), BUTTON.on);
          v.plant.visible = false;
          v.lastGeo = '';
          return;
        }

        const crop = crops[tray.cropId];
        const name = t(`real.crop.${crop.id}`);
        const growth = tray.ready ? 1 : Math.min(1, tray.growthHours / crop.growthHours);
        const hungry = f.hungry;
        /** @type {[string, string]} */
        const [msgKey, msgColor] = tray.ready ? ['hydro.msg.ready', COLORS.warning]
          : !powered ? ['hydro.msg.dark', COLORS.critical]
          : state === 'dry' ? ['hydro.msg.dry', COLORS.critical]
          : state === 'flooded' ? ['hydro.msg.flooded', COLORS.critical]
          : hydroState.watering === v.trayId ? ['hydro.msg.watering', COLORS.info]
          : hungry ? ['hydro.msg.hungry', COLORS.warning]
          : f.cold ? ['hydro.msg.cold', COLORS.info]
          : ['hydro.msg.ok', COLORS.nominal];
        const border = tray.ready ? COLORS.warning : msgColor === COLORS.critical ? COLORS.critical : COLORS.border;
        const key = [crop.id, Math.round(growth * 50), Math.round(tray.moisture * 50), msgKey, f.lightsOn].join('|');
        v.panel.renderCustom(key, (ctx, w, h) => {
          icon.frame(ctx, w, h, border);
          const r = h * 0.26;
          const pad = h * 0.09;
          icon.cropIcon(ctx, crop.id, pad + r, h * 0.38, r, border);
          const x0 = pad * 2 + r * 2;
          const rw = w - x0 - pad;
          icon.text(ctx, name, x0, h * 0.16, { size: h * 0.16, bold: true, maxWidth: rw - h * 0.22 });
          icon.lightIcon(ctx, w - pad - h * 0.08, h * 0.16, h * 0.08, f.lightsOn);
          icon.sprout(ctx, x0 + h * 0.06, h * 0.38, h * 0.07);
          icon.bar(ctx, x0 + h * 0.17, h * 0.33, rw - h * 0.17, h * 0.1, growth, tray.ready ? COLORS.warning : COLORS.nominal);
          icon.drop(ctx, x0 + h * 0.06, h * 0.59, h * 0.12);
          icon.waterGauge(ctx, x0 + h * 0.17, h * 0.53, rw - h * 0.17, h * 0.1, tray.moisture, cfg);
          icon.text(ctx, t(msgKey), pad, h * 0.83, { size: h * 0.16, color: msgColor, bold: true, maxWidth: w - pad * 2 });
        });
        v.actionBtn.setState(t(tray.ready ? 'hydro.btn.harvest' : 'hydro.btn.growing'), tray.ready ? BUTTON.warn : BUTTON.off);

        // Plant model: sprout → young → mature; yellowish and drooping when it needs care.
        const stage = tray.ready ? 'mature' : plantStage(growth);
        const geoKey = `${crop.id}:${stage}`;
        if (geoKey !== v.lastGeo) {
          v.plant.geometry = cropGeometry(crop.id, stage);
          v.lastGeo = geoKey;
        }
        v.plant.visible = true;
        const scale = tray.ready ? 1.05
          : stage === 'sprout' ? 1 + growth * 2
          : stage === 'young' ? 0.5 + (0.5 * (growth - 0.15)) / 0.55
          : 0.85 + (0.15 * (growth - 0.7)) / 0.3;
        if (Math.abs(scale - v.lastScale) > 0.005) {
          v.lastScale = scale;
          v.plant.scale.setScalar(scale);
        }
        v.material.color.set(tray.neglectHours > 0 ? '#d8c27a' : hungry ? '#dfe8b0' : '#ffffff');
        v.plant.rotation.z = tray.neglectHours > 0 && state === 'dry' ? 0.12 : 0;
      });
      level.instanceMatrix.needsUpdate = true;
      if (level.instanceColor) level.instanceColor.needsUpdate = true;
    });
  },

  /** Hose reel with a grabbable nozzle: hold the trigger (F on desktop) and aim at a channel to water it. */
  hydro_hose(g, _station, kit) {
    const { t, game } = kit;
    const { scene } = kit.services;
    const hoseCfg = game.data.balance.food.hose;

    // Reel on the wall + instructions.
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 18).rotateX(Math.PI / 2), kit.lambert('#2f6f8f'));
    reel.position.set(0, 0, 0.06);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 12).rotateX(Math.PI / 2), kit.lambert('#e0b030'));
    hub.position.set(0, 0, 0.07);
    g.add(reel, hub);
    const panel = kit.addPanel(g, 0.62, 0.3, 0, 0.42);
    panel.renderLines(t('hydro.hose.title'), [
      { text: t('hydro.hose.hint'), size: 0.85 },
      { text: t('hydro.hose.desktop'), color: COLORS.dim, size: 0.7 },
    ]);

    // Nozzle: grip at the origin, pointing along −z (like the controller and the hub tools).
    const nozzleGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.12, 10).rotateX(Math.PI / 2);
    // `nozzle` is an invisible grab zone (0.22 × 0.22 × 0.34 m) much easier to hit with the ray than the
    // thin nozzle itself; the visible nozzle is its child (same pattern as the hub tools).
    const nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.34).translate(0, 0, -0.04), new THREE.MeshBasicMaterial({ visible: false }));
    const nozzleVisual = new THREE.Mesh(nozzleGeo, kit.lambert('#e0b030'));
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.07, 10).rotateX(Math.PI / 2).translate(0, 0, -0.09), kit.lambert('#2f6f8f'));
    nozzleVisual.add(tip);
    nozzle.add(nozzleVisual);
    const zoneRaycast = nozzle.raycast;
    const home = new THREE.Group();
    home.position.set(0.12, -0.24, 0.12);
    home.rotation.x = -Math.PI / 2; // hangs pointing down
    g.add(home);
    home.add(nozzle);
    kit.registerInteractive(nozzle);

    // Hose: a sagging curve from the reel to the nozzle (world space, 1 draw call).
    const SEG = 14;
    const hosePos = new Float32Array((SEG + 1) * 3);
    const hoseGeo = new THREE.BufferGeometry();
    hoseGeo.setAttribute('position', new THREE.BufferAttribute(hosePos, 3));
    const hose = new THREE.Line(hoseGeo, new THREE.LineBasicMaterial({ color: '#3f8faf' }));
    hose.frustumCulled = false;
    scene.add(hose);

    // Spray particles (world space, 1 draw call).
    const N = 48;
    const sprayPos = new Float32Array(N * 3);
    const vel = Array.from({ length: N }, () => new THREE.Vector3());
    const life = new Float32Array(N).fill(-1);
    const sprayGeo = new THREE.BufferGeometry();
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
    const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: '#8fd3ff', size: 0.025, transparent: true, opacity: 0.85 }));
    spray.frustumCulled = false;
    spray.visible = false;
    scene.add(spray);

    let spraying = false;
    let held = false;
    const batcher = createWaterBatcher({ flow: hoseCfg.flowLitersPerSecond, flushEvery: 0.25 }, (trayId, liters) =>
      game.intent('hydro:water', { trayId, liters }));
    const raycaster = new THREE.Raycaster();
    raycaster.far = hoseCfg.rangeMeters;

    nozzle.userData.grab = {
      onGrab: () => {
        held = true;
        nozzle.raycast = () => {}; // held: must not block the ray (desktop camera / the other hand)
      },
      onRelease: () => {
        held = false;
        nozzle.raycast = zoneRaycast;
        spraying = false;
        batcher.stop();
        hydroState.watering = null;
        home.add(nozzle); // the hose rewinds: straight back to the reel
        nozzle.position.set(0, 0, 0);
        nozzle.rotation.set(0, 0, 0);
      },
      onUse: (/** @type {boolean} */ active) => {
        spraying = active && held;
        if (!spraying) {
          batcher.stop();
          hydroState.watering = null;
        }
      },
    };

    const reelWorld = new THREE.Vector3();
    const tipWorld = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const tipLocal = new THREE.Vector3(0, 0, -0.13);
    // The spray is a cone, not a laser: try the centre and 8 rays ≈ 10° around it.
    const side = new THREE.Vector3();
    const up = new THREE.Vector3();
    const probe = new THREE.Vector3();
    const CONE = Math.tan((10 * Math.PI) / 180);
    /** @param {THREE.Vector3} from @param {THREE.Vector3} d @returns {string | null} */
    const sprayTarget = (from, d) => {
      side.set(0, 1, 0).cross(d);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      up.copy(d).cross(side).normalize();
      for (let k = -1; k < 8; k++) {
        probe.copy(d);
        if (k >= 0) {
          const a = (k / 8) * Math.PI * 2;
          probe.addScaledVector(side, Math.cos(a) * CONE).addScaledVector(up, Math.sin(a) * CONE).normalize();
        }
        raycaster.set(from, probe);
        const hit = raycaster.intersectObjects(hydroState.targets, false)[0];
        if (hit) return hit.object.userData.trayId ?? null;
      }
      return null;
    };
    let emitAcc = 0;

    kit.onFrame((dt) => {
      // Hose curve.
      hub.getWorldPosition(reelWorld);
      nozzle.localToWorld(tipWorld.set(0, 0, 0.06));
      const sag = Math.min(0.6, reelWorld.distanceTo(tipWorld) * 0.35);
      for (let i = 0; i <= SEG; i++) {
        const k = i / SEG;
        hosePos[i * 3] = reelWorld.x + (tipWorld.x - reelWorld.x) * k;
        hosePos[i * 3 + 1] = reelWorld.y + (tipWorld.y - reelWorld.y) * k - sag * 4 * k * (1 - k);
        hosePos[i * 3 + 2] = reelWorld.z + (tipWorld.z - reelWorld.z) * k;
      }
      hoseGeo.attributes.position.needsUpdate = true;

      // Aim + water.
      nozzle.localToWorld(tipWorld.copy(tipLocal));
      nozzle.getWorldQuaternion(q);
      dir.set(0, 0, -1).applyQuaternion(q);
      let target = null;
      if (spraying) {
        target = sprayTarget(tipWorld, dir);
        batcher.update(target, dt);
      }
      hydroState.watering = target;

      // Particles: emit while spraying, fall under gravity.
      spray.visible = spraying || life.some((l) => l > 0);
      if (!spray.visible) return;
      emitAcc += spraying ? dt * 160 : 0;
      for (let i = 0; i < N; i++) {
        if (life[i] > 0) {
          life[i] -= dt;
          vel[i].y -= 9.8 * dt;
          sprayPos[i * 3] += vel[i].x * dt;
          sprayPos[i * 3 + 1] += vel[i].y * dt;
          sprayPos[i * 3 + 2] += vel[i].z * dt;
        } else if (emitAcc >= 1) {
          emitAcc -= 1;
          life[i] = 0.45;
          // No temporary arrays or vectors here: this runs for every droplet while you water.
          sprayPos[i * 3] = tipWorld.x;
          sprayPos[i * 3 + 1] = tipWorld.y;
          sprayPos[i * 3 + 2] = tipWorld.z;
          vel[i].copy(dir).multiplyScalar(2.6);
          vel[i].x += (Math.random() - 0.5) * 0.4;
          vel[i].y += (Math.random() - 0.5) * 0.4;
          vel[i].z += (Math.random() - 0.5) * 0.4;
        } else {
          sprayPos[i * 3 + 1] = -100; // parked out of sight
        }
      }
      sprayGeo.attributes.position.needsUpdate = true;
    });
  },

  /** Spirulina photobioreactor: grows and releases O₂ only under light; harvest restarts the cycle. */
  hydro_bioreactor(g, station, kit) {
    const { t, game, sim } = kit;
    const bioCfg = game.data.balance.food.bioreactor;
    const floorY = -station.y;
    kit.addCylinder(g, 0.34, 0.12, 0, floorY + 0.06, 0.4, '#4a525a');
    const glassMat = new THREE.MeshLambertMaterial({ color: '#2f9f5f', transparent: true, opacity: 0.8, emissive: '#0f3f1f' });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.3, 20), glassMat);
    tank.position.set(0, floorY + 0.77, 0.4);
    g.add(tank);
    kit.solids.push(tank);
    kit.addCylinder(g, 0.3, 0.06, 0, floorY + 1.45, 0.4, '#c9d1d9');

    // Bubbles rising inside the tank while lit (1 draw call).
    const B = 24;
    const bubblePos = new Float32Array(B * 3);
    for (let i = 0; i < B; i++) bubblePos.set([(Math.random() - 0.5) * 0.4, floorY + 0.15 + Math.random() * 1.2, 0.4 + (Math.random() - 0.5) * 0.4], i * 3);
    const bubbleGeo = new THREE.BufferGeometry();
    bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePos, 3));
    const bubbles = new THREE.Points(bubbleGeo, new THREE.PointsMaterial({ color: '#d8ffe8', size: 0.02, transparent: true, opacity: 0.8 }));
    g.add(bubbles);
    kit.onFrame((dt) => {
      const lit = sim().food.lightsOn;
      bubbles.visible = lit;
      glassMat.emissive.set(lit ? '#1f6f3a' : '#0a1f12');
      if (!lit) return;
      for (let i = 0; i < B; i++) {
        let y = bubblePos[i * 3 + 1] + dt * (0.15 + (i % 5) * 0.04);
        if (y > floorY + 1.38) y = floorY + 0.15;
        bubblePos[i * 3 + 1] = y;
      }
      bubbleGeo.attributes.position.needsUpdate = true;
    });

    const panel = new Panel(0.66, 0.4, { pxPerMeter: 560 });
    panel.mesh.position.set(0.66, 0.1, 0);
    g.add(panel.mesh);
    const harvest = kit.addButton(g, { width: 0.3, height: 0.09, label: t('hydro.btn.harvest'),
      onSelect: () => game.intent('food:harvest', { trayId: 'bioreactor' }) }, 0.56, -0.2);
    addInfo(g, kit, {
      bx: 0.84, by: -0.2, px: 0.66, py: 0.42, w: 0.9, h: 0.6,
      title: () => t('hydro.info.bio.title'),
      lines: () => {
        const bio = sim().food.bioreactor;
        return [
          { text: t('hydro.info.bio.1', { pct: Math.floor((100 * bio.growthHours) / bioCfg.growthHours), hours: bioCfg.growthHours, kcal: bioCfg.kcal }), size: 0.8 },
          { text: t('hydro.bio.o2', { o2: bio.o2Total.toFixed(1) }), color: COLORS.info, size: 0.8 },
          { text: t('hydro.bio.fact'), size: 0.78 },
          { text: t('hydro.bio.source'), color: COLORS.dim, size: 0.65 },
        ];
      },
    });
    kit.onRefresh(() => {
      const f = sim().food;
      const bio = f.bioreactor;
      const pct = bio.ready ? 1 : bio.growthHours / bioCfg.growthHours;
      /** @type {[string, string]} */
      const [msgKey, msgColor] = bio.ready ? ['hydro.bio.msg_ready', COLORS.warning]
        : !f.lightsOn ? ['hydro.bio.msg_dark', COLORS.dim]
        : ['hydro.bio.msg_ok', COLORS.nominal];
      const border = bio.ready ? COLORS.warning : COLORS.border;
      panel.renderCustom([Math.round(pct * 50), msgKey, f.lightsOn].join('|'), (ctx, w, h) => {
        icon.frame(ctx, w, h, border);
        const r = h * 0.24;
        const pad = h * 0.09;
        icon.cropIcon(ctx, 'spirulina', pad + r, h * 0.4, r, border);
        const x0 = pad * 2 + r * 2;
        const rw = w - x0 - pad;
        icon.text(ctx, t('hydro.bio.title'), x0, h * 0.2, { size: h * 0.13, color: COLORS.title, bold: true, maxWidth: rw - h * 0.2 });
        icon.lightIcon(ctx, w - pad - h * 0.07, h * 0.2, h * 0.07, f.lightsOn);
        icon.bar(ctx, x0, h * 0.42, rw, h * 0.11, pct, bio.ready ? COLORS.warning : COLORS.nominal);
        icon.text(ctx, t(msgKey), pad, h * 0.82, { size: h * 0.14, color: msgColor, bold: true, maxWidth: w - pad * 2 });
      });
      harvest.setState(t('hydro.btn.harvest'), bio.ready ? BUTTON.warn : BUTTON.off);
    });
  },

  /** Water tank + nutrient solution reservoir («Nutrientes +» uses one cartridge). */
  hydro_water(g, station, kit) {
    const { t, game, sim } = kit;
    const cfg = game.data.balance.food;
    const nut = cfg.nutrients;
    const floorY = -station.y;
    kit.addCylinder(g, 0.4, 1.8, 0.9, 0.9 - station.y, 0.45, '#4f7f8f');
    // Nutrient reservoir with a level window.
    kit.addBox(g, 0.44, 0.7, 0.4, -0.72, floorY + 0.35, 0.26, '#6a5a86');
    addStatic(g, [
      pbox(0.1, 0.52, 0.01, -0.72, floorY + 0.36, 0.465, '#1b232c'),
      pcyl(0.02, 0.5, -0.72, floorY + 0.95, 0.2, '#6fae7a'),
      pbox(0.16, 0.06, 0.16, -0.72, floorY + 0.73, 0.26, '#c9d1d9'),
    ]);
    const levelMat = new THREE.MeshBasicMaterial({ color: '#b77fe0', toneMapped: false });
    const level = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.006).translate(0, 0.25, 0), levelMat);
    level.position.set(-0.72, floorY + 0.11, 0.473);
    g.add(level);

    const panel = new Panel(0.74, 0.4, { pxPerMeter: 560 });
    panel.mesh.position.set(0, 0.04, 0);
    g.add(panel.mesh);
    const feed = kit.addButton(g, { width: 0.34, height: 0.09, label: t('hydro.btn.feed'),
      onSelect: () => game.intent('hydro:feed', {}) }, -0.1, -0.27);
    addInfo(g, kit, {
      bx: 0.22, by: -0.27, px: 0, py: 0.42, w: 1.2, h: 0.8,
      title: () => t('hydro.info.tank.title'),
      lines: () => {
        const f = sim().food;
        return [
          { text: t('hydro.info.tank.1'), size: 0.8 },
          { text: t('hydro.info.tank.2'), size: 0.8 },
          { text: t('hydro.info.tank.3', {
            level: Math.round(f.nutrients * 100), low: Math.round((nut?.lowAt ?? 0) * 100),
            step: Math.round((nut?.perCartridge ?? 0) * 100), count: f.cartridges,
          }), color: COLORS.info, size: 0.8 },
          { text: t('hydro.info.tank.4', { condensate: Math.round(game.data.balance.water.hydroCondensateFraction * 100) }), size: 0.8 },
          { text: t('hydro.info.general'), color: COLORS.dim, size: 0.65 },
        ];
      },
    });
    kit.onRefresh(() => {
      const s = sim();
      const f = s.food;
      const w = s.resources.get('water');
      const low = Boolean(nut) && f.nutrients < nut.lowAt;
      const recyclerOk = !s.lifeSupport.recyclerStuck && s.power.served.lifeSupport;
      const recycler = t('ui.water.recycler', { state: t(recyclerOk ? 'ui.state.ok' : 'ui.state.unpowered') });
      level.scale.y = Math.max(0.02, f.nutrients);
      levelMat.color.set(low ? '#ffbf3f' : '#b77fe0');
      const key = [Math.round(w.value * 2), w.status, Math.round(f.nutrients * 50), f.cartridges, low, recycler].join('|');
      panel.renderCustom(key, (ctx, W, H) => {
        icon.frame(ctx, W, H, low ? COLORS.warning : COLORS.border);
        const pad = H * 0.1;
        const colW = (W - pad * 3) / 2;
        // Water.
        icon.drop(ctx, pad + H * 0.1, H * 0.22, H * 0.2);
        icon.text(ctx, t('hydro.tank.water'), pad + H * 0.24, H * 0.2, { size: H * 0.13, color: COLORS.title, bold: true, maxWidth: colW - H * 0.24 });
        icon.bar(ctx, pad, H * 0.38, colW, H * 0.11, w.value / w.max, statusColor(w.status));
        icon.text(ctx, t('hydro.tank.liters', { liters: w.value.toFixed(0) }), pad, H * 0.62, { size: H * 0.14, color: statusColor(w.status), bold: true });
        // Nutrients.
        const x1 = pad * 2 + colW;
        icon.flask(ctx, x1 + H * 0.09, H * 0.2, H * 0.24, f.nutrients, low ? '#ffbf3f' : '#b77fe0');
        icon.text(ctx, t('hydro.tank.nutrients'), x1 + H * 0.24, H * 0.2, { size: H * 0.13, color: COLORS.title, bold: true, maxWidth: colW - H * 0.24 });
        icon.bar(ctx, x1, H * 0.38, colW, H * 0.11, f.nutrients, low ? COLORS.warning : '#b77fe0');
        icon.text(ctx, low ? t('hydro.tank.low') : t('hydro.tank.cartridges', { count: f.cartridges }), x1, H * 0.62,
          { size: H * 0.13, color: low ? COLORS.warning : COLORS.text, bold: low, maxWidth: colW });
        icon.text(ctx, recycler, pad, H * 0.86, { size: H * 0.1, color: recyclerOk ? COLORS.dim : COLORS.warning, maxWidth: W - pad * 2 });
      });
      feed.setState(t('hydro.btn.feed'), f.cartridges > 0 ? (low ? BUTTON.warn : BUTTON.on) : BUTTON.off);
    });
  },

  /**
   * Wall guide: 4 pictogram steps (sow → water → harvest → make bars); the one to do now lights up.
   * Its «Info» sheet keeps the real crop cycles (CSA) and the NASA quinoa / spirulina facts.
   */
  hydro_cropguide(g, _station, kit) {
    const { t, game, sim } = kit;
    const cfg = game.data.balance.food;
    const csa = game.data.real?.csa_food;
    const nasa = game.data.real?.bioregen_crops;
    const panel = new Panel(1.05, 0.8, { pxPerMeter: 520 });
    g.add(panel.mesh);
    /** @type {['sow' | 'water' | 'harvest' | 'cook', (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => void][]} */
    const steps = [
      ['sow', (ctx, cx, cy, r) => icon.sprout(ctx, cx, cy, r)],
      ['water', (ctx, cx, cy, r) => icon.drop(ctx, cx, cy + r * 0.2, r * 1.5)],
      ['harvest', (ctx, cx, cy, r) => icon.cropIcon(ctx, 'tomato', cx, cy, r)],
      ['cook', (ctx, cx, cy, r) => icon.foodBar(ctx, cx, cy, r * 2.2)],
    ];
    kit.onRefresh(() => {
      const s = sim();
      const now = currentStep(s.food, s.kitchen, cfg);
      const hungry = s.food.hungry;
      const cold = s.food.cold;
      panel.renderCustom(`${now}|${hungry}|${cold}`, (ctx, w, h) => {
        icon.frame(ctx, w, h, COLORS.info);
        icon.text(ctx, t('hydro.steps.title'), w / 2, h * 0.09, { size: h * 0.085, color: COLORS.title, bold: true, align: 'center', maxWidth: w * 0.9 });
        const pad = w * 0.04;
        const tw = (w - pad * 3) / 2;
        const th = h * 0.3;
        steps.forEach(([id, draw], i) => {
          const x = pad + (i % 2) * (tw + pad);
          const y = h * 0.17 + Math.floor(i / 2) * (th + pad * 0.7);
          const active = id === now;
          icon.tile(ctx, x, y, tw, th, active ? '#1f3a2a' : '#161d25', active ? COLORS.nominal : COLORS.border, active ? 7 : 3);
          icon.badge(ctx, x + th * 0.24, y + th * 0.26, th * 0.16, String(i + 1), active ? COLORS.nominal : COLORS.dim);
          draw(ctx, x + tw * 0.3, y + th * 0.6, th * 0.24);
          icon.text(ctx, t(`hydro.steps.${id}`), x + tw * 0.52, y + th * 0.5, { size: th * 0.24, color: active ? COLORS.text : COLORS.dim, bold: active, maxWidth: tw * 0.45 });
        });
        const msg = now !== 'wait' ? now : hungry ? 'feed' : cold ? 'cold' : now;
        icon.text(ctx, t(`hydro.steps.now.${msg}`), w / 2, h * 0.91, {
          size: h * 0.075, color: msg === 'wait' ? COLORS.nominal : COLORS.warning, bold: true, align: 'center', maxWidth: w * 0.92,
        });
      });
    });

    addInfo(g, kit, {
      bx: 0, by: -0.46, px: 0, py: 0, w: 1.05, h: 0.8,
      title: () => t('hydro.info.guide.title'),
      lines: () => {
        if (!csa) return [{ text: t('hydro.guide.no_data'), color: COLORS.warning }];
        const s = sim();
        const kcalPerDay = Math.round((s.balance.food.consumptionPerHour * 24) / 100) * 100;
        const crops = s.food.crops;
        return [
          ...csa.crops.items.map((/** @type {any} */ c) => ({
            text: crops[c.id]
              ? t('hydro.guide.crop_game', { name: t(c.nameKey), min: c.daysMin, max: c.daysMax, hours: crops[c.id].growthHours })
              : t('hydro.guide.crop', { name: t(c.nameKey), min: c.daysMin, max: c.daysMax }),
            color: crops[c.id] ? COLORS.nominal : COLORS.dim,
            size: 0.78,
          })),
          ...(nasa
            ? [
                { text: t('hydro.guide.quinoa', { min: nasa.quinoa.proteinPctMin, max: nasa.quinoa.proteinPctMax, hours: crops.quinoa?.growthHours ?? '—' }), color: COLORS.nominal, size: 0.78 },
                { text: t('hydro.guide.spirulina', { pct: nasa.spirulina.proteinPctUpTo }), color: COLORS.nominal, size: 0.78 },
              ]
            : []),
          { text: t('hydro.guide.compressed'), color: COLORS.dim, size: 0.7 },
          { text: t('hydro.guide.diet', { min: csa.crewDiet.kcalPerDayMin, max: csa.crewDiet.kcalPerDayMax, game: kcalPerDay }), size: 0.75 },
          { text: t('hydro.guide.source', { date: formatDay(csa.source.retrievedAt) }), color: COLORS.dim, size: 0.65 },
        ];
      },
    });
  },

  hydro_food(g, _station, kit) {
    const { t, sim } = kit;
    const panel = kit.addPanel(g, 0.6, 0.32);
    kit.onRefresh(() => {
      const f = sim().resources.get('food');
      panel.renderLines(t('ui.food.title'), [
        { text: `${Math.round(f.value)} kcal   ${t(`ui.status.${f.status}`)}`, color: statusColor(f.status), size: 1.2 },
        t('ui.food.days', { days: (f.value / (sim().balance.food.consumptionPerHour * 24)).toFixed(1) }),
      ]);
    });
  },

  /** Pantry: raw harvest as crates on a cabinet (1 instanced draw call), freshness traffic light, «Comer». */
  hydro_pantry(g, station, kit) {
    const { t, game, sim } = kit;
    const floorY = -station.y;
    const shelf = game.data.balance.kitchen.rawShelfHours;
    kit.addBox(g, 0.9, 1.1, 0.45, 0, floorY + 0.55, 0.26, '#6f7a80');
    addStatic(g, [
      pbox(0.92, 0.03, 0.47, 0, floorY + 1.115, 0.26, '#c9d1d9'),
      pbox(0.86, 0.3, 0.02, 0, floorY + 1.28, 0.05, '#4a525a'),
      pbox(0.03, 0.34, 0.45, -0.445, floorY + 1.28, 0.26, '#4a525a'),
      pbox(0.03, 0.34, 0.45, 0.445, floorY + 1.28, 0.26, '#4a525a'),
    ]);
    const COLS = 5;
    const ROWS = 2;
    const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.1, 0.17), new THREE.MeshLambertMaterial(), COLS * ROWS);
    const tmp = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < COLS * ROWS; i++) crates.setColorAt(i, color.set('#a0a0a0'));
    crates.count = 0;
    g.add(crates);

    const panel = new Panel(0.74, 0.4, { pxPerMeter: 560 });
    panel.mesh.position.set(0, 0.46, 0);
    g.add(panel.mesh);
    const eat = kit.addButton(g, { width: 0.3, height: 0.08, label: t('hydro.btn.eat_raw'),
      onSelect: () => game.intent('kitchen:eat', {}) }, -0.1, 0.17);
    addInfo(g, kit, {
      bx: 0.2, by: 0.17, px: 0, py: 0.46, w: 0.9, h: 0.56,
      title: () => t('hydro.info.pantry.title'),
      lines: () => {
        const k = sim().kitchen;
        const lots = k ? freshnessLines(k.pantry, shelf) : [];
        return [
          { text: t('hydro.info.pantry.1', { hours: shelf }), size: 0.8 },
          ...(lots.length
            ? lots.map((l) => ({
                text: t('hydro.pantry.line', { name: t(`real.crop.${l.itemId}`), count: l.count, hours: l.hoursLeft.toFixed(1) }),
                color: FRESH_COLORS[freshnessLevel(l.hoursLeft, shelf)],
                size: 0.8,
              }))
            : [{ text: t('hydro.info.pantry.none'), color: COLORS.dim, size: 0.8 }]),
          { text: t('hydro.info.general'), color: COLORS.dim, size: 0.65 },
        ];
      },
    });
    kit.onRefresh(() => {
      const k = sim().kitchen;
      if (!k) return;
      // Crates: one per lot (oldest first), colour per crop.
      const n = Math.min(k.pantry.length, COLS * ROWS);
      for (let i = 0; i < n; i++) {
        tmp.position.set(-0.34 + (i % COLS) * 0.17, floorY + 1.18, 0.36 - Math.floor(i / COLS) * 0.2);
        tmp.updateMatrix();
        crates.setMatrixAt(i, tmp.matrix);
        crates.setColorAt(i, color.set(CROP_COLORS[k.pantry[i].itemId] ?? '#a0a0a0'));
      }
      crates.count = n;
      crates.instanceMatrix.needsUpdate = true;
      if (crates.instanceColor) crates.instanceColor.needsUpdate = true;

      const lots = k.pantry.slice(0, COLS * ROWS).map((/** @type {any} */ lot) =>
        ({ itemId: lot.itemId, level: freshnessLevel(shelf - lot.ageHours, shelf) }));
      const urgent = lots.some((/** @type {any} */ l) => l.level === 'urgent');
      const msgKey = !lots.length ? 'hydro.pantry.msg_empty' : urgent ? 'hydro.pantry.msg_urgent' : 'hydro.pantry.msg_ok';
      const msgColor = !lots.length ? COLORS.dim : urgent ? COLORS.critical : COLORS.nominal;
      const key = `${lots.map((/** @type {any} */ l) => `${l.itemId}:${l.level}`).join(',')}|${msgKey}`;
      panel.renderCustom(key, (ctx, w, h) => {
        icon.frame(ctx, w, h, urgent ? COLORS.critical : COLORS.border);
        icon.text(ctx, t('hydro.pantry.title'), h * 0.1, h * 0.13, { size: h * 0.13, color: COLORS.title, bold: true });
        const r = h * 0.12;
        lots.forEach((/** @type {any} */ l, i) => {
          const cx = h * 0.1 + r + (i % COLS) * ((w - h * 0.2 - r * 2) / (COLS - 1));
          icon.cropIcon(ctx, l.itemId, cx, h * 0.36 + Math.floor(i / COLS) * r * 2.3, r, FRESH_COLORS[/** @type {'fresh'} */ (l.level)]);
        });
        icon.text(ctx, t(msgKey), h * 0.1, h * 0.87, { size: h * 0.13, color: msgColor, bold: true, maxWidth: w - h * 0.2 });
      });
      eat.setState(t('hydro.btn.eat_raw'), k.pantry.length ? BUTTON.warn : BUTTON.off);
    });
  },

  /** Food processor: one button («Hacer barra») picks the best recipe; runs on the hydro circuit. */
  hydro_processor(g, station, kit) {
    const { t, game, sim } = kit;
    const floorY = -station.y;
    const body = kit.addBox(g, 0.9, 1.0, 0.55, 0, floorY + 0.5, 0.3, '#8a8f96', { dynamic: true }); // vibrates while it runs
    const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.08, 0.24, 14), kit.lambert('#c9d1d9'));
    hopper.position.set(-0.18, floorY + 1.12, 0.3);
    g.add(hopper);
    addStatic(g, [
      pbox(0.26, 0.05, 0.2, 0.2, floorY + 0.55, 0.62, '#4a525a'), // output tray
      pbox(0.2, 0.12, 0.02, 0.2, floorY + 0.68, 0.58, '#20272e'), // output slot
      pbox(0.3, 0.2, 0.02, -0.2, floorY + 0.7, 0.58, '#2a3540'), // window
      pcyl(0.025, 0.5, 0.36, floorY + 1.25, 0.12, '#d9b44a'), // power conduit
    ]);
    const lampMat = new THREE.MeshLambertMaterial({ color: '#333333', emissive: '#000000' });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), lampMat);
    lamp.position.set(0.3, floorY + 1.04, 0.3);
    g.add(lamp);

    const panel = new Panel(0.86, 0.42, { pxPerMeter: 560 });
    panel.mesh.position.set(0, 0.4, 0);
    g.add(panel.mesh);
    const processBtn = kit.addButton(g, { width: 0.36, height: 0.09, label: t('hydro.btn.process'),
      onSelect: () => game.intent('kitchen:auto', {}) }, -0.12, 0.1);
    addInfo(g, kit, {
      bx: 0.24, by: 0.1, px: 0, py: 0.52, w: 1.3, h: 0.9,
      title: () => t('hydro.info.kitchen.title'),
      lines: () => {
        const k = sim().kitchen;
        return [
          { text: t('hydro.info.kitchen.1'), size: 0.8 },
          ...(k?.recipes ?? []).map((/** @type {any} */ r) => ({
            text: t('hydro.info.kitchen.recipe', {
              name: t(`real.recipe.${r.id}`),
              inputs: Object.entries(r.inputs).map(([kind, n]) => `${n} ${t(`hydro.kind.${kind}`)}`).join(' + '),
              mult: r.multiplier, hours: r.hours, kw: r.drawKw,
            }),
            color: RECIPE_COLORS[r.id],
            size: 0.75,
          })),
          { text: t('hydro.info.kitchen.2'), size: 0.75 },
          { text: t('hydro.info.kitchen.3'), color: COLORS.info, size: 0.75 },
          { text: t('hydro.info.general'), color: COLORS.dim, size: 0.65 },
        ];
      },
    });

    const baseY = body.position.y;
    let phase = 0;
    kit.onFrame((dt) => {
      const k = sim().kitchen;
      const running = Boolean(k?.busy && k.powered);
      phase += dt * 40;
      body.position.y = running ? baseY + Math.sin(phase) * 0.003 : baseY;
      if (running) hopper.rotation.y += dt * 3;
    });

    kit.onRefresh(() => {
      const k = sim().kitchen;
      if (!k) return;
      const best = k.busy ? k.job.recipeId : k.best();
      const name = best ? t(`real.recipe.${best}`) : '';
      const pct = k.busy ? k.job.progressHours / k.job.hours : 0;
      /** @type {[string, string, string]} message, colour, lamp */
      const [msgKey, msgColor, lampColor] = k.busy
        ? (k.powered ? ['hydro.kitchen.msg_busy', COLORS.warning, '#c88a10'] : ['hydro.kitchen.msg_no_power', COLORS.critical, '#802010'])
        : k.pantry.length === 0 ? ['hydro.kitchen.msg_empty', COLORS.dim, '#000000']
        : !best ? ['hydro.kitchen.msg_missing', COLORS.warning, '#000000']
        : !k.powered ? ['hydro.kitchen.msg_no_power', COLORS.critical, '#802010']
        : ['hydro.kitchen.msg_ready', COLORS.nominal, '#1f8a3a'];
      const barColor = RECIPE_COLORS[best ?? ''] ?? '#5a6570';
      const crates = Math.min(4, k.pantry.length);
      panel.renderCustom([msgKey, best, Math.round(pct * 40), crates].join('|'), (ctx, w, h) => {
        icon.frame(ctx, w, h, k.busy ? COLORS.warning : COLORS.border);
        icon.text(ctx, t('hydro.kitchen.title'), h * 0.1, h * 0.13, { size: h * 0.13, color: COLORS.title, bold: true });
        if (name) icon.text(ctx, name, w - h * 0.1, h * 0.13, { size: h * 0.12, color: barColor, bold: true, align: 'right', maxWidth: w * 0.5 });
        // Crates → machine → bar.
        const cy = h * 0.43;
        for (let i = 0; i < Math.max(1, crates); i++) icon.crate(ctx, w * 0.1 + i * h * 0.13, cy + (i % 2) * h * 0.05, h * 0.2, crates ? '#b98a4a' : '#3a4652');
        icon.arrow(ctx, w * 0.36, cy, h * 0.18);
        icon.gear(ctx, w * 0.5, cy, h * 0.17, k.busy && k.powered ? COLORS.warning : '#9aa7b3', pct * 6);
        icon.arrow(ctx, w * 0.64, cy, h * 0.18);
        icon.foodBar(ctx, w * 0.82, cy, h * 0.42, best ? barColor : '#3a4652');
        if (k.busy) icon.bar(ctx, h * 0.1, h * 0.64, w - h * 0.2, h * 0.08, pct, COLORS.warning);
        icon.text(ctx, t(msgKey, { name }), h * 0.1, h * 0.86, { size: h * 0.13, color: msgColor, bold: true, maxWidth: w - h * 0.2 });
      });
      lampMat.emissive.set(lampColor);
      const ready = !k.busy && Boolean(best) && k.powered;
      processBtn.setState(t(k.busy ? 'hydro.btn.working' : 'hydro.btn.process'), ready ? BUTTON.on : BUTTON.off);
    });
  },

  /** Bar dispenser: one wrapped bar per finished recipe stacked in the output tray (1 instanced draw call). */
  hydro_bars(g, station, kit) {
    const { t, game, sim } = kit;
    const floorY = -station.y;
    const max = game.data.balance.kitchen.maxBarsShown;
    kit.addBox(g, 0.8, 1.0, 0.4, 0, floorY + 0.5, 0.22, '#5b5f52');
    addStatic(g, [
      pbox(0.6, 0.03, 0.3, 0, floorY + 1.015, 0.22, '#c9d1d9'),
      pbox(0.6, 0.06, 0.015, 0, floorY + 1.045, 0.365, '#9aa7b3'),
    ]);
    const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.03, 0.05), new THREE.MeshLambertMaterial(), max);
    const tmp = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < max; i++) bars.setColorAt(i, color.set('#c0a060'));
    bars.count = 0;
    g.add(bars);
    const panel = new Panel(0.7, 0.36, { pxPerMeter: 560 });
    panel.mesh.position.set(0, 0.36, 0);
    g.add(panel.mesh);
    let lastTotal = -1;
    kit.onRefresh(() => {
      const k = sim().kitchen;
      if (!k) return;
      /** @type {[string, number][]} */
      const counts = Object.entries(k.bars);
      const made = counts.flatMap(([id, n]) => Array(n).fill(id));
      const total = made.length;
      if (total !== lastTotal) {
        lastTotal = total;
        const shown = made.slice(-max);
        shown.forEach((id, i) => {
          const layer = Math.floor(i / 4);
          tmp.position.set(-0.21 + (i % 4) * 0.14, floorY + 1.045 + layer * 0.032, 0.22 + (layer % 2) * 0.02);
          tmp.rotation.y = (layer % 2) * 0.08;
          tmp.updateMatrix();
          bars.setMatrixAt(i, tmp.matrix);
          bars.setColorAt(i, color.set(RECIPE_COLORS[id] ?? '#c0a060'));
        });
        bars.count = shown.length;
        bars.instanceMatrix.needsUpdate = true;
        if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
      }
      const kinds = counts.filter(([, n]) => n > 0);
      panel.renderCustom(counts.map(([, n]) => n).join(','), (ctx, w, h) => {
        icon.frame(ctx, w, h);
        icon.text(ctx, t('hydro.bars.title'), h * 0.1, h * 0.14, { size: h * 0.14, color: COLORS.title, bold: true });
        kinds.forEach(([id, n], i) => {
          const cx = w * 0.16 + i * (w * 0.23);
          icon.foodBar(ctx, cx, h * 0.42, w * 0.17, RECIPE_COLORS[id]);
          icon.text(ctx, `×${n}`, cx, h * 0.64, { size: h * 0.14, bold: true, align: 'center' });
        });
        icon.text(ctx, total ? t('hydro.bars.msg_total', { count: total }) : t('hydro.bars.msg_none'), h * 0.1, h * 0.87,
          { size: h * 0.12, color: total ? COLORS.nominal : COLORS.dim, bold: true, maxWidth: w - h * 0.2 });
      });
    });
  },
};

/** "2026-11-14" → "14/11/2026" */
function formatDay(/** @type {string} */ iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
