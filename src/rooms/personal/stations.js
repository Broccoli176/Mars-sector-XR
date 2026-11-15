// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Personal: main PC/time controls, crew quarters, and real-data dosimeter (NASA OSDR RadLab, MSL RAD).
// Placement: src/data/stations/personal.json · Texts: src/data/strings/es/personal.json
//
// To add a station: add an entry to stations/personal.json and a builder with the same id below
// (see src/rooms/hub/stations.js for a small panel + button example).
import { COLORS, BUTTON, statusColor, startButtonState } from '../../ui/StationKit.js';
import { createSpaceWeatherFeed } from './spaceWeatherLive.js';
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

  personal_dosimeter(g, _station, kit) {
    const { t, sim } = kit;
    const radlab = kit.game.data.real?.radlab;
    const panel = kit.addPanel(g, 1.2, 0.8);

    kit.onRefresh(() => {
      const r = sim().radiation;
      if (!r || !radlab) {
        panel.renderLines(t('personal.dosimeter.title'), [{ text: t('personal.dosimeter.no_data'), color: COLORS.warning }]);
        return;
      }
      const c = sim().time.clock();
      const minute = c.hour * 60 + c.minute;
      const key = `${r.rate.toFixed(2)}|${Math.round(r.doseMicroGy)}|${Math.floor(minute / 10)}`;
      panel.renderCustom(key, (ctx, W, H) => drawDosimeter(ctx, W, H, { t, r, radlab, minute }));
    });
  },

  personal_bunk(g, station, kit) {
    const base = -station.y; // station-local floor height
    kit.addBox(g, 2.0, 0.45, 0.9, 0, base + 0.225, 0.45, '#5f646b'); // frame
    kit.addBox(g, 1.9, 0.12, 0.82, 0, base + 0.51, 0.45, '#7d6f8a'); // mattress
    kit.addBox(g, 0.4, 0.1, 0.6, -0.7, base + 0.62, 0.45, '#c9c4bb'); // pillow
  },

  personal_locker(g, station, kit) {
    kit.addBox(g, 0.8, 1.9, 0.5, 0, 0.95 - station.y, 0.25, '#56606b');
  },

  /**
   * "El Sol ahora": NASA DONKI space weather, LIVE when the browser can reach api.nasa.gov,
   * otherwise the embedded snapshot — and the panel always says which one it is.
   */
  personal_spaceweather(g, _station, kit) {
    const { t } = kit;
    const fallback = kit.game.data.real?.donki_recent ?? null;
    const apiKey = import.meta.env?.VITE_NASA_API_KEY || 'DEMO_KEY';
    const feed = createSpaceWeatherFeed({ apiKey, fallback });
    feed.start();
    const panel = kit.addPanel(g, 0.95, 0.72);
    kit.onRefresh(() => {
      const st = feed.state;
      const s = st.summary;
      /** @type {{ text: string, color?: string, size?: number }[]} */
      const lines = [];
      if (st.status === 'live') {
        const time = st.fetchedAt ? `${String(st.fetchedAt.getHours()).padStart(2, '0')}:${String(st.fetchedAt.getMinutes()).padStart(2, '0')}` : '';
        lines.push({ text: t('personal.sun.live', { time }), color: COLORS.nominal, size: 0.9 });
      } else if (st.status === 'snapshot') {
        lines.push({ text: t('personal.sun.snapshot', { date: formatDay(st.retrievedAt ?? '') }), color: COLORS.warning, size: 0.9 });
      } else {
        lines.push({ text: t('personal.sun.unavailable'), color: COLORS.warning });
      }
      if (s) {
        lines.push({ text: t('personal.sun.cme', { n: s.cmeCount }), size: 1.05 });
        if (s.fastestCmeKms) lines.push({ text: t('personal.sun.fastest', { kms: s.fastestCmeKms }) });
        lines.push({ text: t('personal.sun.storms', { n: s.gstCount, sep: s.sepCount }) });
        lines.push({ text: t('personal.sun.explain'), color: COLORS.dim, size: 0.8 });
      }
      lines.push({ text: t('personal.sun.source'), color: COLORS.dim, size: 0.7 });
      panel.renderLines(t('personal.sun.title'), lines, { border: st.status === 'live' ? COLORS.nominal : COLORS.border });
    });
  },

  /** "Salud del astronauta": real NASA OSDR studies with kid-friendly summaries (static, dated). */
  personal_health(g, _station, kit) {
    const { t } = kit;
    const osdr = kit.game.data.real?.osdr_health;
    const panel = kit.addPanel(g, 1.05, 0.8);
    if (!osdr) {
      panel.renderLines(t('personal.health.title'), [{ text: t('personal.health.no_data'), color: COLORS.warning }]);
      return;
    }
    panel.renderLines(t('personal.health.title'), [
      ...osdr.studies.flatMap((/** @type {any} */ s) => [
        { text: `${s.accession} · ${t(`personal.health.where.${s.topic}`)}`, color: COLORS.info, size: 0.75 },
        { text: t(s.summaryKey), size: 0.8 },
      ]),
      { text: t('personal.health.source', { date: formatDay(osdr.source.retrievedAt) }), color: COLORS.dim, size: 0.7 },
    ]);
  },
};

