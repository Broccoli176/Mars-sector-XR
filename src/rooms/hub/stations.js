// OWNER: user (Personal · Hydro · Hub) — see docs/COLLABORATION.md
// Sala central · Herramientas (hub): training bench + mission board. Placement: src/data/stations/hub.json
import { COLORS, startButtonState } from '../../ui/StationKit.js';

/** @type {Record<string, (g: import('three').Group, station: any, kit: import('../../ui/StationKit.js').StationKit) => void>} */
export const builders = {
  training_board(g, _station, kit) {
    const { t, game, sim } = kit;
    kit.addBox(g, 1.6, 0.06, 0.6, 0, -0.62, 0.3, '#5a4a38'); // bench
    const panel = kit.addPanel(g, 1.0, 0.55, 0, 0.12);
    panel.renderLines(t('ui.training.title'), [
      { text: t('ui.training.pending'), color: COLORS.dim },
      t('ui.training.start_here'),
    ]);
    const start = kit.addButton(g, { width: 0.34, height: 0.1, label: '', onSelect: () => {
      const phase = sim().phase;
      if (phase === 'training') game.intent('game:start');
      else if (phase === 'over' || phase === 'won') game.restart();
    } }, 0, -0.3);
    kit.onRefresh(() => start.setState(...startButtonState(sim(), t)));
  },
};
