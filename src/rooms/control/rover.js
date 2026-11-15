// Rover console in the Sala de control (Perseverance-class rover, src/systems/Rover.js).
// Three canvas screens (MAPA, NAVCAM, ESTADO) + six desk buttons. Presentation only: emits rover:command.
// The NavCam is drawn in perspective on a canvas (no second 3D render: cheap on Quest).
import * as THREE from 'three';
import { COLORS, BUTTON } from '../../ui/StationKit.js';
import { Panel } from '../../ui/Panel.js';
import { Button } from '../../objects/Button.js';

const FOV_HALF = (35 * Math.PI) / 180;

/**
 * Projects a map point into the rover NavCam (pure, tested): null when behind or outside the view.
 * @param {{ x: number, y: number, heading: number }} rover @param {number} px @param {number} py
 * @returns {{ forward: number, lateral: number, sx: number } | null} sx in −1…1 across the image
 */
export function projectToCam(rover, px, py) {
  const dx = px - rover.x;
  const dy = py - rover.y;
  const forward = dx * Math.sin(rover.heading) + dy * Math.cos(rover.heading);
  const lateral = dx * Math.cos(rover.heading) - dy * Math.sin(rover.heading);
  if (forward < 1.5) return null;
  const sx = lateral / forward / Math.tan(FOV_HALF);
  if (Math.abs(sx) > 1.2) return null;
  return { forward, lateral, sx };
}

/**
 * @param {THREE.Group} g station group (north wall of the Sala de control)
 * @param {any} station
 * @param {import('../../ui/StationKit.js').StationKit} kit
 */
export function buildRoverConsole(g, station, kit) {
  const { t, game, sim } = kit;
  const cfg = game.data.balance.rover;
  const deskTop = 0.78 - station.y;
  kit.addBox(g, 2.5, 0.06, 0.7, 0, deskTop - 0.03, 0.38, '#5d666f');
  kit.addBox(g, 2.5, 0.72, 0.6, 0, deskTop - 0.42, 0.38, '#4b535b');

  const map = new Panel(0.86, 0.62, { pxPerMeter: 900 });
  map.mesh.position.set(-0.8, 0.12, 0.01);
  const cam = new Panel(0.86, 0.62, { pxPerMeter: 900 });
  cam.mesh.position.set(0.1, 0.12, 0.01);
  g.add(map.mesh, cam.mesh);
  const status = kit.addPanel(g, 0.66, 0.72, 0.9, 0.12);

  // Desk buttons, lying on the desk (pressed from above with the ray + trigger, or a click).
  /** @type {[string, string, number, number][]} */
  const LAYOUT = [
    ['forward', 'rover.btn.forward', -0.62, 0.3],
    ['back', 'rover.btn.back', -0.62, 0.56],
    ['left', 'rover.btn.left', -0.86, 0.43],
    ['right', 'rover.btn.right', -0.38, 0.43],
    ['stop', 'rover.btn.stop', -0.05, 0.43],
    ['sample', 'rover.btn.sample', 0.3, 0.43],
  ];
  const buttons = LAYOUT.map(([cmd, key, x, z]) => {
    const b = new Button({ width: 0.2, height: 0.09, label: t(key), color: BUTTON.info, onSelect: () => game.intent('rover:command', { cmd }) });
    const holder = new THREE.Group();
    holder.position.set(x, deskTop + 0.005, z);
    holder.rotation.x = -Math.PI / 2;
    holder.add(b.mesh);
    g.add(holder);
    kit.registerButton(b);
    return { cmd, key, b };
  });

  // Last rejection / stop, shown for a few refreshes on the status screen.
  let notice = /** @type {string | null} */ (null);
  let noticeTtl = 0;
  /** The simulation (and its bus) is replaced on restart: (re)subscribe when it changes. */
  let wiredBus = /** @type {any} */ (null);
  const wire = (/** @type {any} */ bus) => {
    wiredBus = bus;
    bus.on('rover:rejected', (/** @type {any} */ e) => {
      notice = `rover.reject.${e.reason}`;
      noticeTtl = 12;
    });
    bus.on('rover:stopped', (/** @type {any} */ e) => {
      notice = `rover.stop.${e.reason}`;
      noticeTtl = 12;
    });
  };

  let frame = 0;
  kit.onRefresh(() => {
    const s = sim();
    const r = s.rover;
    if (!r) return;
    if (s.bus !== wiredBus) wire(s.bus);
    frame++;
    const link = s.resources.value('signal') >= cfg.minSignal;
    const key = `${r.x.toFixed(1)}|${r.y.toFixed(1)}|${r.heading.toFixed(3)}|${r.visited.size}|${r.mode}|${link}`;
    map.renderCustom(key, (ctx, W, H) => drawMap(ctx, W, H, r, cfg, t));
    cam.renderCustom(`${key}|${r.lastStop}|${link ? 0 : frame % 4}`, (ctx, W, H) => drawNavCam(ctx, W, H, r, cfg, t, link, frame));

    const reach = r.siteInReach();
    const cores = r.cargo.filter((/** @type {any} */ c) => c.kind === 'core').length;
    const salvage = r.cargo.length - cores;
    const real = game.data.real?.perseverance;
    /** @type {{ text: string, color?: string, size?: number }[]} */
    const lines = [
      { text: t(link ? 'rover.link.ok' : 'rover.link.none', { pct: Math.round(s.resources.value('signal')) }), color: link ? COLORS.nominal : COLORS.critical, size: 0.85 },
      { text: t('rover.battery', { pct: Math.round(r.batteryPct), wh: Math.round(r.batteryWh) }), color: r.batteryPct < 20 ? COLORS.critical : r.batteryPct < 40 ? COLORS.warning : COLORS.text, size: 0.85 },
      { text: t('rover.mmrtg', { w: cfg.mmrtgW }), color: COLORS.dim, size: 0.72 },
      { text: t('rover.mode', { mode: t(`rover.mode.${r.mode}`) }), color: r.mode === 'stuck' || r.mode === 'stranded' ? COLORS.critical : COLORS.info, size: 0.85 },
      { text: t('rover.cargo', { cores, salvage }), size: 0.8 },
      { text: t('rover.delivered', { cores: r.delivered.cores, spares: r.delivered.spares }), size: 0.8 },
      { text: t('rover.distance', { m: Math.round(r.distanceToBase()), odo: Math.round(r.odometerM) }), color: COLORS.dim, size: 0.75 },
    ];
    if (reach) lines.push({ text: t('rover.reach', { site: t(reach.nameKey) }), color: COLORS.warning, size: 0.8 });
    if (notice && noticeTtl > 0) {
      noticeTtl--;
      lines.push({ text: t(notice), color: COLORS.critical, size: 0.8 });
    }
    lines.push({ text: t('rover.help'), color: COLORS.dim, size: 0.66 });
    if (real) lines.push({ text: t('rover.fact', { speed: real.topSpeedMPerHour, w: real.mmrtgWattsAtLaunch, tubes: real.sampleTubes }), color: COLORS.dim, size: 0.62 });
    status.renderLines(t('rover.title'), lines, { border: link ? COLORS.border : COLORS.critical });

    for (const { cmd, key, b } of buttons) {
      let usable = link && !r.stranded;
      if (cmd === 'sample') usable = usable && Boolean(reach) && r.mode !== 'coring';
      if ((cmd === 'forward' || cmd === 'left' || cmd === 'right') && r.stuck) usable = false;
      if (cmd === 'stop') usable = link;
      b.setState(t(key), !usable ? BUTTON.off : cmd === 'stop' ? BUTTON.danger : cmd === 'sample' ? BUTTON.warn : BUTTON.info);
    }
  });
}

