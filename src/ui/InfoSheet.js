// SHARED (see docs/COLLABORATION.md): «Info» button + expandable text sheet for a station.
// Pictogram panels stay simple for young players; the sheet holds the rigorous explanation and sources.
// Presentation-only: opening a sheet never touches the simulation.
import { Panel, COLORS } from './Panel.js';
import { BUTTON } from './StationKit.js';

/** @typedef {{ text: string, color?: string, size?: number }} Line */

/**
 * «Info» button that opens/closes a text sheet over the station (the rigorous version of the pictograms).
 * @param {THREE.Object3D} g @param {import('../../ui/StationKit.js').StationKit} kit
 * @param {{ bx: number, by: number, px: number, py: number, w: number, h: number, title: () => string, lines: () => Line[] }} o
 */
export function addInfo(g, kit, { bx, by, px, py, w, h, title, lines }) {
  const { t } = kit;
  const sheet = new Panel(w, h);
  sheet.mesh.position.set(px, py, 0.07);
  sheet.mesh.visible = false;
  g.add(sheet.mesh);
  let open = false;
  const sync = () => {
    sheet.mesh.visible = open;
    button.setState(t(open ? 'ui.btn.close' : 'ui.btn.info'), open ? BUTTON.warn : BUTTON.info);
    if (open) sheet.renderLines(title(), lines(), { border: COLORS.info });
  };
  const button = kit.addButton(g, { width: 0.17, height: 0.07, label: t('ui.btn.info'), color: BUTTON.info, onSelect: () => {
    open = !open;
    sync();
  } }, bx, by);
  kit.onRefresh(sync);
  return button;
}
