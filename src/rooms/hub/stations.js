// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Sala central · Herramientas (hub): training bench + mission board, and the "Fuentes científicas"
// board listing every real dataset used in the game. Placement: src/data/stations/hub.json
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

  /**
   * In-world attribution of real data. Lists every src/data/real/*.json that declares a `source`
   * (institution, product, retrievedAt), so new datasets appear here automatically.
   */
  hub_sources(g, _station, kit) {
    const { t } = kit;
    const panel = kit.addPanel(g, 1.15, 0.78);
    const datasets = Object.entries(kit.game.data.real ?? {}).filter(([, d]) => d?.source?.institution);
    /** @type {{ text: string, color?: string, size?: number }[]} */
    const lines = [];
    for (const [id, d] of datasets) {
      lines.push({ text: `${d.source.institution} — ${d.source.product}`, color: COLORS.info, size: 0.85 });
      lines.push({ text: t(`hub.sources.use.${id}`), size: 0.75 });
      lines.push({ text: t('hub.sources.meta', { date: formatDay(d.source.retrievedAt), url: shortUrl(d.source.url) }), color: COLORS.dim, size: 0.7 });
    }
    if (datasets.length === 0) lines.push({ text: t('hub.sources.none'), color: COLORS.warning });
    lines.push({ text: t('hub.sources.disclaimer'), color: COLORS.title, size: 0.75 });
    panel.renderLines(t('hub.sources.title'), lines);
  },
};

/** "2026-11-14" → "14/11/2026" */
function formatDay(/** @type {string} */ iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** "https://www.asc-csa.gc.ca/eng/..." → "asc-csa.gc.ca" */
function shortUrl(/** @type {string} */ url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
