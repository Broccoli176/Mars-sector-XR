// OWNER: teammate (Telecom · Control · Energy) — see docs/COLLABORATION.md
// Sala de control: main PC, time lever, bio panel. Placement: src/data/stations/control.json
import { COLORS, BUTTON, statusColor, startButtonState, renderBio } from '../../ui/StationKit.js';
import { formatClock } from '../../utils/strings.js';

const SPEEDS = [0, 1, 2, 4];
const LOG_COLORS = { info: COLORS.text, hint: COLORS.info, comms: COLORS.title, warning: COLORS.warning, critical: COLORS.critical };

/** @type {Record<string, (g: import('three').Group, station: any, kit: import('../../ui/StationKit.js').StationKit) => void>} */
export const builders = {
  main_pc(g, station, kit) {
    const { t, game, sim } = kit;
    kit.addBox(g, 1.6, 0.06, 0.6, 0, -0.62, 0.3, '#5d666f'); // desk
    kit.addBox(g, 1.6, station.y - 0.65, 0.55, 0, -0.65 - (station.y - 0.65) / 2, 0.3, '#4b535b');
    const panel = kit.addPanel(g, 1.4, 0.95, 0, 0.1);
    const start = kit.addButton(g, { width: 0.34, height: 0.1, label: '', onSelect: () => {
      const phase = sim().phase;
      if (phase === 'training') game.intent('game:start');
      else if (phase === 'over' || phase === 'won') game.restart();
    } }, 0, -0.5);
    kit.onRefresh(() => {
      const s = sim();
      start.setState(...startButtonState(s, t));
      if (s.phase === 'over' || s.phase === 'won') {
        const r = s.game.result;
        panel.renderLines(s.phase === 'won' ? t('summary.won') : t('summary.over'), [
          { text: s.phase === 'won' ? '' : t(`summary.cause.${r?.reason}`), color: COLORS.critical, size: 1.2 },
          t('summary.time', { day: r?.day ?? 0, time: formatClock(r?.hour ?? 0, r?.minute ?? 0) }),
          ...summaryLines(s, t),
          { text: t('summary.restart'), color: COLORS.info },
        ], { border: s.phase === 'won' ? COLORS.nominal : COLORS.critical });
        return;
      }
      const c = s.time.clock();
      const battery = s.resources.get('power');
      const p = s.power;
      const speedText = s.phase === 'training'
        ? t('ui.pc.training')
        : s.time.autoPaused ? t('ui.pc.autopaused')
        : s.time.speed === 0 ? t('ui.pc.paused') : t('ui.pc.speed', { speed: `${s.time.speed}×` });
      const relay = p.relayBurned ? 'ui.power.relay_burned' : p.relayTripped ? 'ui.power.relay_tripped' : 'ui.power.relay_ok';
      panel.renderLines(t('ui.pc.title'), [
        { text: `${t('ui.pc.clock', { day: c.day, time: formatClock(c.hour, c.minute) })}   ·   ${speedText}`, size: 1.05 },
        { text: t('ui.power.battery', { value: battery.value.toFixed(1), pct: Math.round((battery.value / battery.max) * 100) }), color: statusColor(battery.status) },
        t('ui.power.net', { value: battery.ratePerHour.toFixed(2) }) + '   ' + t('ui.power.generation', { value: p.generationKw.toFixed(1) }),
        { text: t('ui.power.demand', { value: p.totalDemandKw.toFixed(1), limit: p.cfg.busLimitKw.toFixed(1) }), color: p.totalDemandKw > p.cfg.busLimitKw ? COLORS.warning : COLORS.text },
        { text: t(relay), color: p.relayClosed ? COLORS.nominal : COLORS.critical },
        ...(p.stormActive ? [{ text: t('ui.power.storm'), color: COLORS.warning }] : []),
        { text: `— ${t('ui.pc.log')} —`, color: COLORS.dim, size: 0.8 },
        ...game.log.slice(0, 4).map((e) => ({ text: e.text, color: LOG_COLORS[/** @type {keyof typeof LOG_COLORS} */ (e.kind)] ?? COLORS.text, size: 0.8 })),
      ], { border: p.relayClosed ? COLORS.border : COLORS.critical });
    });
  },

  time_lever(g, _station, kit) {
    const { t, game, sim } = kit;
    const panel = kit.addPanel(g, 0.56, 0.14, 0, 0.1);
    panel.renderLines('', [{ text: t('ui.time.title'), color: COLORS.title, size: 1.6 }]);
    const btns = SPEEDS.map((speed, i) =>
      kit.addButton(g, { width: 0.11, height: 0.08, label: '', onSelect: () => game.intent('time:setSpeed', { speed }) }, -0.195 + i * 0.13, -0.03));
    kit.onRefresh(() => {
      const s = sim();
      btns.forEach((b, i) => {
        const speed = SPEEDS[i];
        const active = s.time.speed === speed;
        const blink = s.time.autoPaused && speed !== 0 && Math.floor(performance.now() / 500) % 2 === 0;
        b.setState(speed === 0 ? 'II' : `${speed}×`, active ? BUTTON.on : blink ? BUTTON.warn : BUTTON.off);
      });
    });
  },

  bio_panel(g, _station, kit) {
    const panel = kit.addPanel(g, 0.7, 0.42);
    kit.onRefresh(() => renderBio(panel, kit.sim(), kit.t));
  },
};

/** Post-run summary lines on the main PC. @param {any} s @param {Function} t */
function summaryLines(s, t) {
  const used = s.balance.inventory.filters - s.inventory.filters;
  const lines = ['oxygen', 'temperature', 'water', 'food'].map((id) => {
    const r = s.resources.get(id);
    return { text: `${t(`ui.resource.${id}`)}: ${r.value.toFixed(id === 'temperature' ? 1 : 0)} ${r.unit}`, color: statusColor(r.status), size: 0.85 };
  });
  lines.push({ text: t('summary.filters_used', { used, left: s.inventory.filters }), color: COLORS.dim, size: 0.85 });
  return lines;
}
