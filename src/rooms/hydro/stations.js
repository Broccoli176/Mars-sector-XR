// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Hidroponía · Agricultura: 4 sowable trays (+ watering hose minigame), spirulina bioreactor, water tank,
// rations and the crop guide. Real facts: src/data/real/csa_food.json (CSA) + bioregen_crops.json (NASA NTRS).
// South extension (kitchen): pantry of raw harvest, food processor and bar dispenser.
// The simulation (src/systems/Food.js, src/systems/Kitchen.js) owns trays/pantry; this file only reads it and
// emits intents: hydro:sow, hydro:water, food:harvest, kitchen:select, kitchen:process, kitchen:eat.
// Placement: src/data/stations/hydro.json
import * as THREE from 'three';
import { COLORS, BUTTON, statusColor } from '../../ui/StationKit.js';
import { Panel } from '../../ui/Panel.js';
import { moistureState, nextSeed, soilColor, moistureBar, createWaterBatcher } from './hydroRules.js';
import { cropGeometry } from './plants.js';
import { nextRecipe, freshnessLines } from './kitchenRules.js';

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
            lines.push({ text: t('hydro.tray.to_pantry'), color: COLORS.dim, size: 0.75 });
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

  /** Pantry: raw harvest lots as crates on a cabinet (1 instanced draw call), freshness panel, «Comer crudo». */
  hydro_pantry(g, station, kit) {
    const { t, game, sim } = kit;
    const floorY = -station.y;
    const shelf = game.data.balance.kitchen.rawShelfHours;
    kit.addBox(g, 0.9, 1.1, 0.45, 0, floorY + 0.55, 0.26, '#6f7a80');
    const COLS = 5;
    const ROWS = 2;
    const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.1, 0.17), new THREE.MeshLambertMaterial(), COLS * ROWS);
    const tmp = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < COLS * ROWS; i++) crates.setColorAt(i, color.set('#a0a0a0'));
    crates.count = 0;
    g.add(crates);

    const panel = kit.addPanel(g, 0.74, 0.44, 0, 0.42);
    const eat = kit.addButton(g, { width: 0.34, height: 0.08, label: t('hydro.btn.eat_raw'),
      onSelect: () => game.intent('kitchen:eat', {}) }, 0, 0.1);
    kit.onRefresh(() => {
      const k = sim().kitchen;
      if (!k) return;
      // Crates: one per lot (oldest first), colour per crop.
      const n = Math.min(k.pantry.length, COLS * ROWS);
      for (let i = 0; i < n; i++) {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        tmp.position.set(-0.34 + col * 0.17, floorY + 1.15, 0.36 - row * 0.2);
        tmp.updateMatrix();
        crates.setMatrixAt(i, tmp.matrix);
        crates.setColorAt(i, color.set(CROP_COLORS[k.pantry[i].itemId] ?? '#a0a0a0'));
      }
      crates.count = n;
      crates.instanceMatrix.needsUpdate = true;
      if (crates.instanceColor) crates.instanceColor.needsUpdate = true;

      /** @type {{ text: string, color?: string, size?: number }[]} */
      const lines = [];
      if (k.pantry.length === 0) lines.push({ text: t('hydro.pantry.empty'), color: COLORS.dim, size: 0.85 });
      for (const l of freshnessLines(k.pantry, shelf)) {
        lines.push({
          text: t('hydro.pantry.line', { name: t(`real.crop.${l.itemId}`), count: l.count, hours: l.hoursLeft.toFixed(1) }),
          color: l.hoursLeft < 6 ? COLORS.critical : l.hoursLeft < 12 ? COLORS.warning : COLORS.nominal,
          size: 0.82,
        });
      }
      lines.push({ text: t('hydro.pantry.stock', k.stock), color: COLORS.info, size: 0.75 });
      lines.push({ text: t('hydro.pantry.hint'), color: COLORS.dim, size: 0.68 });
      panel.renderLines(t('hydro.pantry.title'), lines);
      eat.setState(t('hydro.btn.eat_raw'), k.pantry.length ? BUTTON.warn : BUTTON.off);
    });
  },

  /** Food processor: pick a recipe, press «Procesar»; runs on the hydro circuit and vibrates while busy. */
  hydro_processor(g, station, kit) {
    const { t, game, sim } = kit;
    const floorY = -station.y;
    const body = kit.addBox(g, 0.9, 1.0, 0.55, 0, floorY + 0.5, 0.3, '#8a8f96');
    const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.08, 0.24, 14), kit.lambert('#c9d1d9'));
    hopper.position.set(-0.18, floorY + 1.12, 0.3);
    const chute = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.16), kit.lambert('#4a525a'));
    chute.position.set(0.2, floorY + 0.55, 0.6);
    const lampMat = new THREE.MeshLambertMaterial({ color: '#333333', emissive: '#000000' });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), lampMat);
    lamp.position.set(0.3, floorY + 1.04, 0.3);
    g.add(hopper, chute, lamp);

    const panel = kit.addPanel(g, 0.86, 0.44, 0, 0.36);
    const recipeIds = () => sim().kitchen?.recipes.map((/** @type {any} */ r) => r.id) ?? [];
    const recipeBtn = kit.addButton(g, { width: 0.3, height: 0.08, label: t('hydro.btn.recipe'), onSelect: () => {
      const k = sim().kitchen;
      if (k && !k.busy) game.intent('kitchen:select', { recipeId: nextRecipe(recipeIds(), k.selected) });
    } }, -0.2, 0.05);
    const processBtn = kit.addButton(g, { width: 0.3, height: 0.08, label: t('hydro.btn.process'),
      onSelect: () => game.intent('kitchen:process', {}) }, 0.2, 0.05);

    const baseY = body.position.y;
    let phase = 0;
    kit.onFrame((dt) => {
      const k = sim().kitchen;
      const running = Boolean(k?.busy && k.powered);
      phase += dt * 40;
      body.position.y = running ? baseY + Math.sin(phase) * 0.003 : baseY;
      hopper.rotation.y = running ? hopper.rotation.y + dt * 3 : hopper.rotation.y;
    });

    kit.onRefresh(() => {
      const k = sim().kitchen;
      if (!k) return;
      const r = k.recipe(k.busy ? k.job.recipeId : k.selected);
      const name = t(`real.recipe.${r.id}`);
      const inputs = Object.entries(r.inputs).map(([kind, n]) => `${n} ${t(`hydro.kind.${kind}`)}`).join(' + ');
      /** @type {{ text: string, color?: string, size?: number }[]} */
      const lines = [{ text: t('hydro.kitchen.recipe', { name }), size: 0.95 }];
      lines.push({ text: t('hydro.kitchen.inputs', { inputs, hours: r.hours, kw: r.drawKw }), color: COLORS.info, size: 0.75 });
      let lampColor = '#000000';
      if (k.busy) {
        lines.push({ text: t('hydro.kitchen.busy', { name, pct: Math.floor((100 * k.job.progressHours) / k.job.hours) }), color: COLORS.warning, size: 0.85 });
        if (!k.powered) lines.push({ text: t('hydro.kitchen.no_power'), color: COLORS.critical, size: 0.8 });
        lampColor = k.powered ? '#c88a10' : '#802010';
      } else {
        const missing = k.missing(r.id);
        if (Object.keys(missing).length) {
          const txt = Object.entries(missing).map(([kind, n]) => `${n} ${t(`hydro.kind.${kind}`)}`).join(' + ');
          lines.push({ text: t('hydro.kitchen.missing', { inputs: txt }), color: COLORS.critical, size: 0.8 });
        } else {
          lines.push({ text: t('hydro.kitchen.yield', { kcal: k.previewKcal(r.id), mult: r.multiplier }), color: COLORS.nominal, size: 0.85 });
          lampColor = '#1f8a3a';
        }
      }
      lines.push({ text: t('hydro.kitchen.hint'), color: COLORS.dim, size: 0.68 });
      panel.renderLines(t('hydro.kitchen.title'), lines, { border: k.busy ? COLORS.warning : COLORS.border });
      lampMat.emissive.set(lampColor);
      recipeBtn.setState(t('hydro.btn.recipe'), k.busy ? BUTTON.off : BUTTON.info);
      const ready = !k.busy && k.canProcess(r.id) && k.powered;
      processBtn.setState(t(k.busy ? 'hydro.btn.processing' : 'hydro.btn.process'), ready ? BUTTON.on : BUTTON.off);
    });
  },

  /** Bar dispenser: one wrapped bar per finished recipe stacked in the output tray (1 instanced draw call). */
  hydro_bars(g, station, kit) {
    const { t, game, sim } = kit;
    const floorY = -station.y;
    const max = game.data.balance.kitchen.maxBarsShown;
    kit.addBox(g, 0.8, 1.0, 0.4, 0, floorY + 0.5, 0.22, '#5b5f52');
    kit.addBox(g, 0.6, 0.03, 0.3, 0, floorY + 1.015, 0.22, '#c9d1d9');
    const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.03, 0.05), new THREE.MeshLambertMaterial(), max);
    const tmp = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < max; i++) bars.setColorAt(i, color.set('#c0a060'));
    bars.count = 0;
    g.add(bars);
    const panel = kit.addPanel(g, 0.7, 0.38, 0, 0.36);
    let lastTotal = -1;
    kit.onRefresh(() => {
      const k = sim().kitchen;
      if (!k) return;
      /** @type {string[]} */
      const made = Object.entries(k.bars).flatMap(([id, n]) => Array(n).fill(id));
      const total = made.length;
      if (total !== lastTotal) {
        lastTotal = total;
        const shown = made.slice(-max);
        shown.forEach((id, i) => {
          const col = i % 4;
          const layer = Math.floor(i / 4);
          tmp.position.set(-0.21 + col * 0.14, floorY + 1.045 + layer * 0.032, 0.22 + (layer % 2) * 0.02);
          tmp.rotation.y = (layer % 2) * 0.08;
          tmp.updateMatrix();
          bars.setMatrixAt(i, tmp.matrix);
          bars.setColorAt(i, color.set(RECIPE_COLORS[id] ?? '#c0a060'));
        });
        bars.count = shown.length;
        bars.instanceMatrix.needsUpdate = true;
        if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
      }
      /** @type {{ text: string, color?: string, size?: number }[]} */
      const lines = [];
      if (!total) lines.push({ text: t('hydro.bars.none'), color: COLORS.dim, size: 0.85 });
      for (const [id, n] of Object.entries(k.bars)) {
        if (n > 0) lines.push({ text: t('hydro.bars.line', { name: t(`real.recipe.${id}`), count: n }), color: RECIPE_COLORS[id], size: 0.85 });
      }
      if (total) lines.push({ text: t('hydro.bars.total', { count: total }), color: COLORS.info, size: 0.75 });
      panel.renderLines(t('hydro.bars.title'), lines);
    });
  },
};

/** Crate colour per raw item in the pantry. */
const CROP_COLORS = /** @type {Record<string, string>} */ ({
  lettuce: '#5fbf4a', tomato: '#d9472b', soybean: '#c9b25a', quinoa: '#d8c89a',
  carrot: '#e8862a', sweet_potato: '#9a4f6a', spirulina: '#2f8f6f',
});

/** Wrapper colour per recipe (bars in the dispenser + panel text). */
const RECIPE_COLORS = /** @type {Record<string, string>} */ ({
  bar_energy: '#e0a030', bar_protein: '#4fa3d8', ration_fresh: '#6fcf5a', bar_single: '#c8b48a',
});

/** "2026-11-14" → "14/11/2026" */
function formatDay(/** @type {string} */ iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
