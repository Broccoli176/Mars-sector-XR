// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
// Personal: crew quarters right next to the Sala central (no corridor), radiation storm shelter,
// real-data dosimeter (NASA OSDR RadLab, MSL RAD), «El Sol ahora» (NASA DONKI) and astronaut health (NASA OSDR).
// Panels are pictograms (personalIcons.js) for young players; each has an «Info» button that opens the
// rigorous text with numbers and sources (src/ui/InfoSheet.js).
// Placement: src/data/stations/personal.json · Texts: src/data/strings/es/personal.json
import { Vector3 } from 'three';
import { COLORS } from '../../ui/StationKit.js';
import { Panel } from '../../ui/Panel.js';
import { fmt } from '../../utils/strings.js';
import { addInfo } from '../../ui/InfoSheet.js';
import { createSpaceWeatherFeed } from './spaceWeatherLive.js';
import * as icon from './personalIcons.js';

/** @typedef {import('../../ui/InfoSheet.js').Line} Line */

/** @type {Record<string, (g: import('three').Group, station: any, kit: import('../../ui/StationKit.js').StationKit) => void>} */
export const builders = {
  /** Dosimeter: big current rate, Mars vs ISS bars and the real 24 h record. Turns into the storm alarm during the SEP event. */
  personal_dosimeter(g, _station, kit) {
    const { t, sim } = kit;
    const radlab = kit.game.data.real?.radlab;
    const panel = new Panel(1.2, 0.8, { pxPerMeter: 520 });
    g.add(panel.mesh);

    // Storm shelter = this room. Report where the player's head is (crew:shelter); the sim decides the dose.
    const room = kit.game.data.layout.rooms.find((/** @type {any} */ rm) => rm.id === 'room_personal');
    const loco = kit.services.locomotion;
    const head = new Vector3();
    const inShelter = () => {
      if (!loco || !room) return true;
      loco.headWorld(head);
      return head.x >= room.x[0] && head.x <= room.x[1] && head.z >= room.z[0] && head.z <= room.z[1];
    };

    addInfo(g, kit, {
      bx: 0, by: -0.47, px: 0, py: 0, w: 1.3, h: 0.86,
      title: () => t(sim().radiation?.stormActive ? 'personal.sep.info_title' : 'personal.dosimeter.info_title'),
      lines: () => {
        const r = sim().radiation;
        if (!r || !radlab) return [{ text: t('personal.dosimeter.no_data'), color: COLORS.warning }];
        if (r.stormActive) {
          return [
            { text: t('personal.sep.rate', { rate: r.rate.toFixed(0), normal: r.marsMean.toFixed(1) }), size: 0.85 },
            { text: t('personal.sep.storm_dose', { dose: formatDose(r.stormDoseMicroGy) }), size: 0.85 },
            { text: t('personal.sep.exposed', { min: Math.round(r.exposedMinutes) }), size: 0.85 },
            { text: t('personal.sep.nasa'), color: COLORS.info, size: 0.8 },
            { text: t('personal.sep.real'), color: COLORS.dim, size: 0.72 },
          ];
        }
        return [
          { text: t('personal.dosimeter.info_unit', { rate: r.rate.toFixed(2) }), size: 0.82 },
          { text: t('personal.dosimeter.shift_dose', { dose: formatDose(r.doseMicroGy) }), size: 0.82 },
          ...(r.issTypical !== null ? [{ text: t('personal.dosimeter.iss', { value: r.issTypical.toFixed(1) }), size: 0.82 }] : []),
          { text: t('personal.dosimeter.context'), size: 0.82 },
          { text: t('personal.sep.nasa'), color: COLORS.info, size: 0.78 },
          { text: t('personal.dosimeter.source', { day: formatDay(radlab.day), retrieved: formatDay(radlab.source.retrievedAt) }), color: COLORS.dim, size: 0.7 },
          { text: t('personal.dosimeter.replay'), color: COLORS.dim, size: 0.7 },
        ];
      },
    });

    kit.onRefresh(() => {
      const r = sim().radiation;
      if (!r || !radlab) {
        panel.renderLines(t('personal.dosimeter.title'), [{ text: t('personal.dosimeter.no_data'), color: COLORS.warning }]);
        return;
      }
      const inside = inShelter();
      if (r.sheltered !== inside) kit.game.intent('crew:shelter', { inside });
      if (r.stormActive) {
        const danger = r.shelterNeeded;
        const level = Math.min(1, r.rate / Math.max(1, r.stormPeak, r.rate));
        const [msgKey, msgColor] = !danger ? ['personal.sep.ending', COLORS.nominal]
          : inside ? ['personal.sep.safe', COLORS.nominal] : ['personal.sep.go', COLORS.critical];
        panel.renderCustom(`storm|${msgKey}|${Math.round(level * 30)}`, (ctx, W, H) => {
          icon.frame(ctx, W, H, danger ? COLORS.critical : COLORS.warning);
          icon.text(ctx, t('personal.sep.short'), W / 2, H * 0.11, { size: H * 0.1, color: danger ? COLORS.critical : COLORS.warning, bold: true, align: 'center' });
          icon.sun(ctx, W * 0.2, H * 0.43, H * 0.15, true);
          icon.particles(ctx, W * 0.45, H * 0.43, H * 0.13);
          icon.shield(ctx, W * 0.75, H * 0.43, H * 0.17, !danger || inside);
          icon.text(ctx, t('personal.sep.level'), W * 0.06, H * 0.7, { size: H * 0.055, color: COLORS.dim });
          icon.bar(ctx, W * 0.32, H * 0.67, W * 0.62, H * 0.06, level, danger ? COLORS.critical : COLORS.warning);
          icon.text(ctx, t(msgKey), W / 2, H * 0.87, { size: H * 0.085, color: msgColor, bold: true, align: 'center', maxWidth: W * 0.92 });
        });
        return;
      }
      const c = sim().time.clock();
      const minute = c.hour * 60 + c.minute;
      const key = `${r.rate.toFixed(2)}|${Math.floor(minute / 10)}`;
      panel.renderCustom(key, (ctx, W, H) => drawDosimeter(ctx, W, H, { t, r, minute }));
    });
  },

  /** Bunk + water-tank shelter wall, with a pictogram sign and the «why water?» sheet. */
  personal_bunk(g, station, kit) {
    const { t } = kit;
    const base = -station.y; // station-local floor height
    kit.addBox(g, 2.0, 0.45, 0.9, 0, base + 0.225, 0.45, '#5f646b'); // frame
    kit.addBox(g, 1.9, 0.12, 0.82, 0, base + 0.51, 0.45, '#7d6f8a'); // mattress
    kit.addBox(g, 0.4, 0.1, 0.6, -0.7, base + 0.62, 0.45, '#c9c4bb'); // pillow
    // Storm shelter: a wall of water tanks behind the bunk (NASA: ~10 g/cm² water-equivalent around the astronaut).
    kit.addBox(g, 2.1, 1.3, 0.22, 0, base + 1.24, 0.11, '#3b6688');
    const sign = new Panel(0.9, 0.34, { pxPerMeter: 520 });
    sign.mesh.position.set(-0.15, base + 2.1, 0);
    g.add(sign.mesh);
    sign.renderCustom('shelter', (ctx, W, H) => {
      icon.frame(ctx, W, H, COLORS.info);
      icon.shield(ctx, H * 0.5, H / 2, H * 0.32, true);
      icon.drop(ctx, H * 1.05, H * 0.55, H * 0.42, '#6fc3ff');
      icon.text(ctx, t('personal.shelter.title'), H * 1.45, H * 0.33, { size: H * 0.24, color: COLORS.title, bold: true, maxWidth: W - H * 1.55 });
      icon.text(ctx, t('personal.shelter.short'), H * 1.45, H * 0.68, { size: H * 0.18, color: COLORS.info, bold: true, maxWidth: W - H * 1.55 });
    });
    addInfo(g, kit, {
      bx: 0.47, by: base + 2.1, px: -0.15, py: base + 1.55, w: 1.2, h: 0.7,
      title: () => t('personal.shelter.info_title'),
      lines: () => [
        { text: t('personal.shelter.info_1'), size: 0.85 },
        { text: t('personal.shelter.info_2'), size: 0.85 },
        { text: t('personal.shelter.info_3'), size: 0.85 },
        { text: t('personal.shelter.info_note'), color: COLORS.dim, size: 0.7 },
      ],
    });
  },

  personal_locker(g, station, kit) {
    kit.addBox(g, 0.8, 1.9, 0.5, 0, 0.95 - station.y, 0.25, '#56606b');
  },

  /**
   * "El Sol ahora": NASA DONKI space weather, LIVE when the browser can reach api.nasa.gov,
   * otherwise the embedded snapshot — and the panel always says which one it is (pill in the corner).
   */
  personal_spaceweather(g, _station, kit) {
    const { t } = kit;
    const fallback = kit.game.data.real?.donki_recent ?? null;
    const apiKey = import.meta.env?.VITE_NASA_API_KEY || 'DEMO_KEY';
    const feed = createSpaceWeatherFeed({ apiKey, fallback });
    feed.start();
    const panel = new Panel(0.95, 0.72, { pxPerMeter: 520 });
    g.add(panel.mesh);

    addInfo(g, kit, {
      bx: 0, by: -0.43, px: 0, py: 0.05, w: 1.3, h: 0.95,
      title: () => t('personal.sun.info_title'),
      lines: () => {
        const st = feed.state;
        const s = st.summary;
        /** @type {Line[]} */
        const lines = [statusLine(st, t)];
        if (s) {
          lines.push({ text: t('personal.sun.cme', { n: s.cmeCount }), size: 0.82 });
          if (s.fastestCmeKms) lines.push({ text: t('personal.sun.fastest', { kms: s.fastestCmeKms }), size: 0.82 });
          lines.push({ text: t('personal.sun.storms', { n: s.gstCount, sep: s.sepCount }), size: 0.82 });
        }
        lines.push({ text: t('personal.sun.explain'), size: 0.8 });
        lines.push({ text: t('personal.sun.info_gst'), size: 0.78 });
        lines.push({ text: t('personal.sun.info_sep'), size: 0.78 });
        lines.push({ text: t('personal.sun.source'), color: COLORS.dim, size: 0.7 });
        return lines;
      },
    });

    kit.onRefresh(() => {
      const st = feed.state;
      const s = st.summary;
      const pill = { live: COLORS.nominal, snapshot: COLORS.warning, loading: COLORS.dim, unavailable: COLORS.critical }[st.status];
      const key = [st.status, s?.cmeCount, s?.gstCount, s?.sepCount].join('|');
      panel.renderCustom(key, (ctx, W, H) => {
        icon.frame(ctx, W, H, st.status === 'live' ? COLORS.nominal : COLORS.border);
        icon.text(ctx, t('personal.sun.short_title'), W * 0.05, H * 0.1, { size: H * 0.085, color: COLORS.title, bold: true });
        // Live / snapshot pill.
        const label = t(`personal.sun.pill.${st.status}`);
        icon.tile(ctx, W * 0.64, H * 0.04, W * 0.32, H * 0.11, '#11161c', pill, 4);
        icon.text(ctx, label, W * 0.8, H * 0.1, { size: H * 0.06, color: pill, bold: true, align: 'center', maxWidth: W * 0.28 });
        icon.sun(ctx, W * 0.17, H * 0.47, H * 0.14, Boolean(s && s.sepCount > 0));
        /** @type {[(c: CanvasRenderingContext2D, x: number, y: number, r: number) => void, string, number | undefined][]} */
        const rows = [
          [(c, x, y, r) => icon.cloud(c, x, y, r), 'personal.sun.cme_short', s?.cmeCount],
          [(c, x, y, r) => icon.magnet(c, x, y, r), 'personal.sun.gst_short', s?.gstCount],
          [(c, x, y, r) => icon.particles(c, x, y, r), 'personal.sun.sep_short', s?.sepCount],
        ];
        rows.forEach(([draw, key2, n], i) => {
          const y = H * (0.3 + i * 0.18);
          draw(ctx, W * 0.42, y, H * 0.065);
          icon.text(ctx, n === undefined ? '—' : String(n), W * 0.53, y, { size: H * 0.1, bold: true });
          icon.text(ctx, t(key2), W * 0.6, y, { size: H * 0.066, maxWidth: W * 0.37 });
        });
        icon.text(ctx, t('personal.sun.week'), W / 2, H * 0.88, { size: H * 0.06, color: COLORS.dim, align: 'center' });
      });
    });
  },

  /** "Tu cuerpo en el espacio": 3 picture cards from real NASA OSDR studies; details in the Info sheet. */
  personal_health(g, _station, kit) {
    const { t } = kit;
    const osdr = kit.game.data.real?.osdr_health;
    const panel = new Panel(1.05, 0.8, { pxPerMeter: 520 });
    g.add(panel.mesh);
    if (!osdr) {
      panel.renderLines(t('personal.health.title'), [{ text: t('personal.health.no_data'), color: COLORS.warning }]);
      return;
    }
    /** @type {Record<string, (c: CanvasRenderingContext2D, x: number, y: number, r: number) => void>} */
    const icons = {
      muscle_bone: (c, x, y, r) => icon.bone(c, x, y, r),
      astronauts: (c, x, y, r) => icon.bodyClock(c, x, y, r),
      radiation_immunity: (c, x, y, r) => icon.defender(c, x, y, r),
    };
    panel.renderCustom('health', (ctx, W, H) => {
      icon.frame(ctx, W, H);
      icon.text(ctx, t('personal.health.short_title'), W / 2, H * 0.09, { size: H * 0.08, color: COLORS.title, bold: true, align: 'center', maxWidth: W * 0.9 });
      osdr.studies.slice(0, 3).forEach((/** @type {any} */ s, /** @type {number} */ i) => {
        const y = H * 0.18 + i * H * 0.27;
        icon.tile(ctx, W * 0.04, y, W * 0.92, H * 0.24, '#161d25', COLORS.border, 3);
        (icons[s.topic] ?? icons.muscle_bone)(ctx, W * 0.14, y + H * 0.12, H * 0.085);
        icon.text(ctx, t(`personal.health.card.${s.topic}`), W * 0.26, y + H * 0.075, { size: H * 0.065, bold: true, maxWidth: W * 0.66 });
        icon.text(ctx, t(`personal.health.tip.${s.topic}`), W * 0.26, y + H * 0.165, { size: H * 0.055, color: COLORS.info, maxWidth: W * 0.66 });
      });
    });
    addInfo(g, kit, {
      bx: 0, by: -0.47, px: 0, py: 0, w: 1.2, h: 0.86,
      title: () => t('personal.health.title'),
      lines: () => [
        ...osdr.studies.flatMap((/** @type {any} */ s) => [
          {
            text: s.mission
              ? t('personal.health.info_study', { accession: s.accession, where: t(`personal.health.where.${s.topic}`), mission: s.mission })
              : `${s.accession} · ${t(`personal.health.where.${s.topic}`)}`,
            color: COLORS.info,
            size: 0.75,
          },
          { text: t(s.summaryKey), size: 0.8 },
        ]),
        { text: t('personal.health.info_note'), color: COLORS.dim, size: 0.7 },
        { text: t('personal.health.source', { date: formatDay(osdr.source.retrievedAt) }), color: COLORS.dim, size: 0.7 },
      ],
    });
  },
};

