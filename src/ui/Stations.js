import * as THREE from 'three';
import { Panel, COLORS } from './Panel.js';
import { Button } from '../objects/Button.js';
import { stationTransform } from '../world/Basement.js';
import { formatClock } from '../utils/strings.js';

const CIRCUITS = ['lifeSupport', 'heating', 'lighting', 'telecom', 'hydro', 'repairBay'];
const SPEEDS = [0, 1, 2, 4];
const BUTTON = { on: '#2e8b57', off: '#4a525a', warn: '#b7791f', danger: '#b83a2e', action: '#2f6fb3' };
const LOG_COLORS = { info: COLORS.text, hint: COLORS.info, comms: COLORS.title, warning: COLORS.warning, critical: COLORS.critical };
const KCAL_PER_DAY = 2500;

/** @param {string} status */
const statusColor = (status) => COLORS[/** @type {'nominal'|'warning'|'critical'} */ (status)] ?? COLORS.text;

/**
 * Builds every diegetic station from layout.stations and keeps them in sync with the simulation.
 * Stations only read simulation state and emit intents through `game.intent()`.
 * @param {{ layout: any, rooms: Record<string, any>, game: import('../core/Game.js').Game, t: Function, scene: THREE.Object3D, interactive: THREE.Object3D[] }} ctx
 */
