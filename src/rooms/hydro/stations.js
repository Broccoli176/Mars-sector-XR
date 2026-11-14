// OWNER: user (Personal · Hydro · Hub) — see docs/COLLABORATION.md
// Hidroponía · Agricultura: grow racks + plants + harvest, water tank, rations.
// Placement: src/data/stations/hydro.json
import * as THREE from 'three';
import { COLORS, BUTTON, statusColor } from '../../ui/StationKit.js';

const KCAL_PER_DAY = 2500;

/** @type {Record<string, (g: THREE.Group, station: any, kit: import('../../ui/StationKit.js').StationKit) => void>} */
export const builders = {
  hydro_racks(g, station, kit) {
    const { t, game, sim } = kit;
    kit.addBox(g, 3.2, 0.9, 0.55, 0, 0.45 - station.y, 0.32, '#5b5f52');
    // Plants: instanced low-poly foliage + pots (2 draw calls for the whole rack).
    // Own material (not cached) because its colour animates with the crop state.
    const plantMaterial = new THREE.MeshLambertMaterial({ color: '#3f8f3f' });
    const PLANTS = 8;
    const rackTop = 0.9 - station.y;
    const foliage = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.15, 0), plantMaterial, PLANTS);
    const pots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.08, 0.14, 10), kit.lambert('#7a6a58'), PLANTS);
    const tmp = new THREE.Object3D();
    for (let i = 0; i < PLANTS; i++) {
      tmp.position.set(-1.4 + i * 0.4, rackTop + 0.07, 0.32);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      pots.setMatrixAt(i, tmp.matrix);
    }
    g.add(foliage, pots);
    /** @param {number} scale */
    const setPlantScale = (scale) => {
      for (let i = 0; i < PLANTS; i++) {
        tmp.position.set(-1.4 + i * 0.4, rackTop + 0.14 + 0.13 * scale, 0.32);
        tmp.rotation.set(0.3 * i, 0.7 * i, 0);
        tmp.scale.set(scale, scale * 1.15, scale);
        tmp.updateMatrix();
        foliage.setMatrixAt(i, tmp.matrix);
      }
      foliage.instanceMatrix.needsUpdate = true;
    };
    let lastScale = -1;
    const panel = kit.addPanel(g, 0.8, 0.3, 0, 0.12);
    const harvest = kit.addButton(g, { width: 0.3, height: 0.09, label: t('ui.hydro.harvest'),
      onSelect: () => game.intent('food:harvest') }, 0, -0.12);
    kit.onRefresh(() => {
      const s = sim();
      const f = s.food;
      const cfg = s.balance.food;
      const lines = f.ready
        ? [{ text: t('ui.hydro.ready', { hours: (cfg.spoilAfterReadyHours - f.readyHours).toFixed(1) }), color: COLORS.warning }]
        : [t('ui.hydro.growth', { value: f.growthHours.toFixed(1), total: cfg.growthHoursToReady })];
      if (f.neglectHours > 0) lines.push({ text: t('ui.hydro.neglect', { hours: f.neglectHours.toFixed(1), limit: cfg.spoilWithoutCareHours }), color: COLORS.critical });
      lines.push(t('ui.hydro.lights', { state: t(f.lightsOn ? 'ui.state.running' : s.power.served.hydro ? 'ui.state.idle' : 'ui.state.unpowered') }));
      panel.renderLines(t('ui.hydro.title'), lines);
      harvest.setState(t('ui.hydro.harvest'), f.ready ? BUTTON.warn : BUTTON.off);
      const scale = 0.4 + 0.6 * Math.min(1, f.growthHours / cfg.growthHoursToReady);
      const target = f.ready ? 1.1 : scale;
      if (Math.abs(target - lastScale) > 0.01) {
        lastScale = target;
        setPlantScale(target);
      }
      plantMaterial.color.set(f.neglectHours > 0 ? '#8a7a3a' : f.ready ? '#7fcf3f' : '#3f8f3f');
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