/** Live / snapshot / unavailable line for the Info sheet (the panel itself shows a pill). @param {any} st @param {Function} t @returns {Line} */
function statusLine(st, t) {
  if (st.status === 'live') {
    const time = st.fetchedAt ? `${String(st.fetchedAt.getHours()).padStart(2, '0')}:${String(st.fetchedAt.getMinutes()).padStart(2, '0')}` : '';
    return { text: t('personal.sun.live', { time }), color: COLORS.nominal, size: 0.82 };
  }
  if (st.status === 'snapshot') return { text: t('personal.sun.snapshot', { date: formatDay(st.retrievedAt ?? '') }), color: COLORS.warning, size: 0.82 };
  return { text: t('personal.sun.unavailable'), color: COLORS.warning, size: 0.82 };
}

/**
 * Dosimeter face for young players: big current rate, Mars vs ISS bars, the real 24 h record with a "now"
 * marker, and one short line. Numbers and sources are in the Info sheet.
 * @param {CanvasRenderingContext2D} ctx @param {number} W @param {number} H
 * @param {{ t: Function, r: any, minute: number }} p
 */
function drawDosimeter(ctx, W, H, { t, r, minute }) {
  const pad = W * 0.04;
  icon.frame(ctx, W, H);
  icon.text(ctx, t('personal.dosimeter.short_title'), pad, H * 0.08, { size: H * 0.075, color: COLORS.title, bold: true });

  // Big current rate.
  icon.particles(ctx, pad + H * 0.07, H * 0.27, H * 0.06, COLORS.info);
  icon.text(ctx, t('personal.dosimeter.now'), pad + H * 0.17, H * 0.19, { size: H * 0.05, color: COLORS.dim });
  icon.text(ctx, `${fmt(r.rate)} µGy/h`, pad + H * 0.17, H * 0.29, { size: H * 0.1, color: COLORS.info, bold: true });

  // Mars vs ISS bars (same day, real data).
  const bx = W * 0.55;
  const bw = W * 0.4;
  const max = Math.max(r.rate, r.issTypical ?? 0) * 1.1;
  icon.text(ctx, t('personal.dosimeter.mars'), bx, H * 0.17, { size: H * 0.045, color: COLORS.dim });
  icon.bar(ctx, bx, H * 0.2, bw, H * 0.045, r.rate / max, '#d9472b');
  if (r.issTypical !== null) {
    icon.text(ctx, t('personal.dosimeter.iss_short'), bx, H * 0.29, { size: H * 0.045, color: COLORS.dim });
    icon.bar(ctx, bx, H * 0.32, bw, H * 0.045, r.issTypical / max, '#7cc4ff');
  }

  // Chart of the real 24 h record.
  const cx = pad;
  const cy = H * 0.42;
  const cw = W - pad * 2;
  const ch = H * 0.3;
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
  icon.text(ctx, t('personal.dosimeter.today'), cx + cw - 6, cy + H * 0.035, { size: H * 0.042, color: COLORS.dim, align: 'right' });

  // One short, reassuring line.
  icon.buriedBase(ctx, pad + H * 0.08, H * 0.86, H * 0.07);
  icon.text(ctx, t('personal.dosimeter.safe'), pad + H * 0.2, H * 0.86, { size: H * 0.07, color: COLORS.nominal, bold: true, maxWidth: W - pad * 2 - H * 0.2 });
}

/** @param {number} microGy */
function formatDose(microGy) {
  return microGy >= 1000 ? `${fmt(microGy / 1000, 2)} mGy` : `${fmt(microGy)} µGy`;
}

/** "2023-01-01" → "01/01/2023" */
function formatDay(/** @type {string} */ iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