export function buildStations({ layout, rooms, game, t, scene, interactive }) {
  /** @type {Button[]} */
  const buttons = [];
  /** @type {(() => void)[]} */
  const refreshers = [];
  const sim = () => game.sim;
  const lambert = (/** @type {string} */ color) => new THREE.MeshLambertMaterial({ color });

  /** @param {THREE.Object3D} parent @param {ConstructorParameters<typeof Button>[0]} opts @param {number} x @param {number} y */
  const addButton = (parent, opts, x, y) => {
    const b = new Button(opts);
    const holder = new THREE.Group();
    holder.position.set(x, y, 0);
    holder.add(b.mesh);
    parent.add(holder);
    buttons.push(b);
    interactive.push(b.mesh);
    return b;
  };

  /** @param {THREE.Object3D} parent @param {number} w @param {number} h @param {number} [x] @param {number} [y] */
  const addPanel = (parent, w, h, x = 0, y = 0) => {
    const p = new Panel(w, h);
    p.mesh.position.set(x, y, 0);
    parent.add(p.mesh);
    return p;
  };

  /** Decorative box in station-local coordinates (y relative to station height). */
  const addBox = (/** @type {THREE.Object3D} */ parent, w, h, d, x, y, z, color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const addCylinder = (/** @type {THREE.Object3D} */ parent, r, h, x, y, z, color) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), lambert(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  /** @type {Record<string, (g: THREE.Group, station: any) => void>} */
  const builders = {
    main_pc(g, station) {
      addBox(g, 1.6, 0.06, 0.6, 0, -0.62, 0.3, '#3b4249'); // desk
      addBox(g, 1.6, station.y - 0.65, 0.55, 0, -0.65 - (station.y - 0.65) / 2, 0.3, '#2c3238');
      const panel = addPanel(g, 1.4, 0.95, 0, 0.1);
      const start = addButton(g, { width: 0.34, height: 0.1, label: '', onSelect: () => {
        const phase = sim().phase;
        if (phase === 'training') game.intent('game:start');
        else if (phase === 'over' || phase === 'won') game.restart();
      } }, 0, -0.5);
      refreshers.push(() => {
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

    time_lever(g) {
      const panel = addPanel(g, 0.56, 0.14, 0, 0.1);
      panel.renderLines('', [{ text: t('ui.time.title'), color: COLORS.title, size: 1.6 }]);
      const btns = SPEEDS.map((speed, i) =>
        addButton(g, { width: 0.11, height: 0.08, label: '', onSelect: () => game.intent('time:setSpeed', { speed }) }, -0.195 + i * 0.13, -0.03));
      refreshers.push(() => {
        const s = sim();
        btns.forEach((b, i) => {
          const speed = SPEEDS[i];
          const active = s.time.speed === speed;
          const blink = s.time.autoPaused && speed !== 0 && Math.floor(performance.now() / 500) % 2 === 0;
          b.setState(speed === 0 ? 'II' : `${speed}×`, active ? BUTTON.on : blink ? BUTTON.warn : BUTTON.off);
        });
      });
    },

    breakers(g) {
      const panel = addPanel(g, 1.7, 0.42, 0, 0.12);
      const spacing = 0.26;
      const btns = CIRCUITS.map((id, i) =>
        addButton(g, { width: 0.16, height: 0.1, label: '', onSelect: () => {
          game.intent('breaker:toggle', { circuitId: id, on: !sim().power.breakers[id] });
        } }, (i - 2.5) * spacing, -0.2));
      const reset = addButton(g, { width: 0.42, height: 0.1, label: t('ui.breakers.reset'), color: BUTTON.danger,
        onSelect: () => game.intent('relay:resetRequest') }, 0, -0.38);
      refreshers.push(() => {
        const p = sim().power;
        const states = CIRCUITS.map((id) => (!p.breakers[id] ? 'off' : p.served[id] ? 'on' : 'offline'));
        panel.renderCustom(JSON.stringify([states, p.relayClosed]), (ctx, W, H) => {
          ctx.fillStyle = COLORS.background;
          ctx.fillRect(0, 0, W, H);
          ctx.strokeStyle = p.relayClosed ? COLORS.border : COLORS.critical;
          ctx.lineWidth = 6;
          ctx.strokeRect(3, 3, W - 6, H - 6);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = COLORS.title;
          ctx.font = `bold ${Math.round(H * 0.16)}px system-ui, sans-serif`;
          ctx.fillText(t('ui.breakers.title'), W / 2, H * 0.06);
          const colW = (spacing / 1.7) * W;
          CIRCUITS.forEach((id, i) => {
            const x = W / 2 + (i - 2.5) * colW;
            ctx.fillStyle = COLORS.text;
            ctx.font = `${Math.round(H * 0.15)}px system-ui, sans-serif`;
            ctx.fillText(t(`ui.circuit.${id}`), x, H * 0.36);
            const st = states[i];
            ctx.fillStyle = st === 'on' ? COLORS.nominal : st === 'off' ? COLORS.dim : COLORS.critical;
            ctx.font = `bold ${Math.round(H * 0.13)}px system-ui, sans-serif`;
            ctx.fillText(t(`ui.circuit.${st}`), x, H * 0.62);
          });
        });
        btns.forEach((b, i) => {
          const st = states[i];
          b.setState(p.breakers[CIRCUITS[i]] ? 'ON' : 'OFF', st === 'on' ? BUTTON.on : st === 'off' ? BUTTON.off : BUTTON.warn);
        });
        reset.setState(t('ui.breakers.reset'), p.relayClosed ? BUTTON.off : BUTTON.danger);
      });
    },

    bio_panel(g) {
      const panel = addPanel(g, 0.7, 0.42);
      refreshers.push(() => renderBio(panel, sim(), t));
    },

    ls_gauges(g) {
      const panel = addPanel(g, 0.95, 0.72);
      refreshers.push(() => {
        const s = sim();
        const ls = s.lifeSupport;
        const res = (/** @type {string} */ id, digits = 0) => {
          const r = s.resources.get(id);
          return { text: `${t(`ui.resource.${id}`)}: ${r.value.toFixed(digits)} ${r.unit}   ${t(`ui.status.${r.status}`)}`, color: statusColor(r.status) };
        };
        const state = (/** @type {boolean} */ running) =>
          t(running ? 'ui.state.running' : s.power.served.lifeSupport ? 'ui.state.idle' : 'ui.state.unpowered');
        panel.renderLines(t('ui.ls.title'), [
          res('oxygen'), res('co2'), res('pressure'), res('temperature', 1),
          t('ui.ls.electrolyzer', { state: state(ls.electrolyzerRunning) }),
          t('ui.ls.scrubber', { state: state(ls.scrubberRunning) }),
        ]);
      });
    },

    ls_scrubber(g, station) {
      addBox(g, 0.8, station.y - 0.4, 0.5, 0, -0.4 - (station.y - 0.4) / 2 + 0.02, 0.28, '#4d6670');
      const panel = addPanel(g, 0.62, 0.34, 0, 0.12);
      const swap = addButton(g, { width: 0.3, height: 0.09, label: t('ui.ls.swap_filter'), color: BUTTON.action,
        onSelect: () => game.intent('filter:swap') }, 0, -0.16);
      refreshers.push(() => {
        const s = sim();
        const ls = s.lifeSupport;
        const pct = Math.round(ls.filterFraction * 100);
        panel.renderLines(t('ui.ls.scrubber_title'), [
          { text: t('ui.ls.filter', { pct, count: s.inventory.filters }), color: pct <= 0 ? COLORS.critical : pct < 15 ? COLORS.warning : COLORS.text },
          t('ui.ls.scrubber', { state: t(ls.scrubberRunning ? 'ui.state.running' : s.power.served.lifeSupport ? 'ui.state.idle' : 'ui.state.unpowered') }),
        ]);
        swap.setState(t('ui.ls.swap_filter'), s.inventory.filters > 0 ? (pct < 15 ? BUTTON.warn : BUTTON.action) : BUTTON.off);
      });
    },

    ls_o2tanks(g, station) {
      addCylinder(g, 0.22, 1.5, -0.55, 0.75 - station.y, 0.3, '#5f87a8');
      addCylinder(g, 0.22, 1.5, 0.55, 0.75 - station.y, 0.3, '#5f87a8');
      addBox(g, 0.9, 1.0, 0.5, 1.4, 0.5 - station.y, 0.3, '#6b7a86'); // electrolyzer
      const panel = addPanel(g, 0.62, 0.22, 0, 0.12);
      const ids = ['valve_o2_tank_1', 'valve_o2_tank_2'];
      const btns = ids.map((valveId, i) =>
        addButton(g, { width: 0.22, height: 0.09, label: '', onSelect: () => game.intent('valve:turn', { valveId, open: true }) }, i === 0 ? -0.15 : 0.15, -0.08));
      refreshers.push(() => {
        const ls = sim().lifeSupport;
        panel.renderLines(t('ui.o2tanks.title'), []);
        btns.forEach((b, i) => {
          const used = ls.o2TanksUsed[ids[i]];
          b.setState(`${t('ui.o2tanks.tank', { n: i + 1 })}: ${t(used ? 'ui.o2tanks.used' : 'ui.o2tanks.full')}`, used ? BUTTON.off : BUTTON.action);
        });
      });
    },

    ls_thermostat(g) {
      const panel = addPanel(g, 0.5, 0.3, 0, 0.1);
      addButton(g, { width: 0.1, height: 0.08, label: '−', color: BUTTON.action,
        onSelect: () => game.intent('thermostat:set', { setpointC: sim().lifeSupport.setpointC - 1 }) }, -0.12, -0.12);
      addButton(g, { width: 0.1, height: 0.08, label: '+', color: BUTTON.action,
        onSelect: () => game.intent('thermostat:set', { setpointC: sim().lifeSupport.setpointC + 1 }) }, 0.12, -0.12);
      refreshers.push(() => {
        const s = sim();
        const ls = s.lifeSupport;
        const temp = s.resources.get('temperature');
        panel.renderLines(t('ui.thermostat.title'), [
          t('ui.thermostat.setpoint', { value: ls.setpointC }),
          { text: `${t('ui.resource.temperature')}: ${temp.value.toFixed(1)} °C`, color: statusColor(temp.status) },
          t('ui.thermostat.heater', { state: t(ls.heaterRunning ? 'ui.state.running' : s.power.served.heating ? 'ui.state.idle' : 'ui.state.unpowered') }),
        ]);
      });
    },

    hydro_racks(g, station) {
      addBox(g, 3.2, 0.9, 0.55, 0, 0.45 - station.y, 0.32, '#5b5f52');
      /** @type {THREE.Mesh[]} */
      const plants = [];
      for (let i = 0; i < 8; i++) plants.push(addBox(g, 0.25, 0.25, 0.25, -1.4 + i * 0.4, 1.02 - station.y, 0.32, '#3f8f3f'));
      const panel = addPanel(g, 0.8, 0.3, 0, 0.12);
      const harvest = addButton(g, { width: 0.3, height: 0.09, label: t('ui.hydro.harvest'),
        onSelect: () => game.intent('food:harvest') }, 0, -0.12);
      refreshers.push(() => {
        const s = sim();
        const f = s.food;
        const cfg = s.balance.food;
        const lines = f.ready
          ? [{ text: t('ui.hydro.ready', { hours: (cfg.spoilAfterReadyHours - f.readyHours).toFixed(1) }), color: COLORS.warning }]
          : [t('ui.hydro.growth', { value: f.growthHours.toFixed(1), total: cfg.growthHoursToReady })];
        if (f.neglectHours > 0) lines.push({ text: t('ui.hydro.neglect', { hours: f.neglectHours.toFixed(1), limit: cfg.spoilWithoutCareHours }), color: COLORS.critical });
        lines.push(t('ui.hydro.lights', { state: t(f.lightsOn ? 'ui.state.running' : s.power.served.hydro ? 'ui.state.idle' : 'ui.state.unpowered') }));
        panel.renderLines(t('ui.hydro.title'), lines);
        harvest.setState(t('ui.hydro.harvest'), f.ready ? BUTTON.warn : BUTTON.off);
        const scale = 0.4 + 0.6 * Math.min(1, f.growthHours / cfg.growthHoursToReady);
        for (const p of plants) {
          p.scale.setScalar(f.ready ? 1.1 : scale);
          /** @type {THREE.MeshLambertMaterial} */ (p.material).color.set(f.neglectHours > 0 ? '#8a7a3a' : f.ready ? '#7fcf3f' : '#3f8f3f');
        }
      });
    },

    hydro_water(g, station) {
      addCylinder(g, 0.4, 1.8, 0.9, 0.9 - station.y, 0.45, '#4f7f8f');
      const panel = addPanel(g, 0.6, 0.32);
      refreshers.push(() => {
        const s = sim();
        const w = s.resources.get('water');
        const recycler = s.lifeSupport.recyclerStuck ? 'ui.state.unpowered' : s.power.served.lifeSupport ? 'ui.state.ok' : 'ui.state.unpowered';
        panel.renderLines(t('ui.water.title'), [
          { text: `${w.value.toFixed(1)} L   ${t(`ui.status.${w.status}`)}`, color: statusColor(w.status), size: 1.2 },
          t('ui.water.recycler', { state: t(recycler) }),
        ]);
      });
    },

    hydro_food(g) {
      const panel = addPanel(g, 0.6, 0.32);
      refreshers.push(() => {
        const f = sim().resources.get('food');
        panel.renderLines(t('ui.food.title'), [
          { text: `${Math.round(f.value)} kcal   ${t(`ui.status.${f.status}`)}`, color: statusColor(f.status), size: 1.2 },
          t('ui.food.days', { days: (f.value / KCAL_PER_DAY).toFixed(1) }),
        ]);
      });
    },

    telecom_console(g, station) {
      addBox(g, 1.4, station.y - 0.55, 0.6, 0, -0.55 - (station.y - 0.55) / 2, 0.32, '#3a4048');
      const panel = addPanel(g, 0.8, 0.4, 0, 0.1);
      refreshers.push(() => {
        const s = sim();
        const powered = s.power.served.telecom;
        panel.renderLines(t('ui.telecom.title'), [
          { text: t('ui.telecom.power', { state: t(powered ? 'ui.state.ok' : 'ui.state.unpowered') }), color: powered ? COLORS.nominal : COLORS.critical },
          { text: t('ui.telecom.pending'), color: COLORS.dim },
        ]);
      });
    },

    airlock(g) {
      addBox(g, 1.1, 2.0, 0.12, 0, 0, 0.0, '#3c4147');
      const porthole = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshBasicMaterial({ color: '#c8653a' }));
      porthole.position.set(0, 0.45, 0.07);
      g.add(porthole);
      refreshers.push(() => {
        /** @type {THREE.MeshBasicMaterial} */ (porthole.material).color.set(sim().power.stormActive ? '#5a3a2a' : '#c8653a');
      });
    },

    training_board(g) {
      addBox(g, 1.6, 0.06, 0.6, 0, -0.62, 0.3, '#5a4a38'); // bench
      const panel = addPanel(g, 1.0, 0.55, 0, 0.12);
      panel.renderLines(t('ui.training.title'), [
        { text: t('ui.training.pending'), color: COLORS.dim },
        t('ui.training.start_here'),
      ]);
      const start = addButton(g, { width: 0.34, height: 0.1, label: '', onSelect: () => {
        const phase = sim().phase;
        if (phase === 'training') game.intent('game:start');
        else if (phase === 'over' || phase === 'won') game.restart();
      } }, 0, -0.3);
      refreshers.push(() => start.setState(...startButtonState(sim(), t)));
    },
  };

  for (const station of layout.stations) {
    const build = builders[station.id];
    if (!build) continue;
    const { position, rotationY } = stationTransform(station, rooms[station.room]);
    const g = new THREE.Group();
    g.name = `station_${station.id}`;
    g.position.copy(position);
    g.rotation.y = rotationY;
    build(g, station);
    scene.add(g);
  }

  return {
    /** Redraws panels from simulation state. */
    refresh() {
      for (const r of refreshers) r();
    },
    /** @param {number} dt */
    animate(dt) {
      for (const b of buttons) b.update(dt);
    },
  };
}

/**
 * @param {import('../systems/Simulation.js').Simulation} s @param {Function} t
 * @returns {[string, string]}
 */
function startButtonState(s, t) {
  if (s.phase === 'training') return [t('ui.button.start_shift'), BUTTON.on];
  if (s.phase === 'over' || s.phase === 'won') return [t('ui.button.restart'), BUTTON.danger];
  return [t('ui.button.in_progress'), BUTTON.off];
}

/** @param {import('../systems/Simulation.js').Simulation} s @param {Function} t */
function summaryLines(s, t) {
  const used = s.balance.inventory.filters - s.inventory.filters;
  const lines = ['oxygen', 'temperature', 'water', 'food'].map((id) => {
    const r = s.resources.get(id);
    return { text: `${t(`ui.resource.${id}`)}: ${r.value.toFixed(id === 'temperature' ? 1 : 0)} ${r.unit}`, color: statusColor(r.status), size: 0.85 };
  });
  lines.push({ text: t('summary.filters_used', { used, left: s.inventory.filters }), color: COLORS.dim, size: 0.85 });
  return lines;
}

/**
 * Biomonitor content (central bio panel and wrist device).
 * @param {Panel} panel @param {import('../systems/Simulation.js').Simulation} s @param {Function} t
 */
export function renderBio(panel, s, t) {
  const h = s.resources.get('health');
  const causes = Object.keys(s.crew.activeCauses).map((c) => t(`cause.${c}`));
  panel.renderLines(t('ui.bio.title'), [
    { text: t('ui.bio.health', { value: Math.round(h.value) }), color: statusColor(h.status), size: 1.5 },
    { text: t('ui.bio.causes', { list: causes.length ? causes.join(', ') : t('ui.bio.none') }), color: causes.length ? COLORS.critical : COLORS.dim },
  ], { border: statusColor(h.status) });
}