/**
 * Dosimeter face: current real rate, the real 24 h record as a chart with "now" marker,
 * accumulated surface dose this shift, ISS comparison, and the source line.
 * @param {CanvasRenderingContext2D} ctx @param {number} W @param {number} H
 * @param {{ t: Function, r: any, radlab: any, minute: number }} p
 */
function drawDosimeter(ctx, W, H, { t, r, radlab, minute }) {
  const pad = W * 0.04;
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 5;
  ctx.strokeRect(2.5, 2.5, W - 5, H - 5);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  ctx.fillStyle = COLORS.title;
  ctx.font = `bold ${Math.round(H * 0.065)}px system-ui, sans-serif`;
  ctx.fillText(t('personal.dosimeter.title'), pad, pad * 0.8, W - pad * 2);

  // Current rate (big) + accumulated dose
  ctx.fillStyle = COLORS.info;
  ctx.font = `bold ${Math.round(H * 0.11)}px system-ui, sans-serif`;
  ctx.fillText(`${r.rate.toFixed(2)} µGy/h`, pad, H * 0.15);
  ctx.fillStyle = COLORS.text;
  ctx.font = `${Math.round(H * 0.048)}px system-ui, sans-serif`;
  const doseText = r.doseMicroGy >= 1000 ? `${(r.doseMicroGy / 1000).toFixed(2)} mGy` : `${r.doseMicroGy.toFixed(1)} µGy`;
  ctx.fillText(t('personal.dosimeter.shift_dose', { dose: doseText }), W * 0.5, H * 0.16, W * 0.5 - pad);
  if (r.issTypical !== null) {
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(t('personal.dosimeter.iss', { value: r.issTypical.toFixed(1) }), W * 0.5, H * 0.235, W * 0.5 - pad);
  }

  // Chart of the real 24 h record
  const cx = pad;
  const cy = H * 0.34;
  const cw = W - pad * 2;
  const ch = H * 0.36;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx, cy, cw, ch);
  const values = r.samples.map((/** @type {any} */ s) => s.rate);
  const vMin = Math.min(...values) * 0.95;
  const vMax = Math.max(...values) * 1.05;
  const px = (/** @type {number} */ m) => cx + (m / 1440) * cw;
  const py = (/** @type {number} */ v) => cy + ch - ((v - vMin) / (vMax - vMin)) * ch;
  ctx.strokeStyle = COLORS.info;
  ctx.lineWidth = 3;
  ctx.beginPath();
  r.samples.forEach((/** @type {any} */ s, /** @type {number} */ i) => (i ? ctx.lineTo(px(s.minute), py(s.rate)) : ctx.moveTo(px(s.minute), py(s.rate))));
  ctx.stroke();
  ctx.strokeStyle = COLORS.title; // "now" in the replay
  ctx.beginPath();
  ctx.moveTo(px(minute), cy);
  ctx.lineTo(px(minute), cy + ch);
  ctx.stroke();
  ctx.fillStyle = COLORS.dim;
  ctx.font = `${Math.round(H * 0.04)}px system-ui, sans-serif`;
  ctx.fillText(`${vMax.toFixed(1)}`, cx + 4, cy + 4);
  ctx.fillText(`${vMin.toFixed(1)} µGy/h`, cx + 4, cy + ch - H * 0.05);
  ctx.textAlign = 'right';
  ctx.fillText(t('personal.dosimeter.chart', { day: formatDay(radlab.day) }), cx + cw - 4, cy + 4);
  ctx.textAlign = 'left';

  // Context + attribution (in-world, as required)
  ctx.fillStyle = COLORS.text;
  ctx.font = `${Math.round(H * 0.042)}px system-ui, sans-serif`;
  ctx.fillText(t('personal.dosimeter.context'), pad, H * 0.74, W - pad * 2);
  ctx.fillStyle = COLORS.dim;
  ctx.font = `${Math.round(H * 0.036)}px system-ui, sans-serif`;
  ctx.fillText(t('personal.dosimeter.source', { day: formatDay(radlab.day), retrieved: formatDay(radlab.source.retrievedAt) }), pad, H * 0.82, W - pad * 2);
  ctx.fillText(t('personal.dosimeter.replay'), pad, H * 0.885, W - pad * 2);
}

/** "2023-01-01" → "01/01/2023" */
function formatDay(/** @type {string} */ iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

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
