// OWNER: teammate (Telecom · Control · Energy) — see docs/COLLABORATION.md
// Sala de control: rover console (./rover.js) and disconnected vitals panel.
import { COLORS } from '../../ui/StationKit.js';
import { buildRoverConsole } from './rover.js';

/** @type {Record<string, (g: import('three').Group, station: any, kit: import('../../ui/StationKit.js').StationKit) => void>} */
export const builders = {
  /** Perseverance-class rover teleoperation console (map, NavCam, status, 6 desk buttons). */
  rover_console(g, station, kit) {
    buildRoverConsole(g, station, kit);
  },

  rover_vitals(g, _station, kit) {
    const { t } = kit;
    const panel = kit.addPanel(g, 1.3, 0.95);
    panel.renderLines(t('rover.vitals.title'), [
      { text: t('rover.vitals.connection'), color: COLORS.warning, size: 0.8 },
      { text: t('rover.vitals.battery'), size: 0.85 },
      { text: t('rover.vitals.generator'), size: 0.85 },
      { text: t('rover.vitals.signal'), size: 0.85 },
      { text: t('rover.vitals.integrity'), size: 0.85 },
      { text: t('rover.vitals.note'), color: COLORS.dim, size: 0.72 },
    ], { border: COLORS.warning });
  },
};
