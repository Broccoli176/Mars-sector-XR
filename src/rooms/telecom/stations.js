// OWNER: teammate (Telecom · Control · Energy) — see docs/COLLABORATION.md
// Telecom / Esclusa: console under the panoramic window + airlock hatch.
// Placement: src/data/stations/telecom.json. The window and Mars diorama: src/world/Porthole.js
import * as THREE from 'three';
import { COLORS, BUTTON, statusColor } from '../../ui/StationKit.js';
import { Button } from '../../objects/Button.js';

/** @type {Record<string, (g: THREE.Group, station: any, kit: import('../../ui/StationKit.js').StationKit) => void>} */
export const builders = {
  telecom_console(g, station, kit) {
    const { t, game, sim } = kit;
    // Operator desk under the panoramic window (window bottom ≈ 1.08 m). Desk top at 0.74 m.
    const deskTop = 0.74 - station.y;
    kit.addBox(g, 1.6, 0.7, 0.6, 0, deskTop - 0.37, 0.33, '#3a4048');
    kit.addBox(g, 1.64, 0.04, 0.64, 0, deskTop - 0.01, 0.33, '#2a2f35');

    // Status panel on the wall between the desk and the window sill.
    const panel = kit.addPanel(g, 0.95, 0.3, 0, deskTop + 0.17);

    // Push button lying on the desk top, facing up (pressed from above).
    const align = new Button({
      width: 0.36,
      height: 0.1,
      label: t('ui.telecom.align'),
      color: BUTTON.info,
      onSelect: () => game.intent('antenna:align'),
    });
    const holder = new THREE.Group();
    holder.position.set(0, deskTop + 0.01, 0.45);
    holder.rotation.x = -Math.PI / 2;
    holder.add(align.mesh);
    g.add(holder);
    kit.registerButton(align);

    // Antenna motor unit + cable mast beside the window.
    kit.addBox(g, 0.28, 0.28, 0.18, -1.05, 0.05, 0.1, '#4f5b66');
    kit.addBox(g, 0.04, 0.8, 0.04, -1.05, 0.5, 0.08, '#85909c');

    kit.onRefresh(() => {
      const s = sim();
      const powered = s.power.served.telecom;
      const sig = s.resources.get('signal');
      const alignmentPct = Math.round(s.telecom.alignment * 100);
      const motorBroken = s.telecom.motorBroken;
      panel.renderLines(t('ui.telecom.title'), [
        { text: `${t('ui.telecom.power', { state: t(powered ? 'ui.state.ok' : 'ui.state.unpowered') })}   ·   ${t('ui.telecom.signal', { val: Math.round(sig.value), status: t(`ui.status.${sig.status}`) })}`, color: powered ? statusColor(sig.status) : COLORS.critical },
        { text: t('ui.telecom.alignment', { pct: alignmentPct }), color: alignmentPct < 40 ? COLORS.critical : alignmentPct < 70 ? COLORS.warning : COLORS.nominal },
        { text: t('ui.telecom.motor', { state: t(motorBroken ? 'ui.state.broken' : 'ui.state.ok') }), color: motorBroken ? COLORS.critical : COLORS.dim, size: 0.85 },
      ]);
      align.setState(t('ui.telecom.align'), motorBroken || !powered ? BUTTON.off : alignmentPct < 70 ? BUTTON.warn : BUTTON.info);
    });
  },

  airlock(g, _station, kit) {
    // Pressure hatch (the panoramic window above the console is the view outside).
    kit.addBox(g, 1.25, 2.2, 0.06, 0, 0, -0.03, '#2a2e33'); // frame
    kit.addBox(g, 1.15, 2.1, 0.12, 0, 0, 0.0, '#59616a'); // hatch
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), kit.lambert('#555b62'));
    hub.rotation.x = Math.PI / 2;
    hub.position.set(0, 0.05, 0.08);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 8, 20), kit.lambert('#d4883b'));
    wheel.position.set(0, 0.05, 0.1);
    g.add(hub, wheel);

    // Status LED: green normal, amber during the dust storm.
    const ledMaterial = new THREE.MeshBasicMaterial({ color: '#3ddc84', toneMapped: false });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.04), ledMaterial);
    led.position.set(0, 0.95, 0.08);
    g.add(led);
    kit.onRefresh(() => {
      ledMaterial.color.set(kit.sim().power.stormActive ? '#ffb020' : '#3ddc84');
    });
  },
};
