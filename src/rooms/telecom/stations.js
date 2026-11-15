// OWNER: teammate (Telecom · Control · Energy) — see docs/COLLABORATION.md
// Telecom: console under the panoramic window + communications distribution panel.
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

    const makeTurnButton = (direction, x, label) => {
      const button = new Button({
        width: 0.3,
        height: 0.1,
        label,
        color: BUTTON.action,
        onSelect: () => game.intent(direction < 0 ? 'antenna:turnLeft' : 'antenna:turnRight'),
      });
      const buttonHolder = new THREE.Group();
      buttonHolder.position.set(x, deskTop + 0.01, 0.45);
      buttonHolder.rotation.x = -Math.PI / 2;
      buttonHolder.add(button.mesh);
      g.add(buttonHolder);
      return kit.registerButton(button);
    };
    const turnLeft = makeTurnButton(-1, -0.46, t('ui.telecom.left'));
    const turnRight = makeTurnButton(1, 0.46, t('ui.telecom.right'));

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
        { text: `${t('ui.telecom.alignment', { pct: alignmentPct })}   ·   ${t('ui.telecom.azimuth', { deg: Math.round(s.telecom.angle) })}`, color: alignmentPct < 40 ? COLORS.critical : alignmentPct < 70 ? COLORS.warning : COLORS.nominal },
        { text: t('ui.telecom.motor', { state: t(motorBroken ? 'ui.state.broken' : 'ui.state.ok') }), color: motorBroken ? COLORS.critical : COLORS.dim, size: 0.85 },
      ]);
      const disabled = motorBroken || !powered;
      turnLeft.setState(t('ui.telecom.left'), disabled ? BUTTON.off : BUTTON.action);
      turnRight.setState(t('ui.telecom.right'), disabled ? BUTTON.off : BUTTON.action);
    });
  },

  comms_server_panel(g, _station, kit) {
    const { t, sim } = kit;
    kit.addBox(g, 1.25, 1.9, 0.16, 0, 0, 0, '#252d36');
    kit.addBox(g, 1.15, 1.8, 0.035, 0, 0, 0.09, '#171d25');

    const statusPanel = kit.addPanel(g, 0.9, 0.48, 0, 0.48);
    statusPanel.mesh.position.z = 0.115;
    kit.addBox(g, 0.08, 0.08, 0.025, -0.36, -0.12, 0.12, '#24404a');
    kit.addBox(g, 0.08, 0.08, 0.025, -0.12, -0.12, 0.12, '#24404a');
    kit.addBox(g, 0.08, 0.08, 0.025, 0.12, -0.12, 0.12, '#24404a');
    kit.addBox(g, 0.08, 0.08, 0.025, 0.36, -0.12, 0.12, '#24404a');

    const uplinkMaterial = new THREE.MeshBasicMaterial({ color: '#3ddc84', toneMapped: false });
    const uplinkLed = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.035), uplinkMaterial);
    uplinkLed.position.set(-0.43, 0.86, 0.12);
    const receiverMaterial = new THREE.MeshBasicMaterial({ color: '#3ddc84', toneMapped: false });
    const receiverLed = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.035), receiverMaterial);
    receiverLed.position.set(0.43, 0.86, 0.12);
    g.add(uplinkLed, receiverLed);

    kit.onRefresh(() => {
      const s = sim();
      const powered = s.power.served.telecom;
      const signal = s.resources.get('signal');
      const linkUp = powered && signal.value >= s.telecom.cfg.linkThreshold;
      const signalColor = !powered ? '#b83a2e' : linkUp ? '#3ddc84' : '#ffb020';
      uplinkMaterial.color.set(linkUp ? '#3ddc84' : '#b83a2e');
      receiverMaterial.color.set(signalColor);
      statusPanel.renderLines(t('ui.telecom.server_title'), [
        {
          text: t('ui.telecom.server_uplink', {
            state: t(linkUp ? 'ui.state.ok' : powered ? 'ui.telecom.no_link' : 'ui.state.unpowered'),
          }),
          color: linkUp ? COLORS.nominal : powered ? COLORS.warning : COLORS.critical,
        },
        {
          text: t('ui.telecom.server_signal', { value: Math.round(signal.value) }),
          color: statusColor(signal.status),
        },
        { text: t('ui.telecom.server_ports'), color: COLORS.dim, size: 0.8 },
      ]);
    });
  },
};
