// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Sala central · Herramientas (hub): training bench (+ mission T1), tool wall, spares locker,
// component status board and the "Fuentes científicas" board. Placement: src/data/stations/hub.json
import { COLORS, statusColor, startButtonState } from '../../ui/StationKit.js';
import { buildToolWall } from './tools.js';
import { createT1, isT1Done } from './toolRules.js';

// Shared between the tool wall (events) and the training board (checklist). Presentation-only state.
const hubState = { t1: createT1() };

/** @type {Record<string, (g: import('three').Group, station: any, kit: import('../../ui/StationKit.js').StationKit) => void>} */
export const builders = {
  training_board(g, _station, kit) {
    const { t, game, sim } = kit;
    kit.addBox(g, 1.6, 0.06, 0.6, 0, -0.62, 0.3, '#5a4a38'); // bench
    const panel = kit.addPanel(g, 1.0, 0.55, 0, 0.12);
    const start = kit.addButton(g, { width: 0.34, height: 0.1, label: '', onSelect: () => {
      const phase = sim().phase;
      if (phase === 'training') game.intent('game:start');
      else if (phase === 'over' || phase === 'won') game.restart();
    } }, 0, -0.3);
    kit.onRefresh(() => {
      start.setState(...startButtonState(sim(), t));
      const s = hubState.t1;
      const check = (/** @type {boolean} */ ok, /** @type {string} */ key) =>
        ({ text: `${ok ? '☑' : '☐'} ${t(key)}`, color: ok ? COLORS.nominal : COLORS.text, size: 0.85 });
      panel.renderLines(t('ui.training.title'), [
        { text: t(isT1Done(s) ? 'hub.t1.done' : 'hub.t1.title'), color: isT1Done(s) ? COLORS.nominal : COLORS.title, size: 0.9 },
        check(s.grabbed, 'hub.t1.grab'),
        check(s.holstered, 'hub.t1.holster'),
        check(s.dropped, 'hub.t1.drop'),
        check(s.recovered, 'hub.t1.recover'),
        { text: t('hub.t1.rest'), color: COLORS.dim, size: 0.75 },
        { text: t('ui.training.start_here'), size: 0.75 },
      ]);
    });
  },

  /** Tool wall with the 4 tools (wrench, screwdriver, soldering iron, sealant gun). */
  hub_toolwall(g, _station, kit) {
    buildToolWall(g, kit, hubState);
  },

  /** Spares locker with live counters (resource `spares` + consumable inventory). */
  hub_spares(g, station, kit) {
    const { t, sim } = kit;
    kit.addBox(g, 0.7, 1.8, 0.45, 0, 0.9 - station.y, 0.225, '#56606b'); // locker
    const panel = kit.addPanel(g, 0.58, 0.42, 0, 0.15);
    panel.mesh.position.z = 0.46; // on the locker door
    kit.onRefresh(() => {
      const s = sim();
      const spares = s.resources.get('spares');
      panel.renderLines(t('hub.spares.title'), [
        { text: t('hub.spares.spares', { n: Math.round(spares.value) }), color: statusColor(spares.status), size: 1.1 },
        t('hub.spares.filters', { n: s.inventory.filters }),
        t('hub.spares.sealant', { n: s.inventory.sealantCharges }),
        t('hub.spares.o2', { n: s.inventory.o2Tanks }),
      ]);
    });
  },

  /** Component status board: state of each repairable component and the tool it needs (spec §6.1). */
  hub_status(g, _station, kit) {
    const { t, sim, game } = kit;
    const panel = kit.addPanel(g, 0.95, 0.72);
    const tools = Object.fromEntries(game.data.balance.tools.map((/** @type {any} */ x) => [x.id, x]));
    kit.onRefresh(() => {
      const s = sim();
      const broken = brokenComponents(s);
      panel.renderLines(t('hub.status.title'), [
        ...game.data.balance.components.map((/** @type {any} */ c) => {
          const isBroken = broken.has(c.id);
          return {
            text: `${isBroken ? '■' : '●'} ${t(c.nameKey)} · ${t(isBroken ? 'hub.status.broken' : 'hub.status.ok')} · ${t(tools[c.toolId].nameKey)}`,
            color: isBroken ? COLORS.critical : COLORS.text,
            size: 0.8,
          };
        }),
        { text: t('hub.status.phase2'), color: COLORS.dim, size: 0.7 },
      ], { border: broken.size ? COLORS.critical : COLORS.border });
    });
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

/**
 * Reads the component flags that already exist in the simulation (read-only).
 * @param {any} s Simulation @returns {Set<string>}
 */
export function brokenComponents(s) {
  const out = new Set();
  if (s.lifeSupport.pumpThermalBroken) out.add('pump_thermal');
  if (s.lifeSupport.scrubberFanBroken) out.add('scrubber_fan');
  if (s.lifeSupport.electrolyzerBroken) out.add('electrolyzer_cell');
  if (s.telecom?.motorBroken) out.add('antenna_motor');
  if (s.power.relayBurned) out.add('relay_main');
  if (s.lifeSupport.recyclerStuck) out.add('valve_recycler');
  if (s.lifeSupport.leaks.length > 0) out.add('hull_seal');
  return out;
}

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
