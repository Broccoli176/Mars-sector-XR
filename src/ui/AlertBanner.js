// SHARED (see docs/COLLABORATION.md): alert banner fixed in the view (child of the user camera).
// Team decision 2026-11-15: an exception to the «no head-locked HUD» rule, kept small, high and translucent so it
// never covers the centre of the view. It lists active faults (red) and pending jobs (amber) with their room.
// Presentation only: it reads `activeAlerts(sim)` and never changes the simulation.
import { Panel } from './Panel.js';
import { COLORS } from './theme.js';
import { activeAlerts } from './alertRules.js';

const WIDTH = 0.74; // m (wide and short: one line per alert)
const LINE_H = 0.036; // m per alert row
const MAX_ROWS = 3;
/** Real seconds the border blinks after a new alert appears. */
const BLINK_SECONDS = 2;

/**
 * @param {import('three').Object3D} camera user camera (child of the rig, see AGENTS.md §8)
 * @param {Function} t translator
 * @param {{ onNewFault?: () => void }} [opts] e.g. a haptic pulse in XR
 */
export function createAlertBanner(camera, t, { onNewFault } = {}) {
  /** One canvas sized for the maximum: title + MAX_ROWS rows + «more». */
  const height = LINE_H * (MAX_ROWS + 1.6) + 0.012;
  const panel = new Panel(WIDTH, height, { pxPerMeter: 1400, minEm: 0.021 });
  const mat = /** @type {import('three').MeshBasicMaterial} */ (panel.mesh.material);
  mat.transparent = true;
  mat.opacity = 0.82;
  mat.depthTest = false; // never hidden behind walls or panels
  panel.mesh.renderOrder = 999;
  // 1.2 m ahead, high in the view (≈ 17° up): readable without covering what you look at.
  panel.mesh.position.set(0, 0.36, -1.2);
  panel.mesh.visible = false;
  camera.add(panel.mesh);

  /** @type {Set<string>} */
  let shownIds = new Set();
  let blink = 0;
  let clock = 0;
  let enabled = true;

  return {
    mesh: panel.mesh,
    /** Hidden while the start menu is open. @param {boolean} on */
    setEnabled(on) {
      enabled = on;
      if (!on) panel.mesh.visible = false;
    },
    /** @param {number} dt real seconds */
    tick(dt) {
      clock += dt;
      if (blink > 0) blink = Math.max(0, blink - dt);
    },
    /** Redraw from the simulation (4 Hz). @param {any} sim */
    refresh(sim) {
      const alerts = enabled ? activeAlerts(sim, sim.balance.alerts ?? { filterLowHours: 6 }) : [];
      const ids = new Set(alerts.map((a) => a.id));
      const newFault = alerts.some((a) => a.level === 'critical' && !shownIds.has(a.id));
      if (alerts.some((a) => !shownIds.has(a.id))) blink = BLINK_SECONDS;
      if (newFault) onNewFault?.();
      shownIds = ids;
      panel.mesh.visible = enabled && alerts.length > 0;
      if (!panel.mesh.visible) return;

      const critical = alerts.some((a) => a.level === 'critical');
      const flash = blink > 0 && Math.sin(clock * 12) > 0;
      const border = critical ? (flash ? '#ffffff' : COLORS.critical) : flash ? '#ffffff' : COLORS.warning;
      /** @type {{ text: string, color: string, size: number }[]} */
      const lines = alerts.slice(0, MAX_ROWS).map((a) => ({
        text: `${a.level === 'critical' ? '⚠' : '•'} ${t('alert.line', { room: t(`alert.room.${a.roomId}`), text: t(a.key, a.params) })}`,
        color: a.level === 'critical' ? COLORS.critical : COLORS.warning,
        size: 1,
      }));
      if (alerts.length > MAX_ROWS) lines.push({ text: t('alert.more', { n: alerts.length - MAX_ROWS }), color: COLORS.dim, size: 0.8 });
      panel.renderLines(t('alert.title'), lines, { border });
    },
  };
}
