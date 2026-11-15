// SHARED (see docs/COLLABORATION.md): a repairable part in a room (presentation only).
// It shows whether the part works, which tool fixes it and the repair progress, and exposes an invisible
// aim volume that the hand tools raycast against (src/rooms/hub/tools.js → `repair:work` intents).
// It never changes the simulation: it reads `sim().repairs` and listens to `repair:rejected` for feedback.
import { Mesh, BoxGeometry, SphereGeometry, MeshBasicMaterial } from 'three';
import { Panel } from './Panel.js';
import { COLORS } from './theme.js';
import * as icon from './pictograms.js';

const AIM_MATERIAL = new MeshBasicMaterial({ visible: false });
/** Seconds a rejection message stays on the label. */
const REJECT_SECONDS = 2.5;

/**
 * @param {import('three').Object3D} g station group
 * @param {import('./StationKit.js').StationKit} kit
 * @param {{ targetId: string, x: number, y: number, z: number, size?: number, labelY?: number }} o
 *   targetId: component id (e.g. `scrubber_fan`) or leak id (`hull_seal_*`); position in station-local metres;
 *   labelY: label height relative to the point (default just above it)
 */
export function addRepairPoint(g, kit, { targetId, x, y, z, size = 0.32, labelY = size / 2 + 0.12 }) {
  const { t, sim } = kit;

  // Aim volume (invisible): the tool's ray must hit it.
  const aim = new Mesh(new BoxGeometry(size, size, size * 0.8), AIM_MATERIAL);
  aim.position.set(x, y, z);
  aim.userData.repairTarget = targetId;
  g.add(aim);
  kit.repairTargets.push(aim);

  // Status lamp: red blinking while broken, green when it works.
  const lampMat = new MeshBasicMaterial({ color: COLORS.nominal, toneMapped: false });
  const lamp = new Mesh(new SphereGeometry(0.025, 12, 8), lampMat);
  lamp.position.set(x + size / 2 - 0.03, y + size / 2 - 0.03, z + size * 0.4 + 0.01);
  g.add(lamp);

  // Label: part name, state, tool to use and a progress bar. Hidden while the part works.
  const label = new Panel(0.46, 0.15);
  label.mesh.position.set(x, y + labelY, z + size * 0.4 + 0.02);
  label.mesh.visible = false;
  g.add(label.mesh);

  /** @type {{ reason: string, until: number } | null} */
  let rejected = null;
  let clock = 0;
  /** @type {any} */
  let wiredBus = null;
  const onRejected = (/** @type {any} */ e) => {
    if (e?.componentId === targetId) rejected = { reason: e.reason, until: clock + REJECT_SECONDS };
  };

  kit.onFrame((dt) => {
    clock += dt;
    const broken = sim().repairs?.isBroken(targetId) ?? false;
    lampMat.color.set(broken ? (Math.sin(clock * 8) > 0 ? COLORS.critical : '#40100c') : COLORS.nominal);
  });

  kit.onRefresh(() => {
    const s = sim();
    if (s.bus !== wiredBus) {
      wiredBus?.off('repair:rejected', onRejected);
      wiredBus = s.bus;
      wiredBus.on('repair:rejected', onRejected);
      rejected = null;
    }
    const repairs = s.repairs;
    const broken = repairs?.isBroken(targetId) ?? false;
    label.mesh.visible = broken;
    if (!broken || !repairs) return;
    const comp = repairs.componentOf(targetId);
    const progress = repairs.progress(targetId);
    const reason = rejected && rejected.until > clock ? rejected.reason : null;
    const tool = t(`hub.tool.${comp.toolId}`);
    const line = reason ? t(`repair.reject.${reason}`, { tool }) : progress > 0 ? t('repair.label.progress', { pct: Math.round(progress * 100) }) : t('repair.label.use', { tool });
    label.renderCustom(`${line}|${Math.round(progress * 40)}`, (ctx, w, h) => {
      icon.frame(ctx, w, h, COLORS.critical);
      icon.text(ctx, t('repair.label.broken', { name: t(comp.nameKey) }), w * 0.05, h * 0.25, { size: h * 0.2, color: COLORS.critical, bold: true, maxWidth: w * 0.9 });
      icon.text(ctx, line, w * 0.05, h * 0.53, { size: h * 0.18, color: reason ? COLORS.warning : COLORS.text, maxWidth: w * 0.9 });
      icon.bar(ctx, w * 0.05, h * 0.72, w * 0.9, h * 0.14, progress, COLORS.nominal);
    });
  });

  return aim;
}
