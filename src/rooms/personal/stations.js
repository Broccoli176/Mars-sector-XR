// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Personal (crew quarters): real-data dosimeter (NASA OSDR RadLab, MSL RAD) + bunk + locker.
// Placement: src/data/stations/personal.json · Texts: src/data/strings/es/personal.json
//
// To add a station: add an entry to stations/personal.json and a builder with the same id below
// (see src/rooms/hub/stations.js for a small panel + button example).
import { COLORS } from '../../ui/StationKit.js';

/** @type {Record<string, (g: import('three').Group, station: any, kit: import('../../ui/StationKit.js').StationKit) => void>} */
export const builders = {
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
