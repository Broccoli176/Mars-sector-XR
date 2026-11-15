// OWNER: teammate (Telecom · Control · Energy) — see docs/COLLABORATION.md
// Energía y oxígeno: breaker wall + relay, life-support gauges, scrubber, O₂ tanks, thermostat.
// Placement: src/data/stations/energy.json
import { COLORS, BUTTON, statusColor } from '../../ui/StationKit.js';

const CIRCUITS = ['lifeSupport', 'heating', 'lighting', 'telecom', 'hydro', 'repairBay'];

/** @type {Record<string, (g: import('three').Group, station: any, kit: import('../../ui/StationKit.js').StationKit) => void>} */
export const builders = {
  /** Label under the solar-field window (src/world/SolarField.js): live solar generation. */
  energy_solar_view(g, _station, kit) {
    const { t, sim } = kit;
    const panel = kit.addPanel(g, 1.0, 0.26);
    kit.onRefresh(() => {
      const s = sim();
      const clock = s.time.clock();
      const solar = Math.max(0, s.power.generation(clock) - s.power.cfg.rtgKw);
      const cfg = s.power.cfg;
      const day = clock.hourFloat >= cfg.solarStartHour && clock.hourFloat < cfg.solarEndHour;
      const state = !day ? 'solar.night' : s.power.stormActive ? 'solar.storm' : 'solar.sun';
      panel.renderLines(t('solar.title'), [
        { text: t('solar.now', { kw: solar.toFixed(2), max: cfg.solarKw.toFixed(1) }), color: !day ? COLORS.dim : s.power.stormActive ? COLORS.warning : COLORS.nominal, size: 0.95 },
        { text: t(state, { factor: cfg.stormSolarFactor }), size: 0.8 },
        { text: t('solar.rover', { state: t(s.rover?.docked ? 'solar.rover.docked' : 'solar.rover.away') }), color: COLORS.dim, size: 0.75 },
      ]);
    });
  },

  breakers(g, _station, kit) {
    const { t, game, sim } = kit;
    const panel = kit.addPanel(g, 1.7, 0.42, 0, 0.12);
    const spacing = 0.26;
    const btns = CIRCUITS.map((id, i) =>
      kit.addButton(g, { width: 0.16, height: 0.1, label: '', onSelect: () => {
        game.intent('breaker:toggle', { circuitId: id, on: !sim().power.breakers[id] });
      } }, (i - 2.5) * spacing, -0.2));
    const reset = kit.addButton(g, { width: 0.42, height: 0.1, label: t('ui.breakers.reset'), color: BUTTON.danger,
      onSelect: () => game.intent('relay:resetRequest') }, 0, -0.38);
    kit.onRefresh(() => {
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

  ls_gauges(g, _station, kit) {
    const { t, sim } = kit;
    const panel = kit.addPanel(g, 0.95, 0.72);
    kit.onRefresh(() => {
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

  ls_scrubber(g, station, kit) {
    const { t, game, sim } = kit;
    kit.addBox(g, 0.8, station.y - 0.4, 0.5, 0, -0.4 - (station.y - 0.4) / 2 + 0.02, 0.28, '#4d6670');
    const panel = kit.addPanel(g, 0.62, 0.34, 0, 0.12);
    const swap = kit.addButton(g, { width: 0.3, height: 0.09, label: t('ui.ls.swap_filter'), color: BUTTON.action,
      onSelect: () => game.intent('filter:swap') }, 0, -0.16);
    kit.onRefresh(() => {
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

  ls_o2tanks(g, station, kit) {
    const { t, game, sim } = kit;
    kit.addCylinder(g, 0.22, 1.5, -0.55, 0.75 - station.y, 0.3, '#5f87a8');
    kit.addCylinder(g, 0.22, 1.5, 0.55, 0.75 - station.y, 0.3, '#5f87a8');
    kit.addBox(g, 0.9, 1.0, 0.5, 1.4, 0.5 - station.y, 0.3, '#6b7a86'); // electrolyzer
    const panel = kit.addPanel(g, 0.62, 0.22, 0, 0.12);
    const ids = ['valve_o2_tank_1', 'valve_o2_tank_2'];
    const btns = ids.map((valveId, i) =>
      kit.addButton(g, { width: 0.22, height: 0.09, label: '', onSelect: () => game.intent('valve:turn', { valveId, open: true }) }, i === 0 ? -0.15 : 0.15, -0.08));
    kit.onRefresh(() => {
      const ls = sim().lifeSupport;
      panel.renderLines(t('ui.o2tanks.title'), []);
      btns.forEach((b, i) => {
        const used = ls.o2TanksUsed[ids[i]];
        b.setState(`${t('ui.o2tanks.tank', { n: i + 1 })}: ${t(used ? 'ui.o2tanks.used' : 'ui.o2tanks.full')}`, used ? BUTTON.off : BUTTON.action);
      });
    });
  },

  ls_thermostat(g, _station, kit) {
    const { t, game, sim } = kit;
    const panel = kit.addPanel(g, 0.5, 0.3, 0, 0.1);
    kit.addButton(g, { width: 0.1, height: 0.08, label: '−', color: BUTTON.action,
      onSelect: () => game.intent('thermostat:set', { setpointC: sim().lifeSupport.setpointC - 1 }) }, -0.12, -0.12);
    kit.addButton(g, { width: 0.1, height: 0.08, label: '+', color: BUTTON.action,
      onSelect: () => game.intent('thermostat:set', { setpointC: sim().lifeSupport.setpointC + 1 }) }, 0.12, -0.12);
    kit.onRefresh(() => {
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
};