/** Top-down map: sand, rocks, sites, base, trail and the rover. */
function drawMap(
  /** @type {CanvasRenderingContext2D} */ ctx, /** @type {number} */ W, /** @type {number} */ H,
  /** @type {any} */ r, /** @type {any} */ cfg, /** @type {Function} */ t,
) {
  const m = cfg.map;
  const pad = H * 0.1;
  const s = Math.min(W / (m.xMax - m.xMin), (H - pad) / (m.yMax - m.yMin));
  const ox = (W - (m.xMax - m.xMin) * s) / 2;
  const X = (/** @type {number} */ x) => ox + (x - m.xMin) * s;
  const Y = (/** @type {number} */ y) => H - (y - m.yMin) * s;
  ctx.fillStyle = '#8a5a3a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d8b46a';
  for (const z of cfg.sand) {
    ctx.beginPath(); ctx.arc(X(z.x), Y(z.y), z.r * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#3a2f2a';
  for (const k of cfg.rocks) {
    ctx.beginPath(); ctx.arc(X(k.x), Y(k.y), Math.max(2, k.r * s), 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = `bold ${Math.round(H * 0.035)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (const site of cfg.sites) {
    const done = r.visited.has(site.id);
    ctx.fillStyle = done ? '#8b98a5' : site.kind === 'core' ? '#5fc8ff' : '#ff9f3f';
    ctx.beginPath();
    if (site.kind === 'core') ctx.rect(X(site.x) - 6, Y(site.y) - 6, 12, 12);
    else { ctx.moveTo(X(site.x), Y(site.y) - 8); ctx.lineTo(X(site.x) + 8, Y(site.y) + 6); ctx.lineTo(X(site.x) - 8, Y(site.y) + 6); }
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${t(site.nameKey)}${done ? ' ✔' : ''}`, X(site.x), Y(site.y) - 12);
  }
  ctx.fillStyle = '#7fe07f';
  ctx.beginPath(); ctx.arc(X(cfg.start.x), Y(cfg.start.y), cfg.dockRadiusM * s + 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(t('rover.map.base'), X(cfg.start.x), Y(cfg.start.y) - 10);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  r.trail.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
  ctx.lineTo(X(r.x), Y(r.y));
  ctx.stroke();
  // Rover arrow.
  ctx.save();
  ctx.translate(X(r.x), Y(r.y));
  ctx.rotate(r.heading);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, pad);
  ctx.fillStyle = COLORS.title;
  ctx.textAlign = 'left';
  ctx.font = `bold ${Math.round(pad * 0.6)}px system-ui, sans-serif`;
  ctx.fillText(t('rover.map.title'), W * 0.02, pad * 0.75);
}

/** First-person camera: sky, ground, and rocks / sites / base projected by distance and angle. */
function drawNavCam(
  /** @type {CanvasRenderingContext2D} */ ctx, /** @type {number} */ W, /** @type {number} */ H,
  /** @type {any} */ r, /** @type {any} */ cfg, /** @type {Function} */ t, /** @type {boolean} */ link, /** @type {number} */ frame,
) {
  const horizon = H * 0.42;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#b98a62');
  sky.addColorStop(1, '#e2b98a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon);
  const ground = ctx.createLinearGradient(0, horizon, 0, H);
  ground.addColorStop(0, '#a8714a');
  ground.addColorStop(1, '#6e4630');
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, W, H - horizon);
  const camH = 2; // mast height (m)
  const focal = H * 0.9;
  /** @type {{ d: number, draw: () => void }[]} */
  const items = [];
  const at = (/** @type {number} */ px, /** @type {number} */ py) => {
    const p = projectToCam(r, px, py);
    if (!p) return null;
    return { ...p, x: W / 2 + (p.sx * W) / 2, y: horizon + (camH / p.forward) * focal };
  };
  for (const z of cfg.sand) {
    const p = at(z.x, z.y);
    if (p) items.push({ d: p.forward, draw: () => { ctx.fillStyle = 'rgba(232,200,130,0.85)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, (z.r / p.forward) * focal, Math.max(2, (z.r / p.forward) * focal * 0.15), 0, 0, Math.PI * 2); ctx.fill(); } });
  }
  for (const k of cfg.rocks) {
    const p = at(k.x, k.y);
    if (p) items.push({ d: p.forward, draw: () => { const rad = (k.r / p.forward) * focal; ctx.fillStyle = '#3d302a'; ctx.beginPath(); ctx.ellipse(p.x, p.y - rad * 0.35, rad, rad * 0.55, 0, 0, Math.PI * 2); ctx.fill(); } });
  }
  for (const site of cfg.sites) {
    const p = at(site.x, site.y);
    if (!p) continue;
    items.push({ d: p.forward, draw: () => {
      const hgt = (3 / p.forward) * focal;
      ctx.strokeStyle = '#eeeeee';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - hgt); ctx.stroke();
      ctx.fillStyle = r.visited.has(site.id) ? '#8b98a5' : site.kind === 'core' ? '#5fc8ff' : '#ff9f3f';
      ctx.fillRect(p.x, p.y - hgt, hgt * 0.5, hgt * 0.3);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(H * 0.04)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${t(site.nameKey)} · ${Math.round(p.forward)} m`, p.x, p.y - hgt - 6);
    } });
  }
  const base = at(cfg.start.x, cfg.start.y);
  if (base) items.push({ d: base.forward, draw: () => { const rad = (5 / base.forward) * focal; ctx.fillStyle = '#c9cfd6'; ctx.beginPath(); ctx.ellipse(base.x, base.y, rad, rad * 0.6, 0, Math.PI, 0); ctx.fill(); } });
  items.sort((a, b) => b.d - a.d).forEach((it) => it.draw());

  // HUD of the camera feed (inside the screen, not head-locked).
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W / 2 - 12, horizon); ctx.lineTo(W / 2 + 12, horizon); ctx.moveTo(W / 2, horizon - 12); ctx.lineTo(W / 2, horizon + 12); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H * 0.1);
  ctx.fillStyle = COLORS.title;
  ctx.textAlign = 'left';
  ctx.font = `bold ${Math.round(H * 0.06)}px system-ui, sans-serif`;
  ctx.fillText(t('rover.cam.title', { deg: Math.round((r.heading * 180) / Math.PI) }), W * 0.02, H * 0.075);
  if (r.lastStop === 'obstacle') {
    ctx.fillStyle = 'rgba(255,107,92,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText(t('rover.cam.hazard'), W / 2, H * 0.94);
  }
  if (!link) {
    // Lost link: frozen noisy feed.
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = (i + frame) % 2 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
      ctx.fillRect(Math.random() * W, Math.random() * H, 3, 3);
    }
    ctx.fillStyle = COLORS.critical;
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.round(H * 0.09)}px system-ui, sans-serif`;
    ctx.fillText(t('rover.cam.nolink'), W / 2, H / 2);
  }
}
