// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Hidroponía · Agricultura: 4 sowable trays (+ watering hose minigame), spirulina bioreactor, water tank,
// rations and the crop guide. Real facts: src/data/real/csa_food.json (CSA) + bioregen_crops.json (NASA NTRS).
// The simulation (src/systems/Food.js) owns trays/moisture; this file only reads it and emits intents:
// hydro:sow, hydro:water, food:harvest. Placement: src/data/stations/hydro.json
import * as THREE from 'three';
import { COLORS, BUTTON, statusColor } from '../../ui/StationKit.js';
import { Panel } from '../../ui/Panel.js';
import { moistureState, nextSeed, soilColor, moistureBar, createWaterBatcher } from './hydroRules.js';
import { cropGeometry } from './plants.js';

const KCAL_PER_DAY = 2500;
const TRAY_XS = [-1.2, -0.4, 0.4, 1.2];
const TRAY_W = 0.7;
const TRAY_D = 0.42;
const TRAY_Z = 0.32;

/** Shared between the trays (hose targets) and the hose station. Presentation-only. */
const hydroState = {
  /** @type {THREE.Mesh[]} invisible aim volumes, userData.trayId */
  targets: [],
  /** @type {string | null} tray currently under the spray */
  watering: null,
};

/** @type {Record<string, (g: THREE.Group, station: any, kit: import('../../ui/StationKit.js').StationKit) => void>} */
export const builders = {
  /** Bench with 4 trays: soil (moisture colour), crop plant, panel, seed + sow/harvest buttons. */
  hydro_racks(g, station, kit) {
    const { t, game, sim } = kit;
    const cfg = game.data.balance.food;
    const cropIds = cfg.crops.map((/** @type {any} */ c) => c.id);
    const benchTop = 0.9 - station.y;
    kit.addBox(g, 3.2, 0.9, 0.55, 0, 0.45 - station.y, TRAY_Z, '#5b5f52');

    // Soil of the 4 trays: one instanced mesh, colour per instance (1 draw call).
    const soil = new THREE.InstancedMesh(new THREE.BoxGeometry(TRAY_W - 0.06, 0.05, TRAY_D - 0.04), new THREE.MeshLambertMaterial(), 4);
    const rims = new THREE.InstancedMesh(new THREE.BoxGeometry(TRAY_W, 0.07, TRAY_D), kit.lambert('#c9d1d9'), 4);
    const tmp = new THREE.Object3D();
    const color = new THREE.Color();
    TRAY_XS.forEach((x, i) => {
      tmp.position.set(x, benchTop + 0.035, TRAY_Z);
      tmp.updateMatrix();
      rims.setMatrixAt(i, tmp.matrix);
      tmp.position.y = benchTop + 0.05;
      tmp.updateMatrix();
      soil.setMatrixAt(i, tmp.matrix);
      soil.setColorAt(i, color.setRGB(0.4, 0.3, 0.2));
    });
    g.add(rims, soil);

    const trays = TRAY_XS.map((x, i) => {
      const trayId = cfg.trays[i].id;
      const material = new THREE.MeshLambertMaterial({ vertexColors: true });
      const plant = new THREE.Mesh(cropGeometry('lettuce'), material);
      plant.position.set(x, benchTop + 0.075, TRAY_Z);
      plant.visible = false;
      g.add(plant);
      // Invisible aim volume for the hose (soil + plant), never in the ray-interactive list.
      const target = new THREE.Mesh(new THREE.BoxGeometry(TRAY_W, 0.5, TRAY_D), new THREE.MeshBasicMaterial());
      target.position.set(x, benchTop + 0.25, TRAY_Z);
      target.visible = false;
      target.userData.trayId = trayId;
      g.add(target);
      hydroState.targets.push(target);

      const panel = new Panel(0.74, 0.34, { pxPerMeter: 640 });
      panel.mesh.position.set(x, 0.42, 0.01);
      g.add(panel.mesh);

      const view = { trayId, seed: cropIds[0], plant, material, panel, lastCrop: '', lastScale: -1 };
      const seedBtn = kit.addButton(g, { width: 0.32, height: 0.08, label: '', onSelect: () => {
        const tray = sim().food.tray(trayId);
        if (tray && !tray.cropId) view.seed = nextSeed(cropIds, view.seed);
      } }, x - 0.17, benchTop - 0.1);
      const actionBtn = kit.addButton(g, { width: 0.3, height: 0.08, label: '', onSelect: () => {
        const tray = sim().food.tray(trayId);
        if (!tray) return;
        if (!tray.cropId) game.intent('hydro:sow', { trayId, cropId: view.seed });
        else if (tray.ready) game.intent('food:harvest', { trayId });
      } }, x + 0.17, benchTop - 0.1);
      // Buttons on the front lip of the bench.
      for (const b of [seedBtn, actionBtn]) b.mesh.parent?.position.setZ(TRAY_Z + 0.29);
      return { ...view, seedBtn, actionBtn, index: i };
    });

    kit.onRefresh(() => {
      const f = sim().food;
      const crops = f.crops;
      trays.forEach((v) => {
        const tray = f.tray(v.trayId);
        if (!tray) return;
        const state = moistureState(tray.moisture, cfg);
        const [r, gg, b] = soilColor(tray.moisture, cfg);
        soil.setColorAt(v.index, color.setRGB(r, gg, b));

        const title = t('hydro.tray.title', { n: v.index + 1 });
        /** @type {{ text: string, color?: string, size?: number }[]} */
        const lines = [];
        if (!tray.cropId) {
          const seed = crops[v.seed];
          lines.push({ text: t('hydro.tray.empty'), color: COLORS.dim, size: 0.85 });
          lines.push({ text: t('hydro.tray.seed', { name: t(`real.crop.${seed.id}`), hours: seed.growthHours, kcal: seed.kcal }), color: COLORS.info, size: 0.85 });
          v.seedBtn.setState(t('hydro.btn.seed'), BUTTON.info);
          v.actionBtn.setState(t('hydro.btn.sow'), BUTTON.on);
        } else {
          const crop = crops[tray.cropId];
          const name = t(`real.crop.${crop.id}`);
          if (tray.ready) {
            lines.push({ text: t('hydro.tray.ready', { name, hours: (cfg.spoilAfterReadyHours - tray.readyHours).toFixed(1) }), color: COLORS.warning, size: 0.9 });
          } else {
            lines.push({ text: t('hydro.tray.growing', { name, pct: Math.floor((100 * tray.growthHours) / crop.growthHours) }), size: 0.9 });
          }
          lines.push({
            text: t('hydro.tray.moisture', { bar: moistureBar(tray.moisture), pct: Math.round(tray.moisture * 100) }),
            color: state === 'ok' ? COLORS.nominal : state === 'dry' ? COLORS.warning : COLORS.info,
            size: 0.85,
          });
          const problem = !sim().power.served.hydro ? 'hydro.tray.dark' : state === 'dry' ? 'hydro.tray.dry' : state === 'flooded' ? 'hydro.tray.flooded' : null;
          if (problem && !tray.ready) {
            const left = Math.max(0, cfg.spoilWithoutCareHours - tray.neglectHours).toFixed(1);
            lines.push({ text: t(problem, { hours: left }), color: COLORS.critical, size: 0.8 });
          }
          v.seedBtn.setState(t('hydro.btn.seed_locked'), BUTTON.off);
          v.actionBtn.setState(t('hydro.btn.harvest'), tray.ready ? BUTTON.warn : BUTTON.off);
        }
        if (hydroState.watering === v.trayId) lines.push({ text: t('hydro.tray.watering'), color: COLORS.info, size: 0.8 });
        v.panel.renderLines(title, lines, { border: tray.ready ? COLORS.warning : tray.cropId && state !== 'ok' ? COLORS.critical : COLORS.border });

        // Plant: crop shape, size by growth, yellowish and drooping when neglected.
        v.plant.visible = Boolean(tray.cropId);
        if (tray.cropId && tray.cropId !== v.lastCrop) v.plant.geometry = cropGeometry(tray.cropId);
        v.lastCrop = tray.cropId ?? '';
        if (tray.cropId) {
          const growth = Math.min(1, tray.growthHours / crops[tray.cropId].growthHours);
          const scale = tray.ready ? 1.05 : 0.25 + 0.75 * growth;
          if (Math.abs(scale - v.lastScale) > 0.005) {
            v.lastScale = scale;
            v.plant.scale.set(scale, scale, scale);
          }
          v.material.color.set(tray.neglectHours > 0 ? '#d8c27a' : '#ffffff');
          v.plant.rotation.z = tray.neglectHours > 0 && state === 'dry' ? 0.12 : 0;
        }
      });
      if (soil.instanceColor) soil.instanceColor.needsUpdate = true;
    });
  },

  /** Hose reel with a grabbable nozzle: hold the trigger (F on desktop) and aim at a tray to water it. */
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
      { text: t('hydro.hose.hint'), size: 0.8 },
      { text: t('hydro.hose.desktop'), color: COLORS.dim, size: 0.7 },
    ]);

    // Nozzle: grip at the origin, pointing along −z (like the controller and the hub tools).
    const nozzleGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.12, 10).rotateX(Math.PI / 2);
    const nozzle = new THREE.Mesh(nozzleGeo, kit.lambert('#e0b030'));
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.07, 10).rotateX(Math.PI / 2).translate(0, 0, -0.09), kit.lambert('#2f6f8f'));
    nozzle.add(tip);
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
      },
      onRelease: () => {
        held = false;
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
        raycaster.set(tipWorld, dir);
        const hit = raycaster.intersectObjects(hydroState.targets, false)[0];
        target = hit?.object.userData.trayId ?? null;
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
          sprayPos.set([tipWorld.x, tipWorld.y, tipWorld.z], i * 3);
          vel[i].copy(dir).multiplyScalar(2.6).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4));
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

    const panel = kit.addPanel(g, 0.66, 0.46, 0.62, 0.05);
    const harvest = kit.addButton(g, { width: 0.4, height: 0.09, label: t('hydro.btn.bio_harvest'),
      onSelect: () => game.intent('food:harvest', { trayId: 'bioreactor' }) }, 0.62, -0.28);
    kit.onRefresh(() => {
      const f = sim().food;
      const bio = f.bioreactor;
      /** @type {{ text: string, color?: string, size?: number }[]} */
      const lines = [];
      if (bio.ready) lines.push({ text: t('hydro.bio.ready', { kcal: bioCfg.kcal }), color: COLORS.warning, size: 0.9 });
      else lines.push({ text: t('hydro.bio.growing', { pct: Math.floor((100 * bio.growthHours) / bioCfg.growthHours) }), size: 0.9 });
      if (!f.lightsOn) lines.push({ text: t('hydro.bio.dark'), color: COLORS.dim, size: 0.8 });
      lines.push({ text: t('hydro.bio.o2', { o2: bio.o2Total.toFixed(1) }), color: COLORS.info, size: 0.8 });
      lines.push({ text: t('hydro.bio.fact'), size: 0.72 });
      lines.push({ text: t('hydro.bio.source'), color: COLORS.dim, size: 0.65 });
      panel.renderLines(t('hydro.bio.title'), lines, { border: bio.ready ? COLORS.warning : COLORS.border });
      harvest.setState(t('hydro.btn.bio_harvest'), bio.ready ? BUTTON.warn : BUTTON.off);
    });
  },

  hydro_water(g, station, kit) {
    const { t, sim } = kit;
    kit.addCylinder(g, 0.4, 1.8, 0.9, 0.9 - station.y, 0.45, '#4f7f8f');
    const panel = kit.addPanel(g, 0.6, 0.32);
    kit.onRefresh(() => {
      const s = sim();
      const w = s.resources.get('water');
      const recycler = s.lifeSupport.recyclerStuck ? 'ui.state.unpowered' : s.power.served.lifeSupport ? 'ui.state.ok' : 'ui.state.unpowered';
      panel.renderLines(t('ui.water.title'), [
        { text: `${w.value.toFixed(1)} L   ${t(`ui.status.${w.status}`)}`, color: statusColor(w.status), size: 1.2 },
        t('ui.water.recycler', { state: t(recycler) }),
      ]);
    });
  },

  /** Real crop cycles (CSA) vs compressed game time, plus quinoa and spirulina (NASA NTRS). */
  hydro_cropguide(g, _station, kit) {
    const { t, sim } = kit;
    const csa = kit.game.data.real?.csa_food;
    const nasa = kit.game.data.real?.bioregen_crops;
    const panel = kit.addPanel(g, 1.05, 0.8);
    if (!csa) {
      panel.renderLines(t('hydro.guide.title'), [{ text: t('hydro.guide.no_data'), color: COLORS.warning }]);
      return;
    }
    kit.onRefresh(() => {
      const s = sim();
      const kcalPerDay = Math.round((s.balance.food.consumptionPerHour * 24) / 100) * 100;
      const game = s.food.crops;
      panel.renderLines(t('hydro.guide.title'), [
        ...csa.crops.items.map((/** @type {any} */ c) => ({
          text: game[c.id]
            ? t('hydro.guide.crop_game', { name: t(c.nameKey), min: c.daysMin, max: c.daysMax, hours: game[c.id].growthHours })
            : t('hydro.guide.crop', { name: t(c.nameKey), min: c.daysMin, max: c.daysMax }),
          color: game[c.id] ? COLORS.nominal : COLORS.dim,
          size: 0.78,
        })),
        ...(nasa
          ? [
              { text: t('hydro.guide.quinoa', { min: nasa.quinoa.proteinPctMin, max: nasa.quinoa.proteinPctMax, hours: game.quinoa?.growthHours ?? '—' }), color: COLORS.nominal, size: 0.78 },
              { text: t('hydro.guide.spirulina', { pct: nasa.spirulina.proteinPctUpTo }), color: COLORS.nominal, size: 0.78 },
            ]
          : []),
        { text: t('hydro.guide.compressed'), color: COLORS.dim, size: 0.7 },
        { text: t('hydro.guide.diet', { min: csa.crewDiet.kcalPerDayMin, max: csa.crewDiet.kcalPerDayMax, game: kcalPerDay }), size: 0.75 },
        { text: t('hydro.guide.source', { date: formatDay(csa.source.retrievedAt) }), color: COLORS.dim, size: 0.65 },
      ]);
    });
  },

  hydro_food(g, _station, kit) {
    const { t, sim } = kit;
    const panel = kit.addPanel(g, 0.6, 0.32);
    kit.onRefresh(() => {
      const f = sim().resources.get('food');
      panel.renderLines(t('ui.food.title'), [
        { text: `${Math.round(f.value)} kcal   ${t(`ui.status.${f.status}`)}`, color: statusColor(f.status), size: 1.2 },
        t('ui.food.days', { days: (f.value / KCAL_PER_DAY).toFixed(1) }),
      ]);
    });
  },
};

/** "2026-11-14" → "14/11/2026" */
function formatDay(/** @type {string} */ iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
