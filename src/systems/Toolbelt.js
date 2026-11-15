// @ts-check
/**
 * Which hand tools the player is carrying (in a hand or in a belt holster). Headless.
 *
 * Built only from the presentation intents of the tool wall (`src/rooms/hub/tools.js`):
 * - `item:grab { itemId }`: the tool is in a hand → carried.
 * - `item:socket { itemId, slot }`: in a holster (`SKT_Holster_L|R`) → carried; back on the wall (`toolwall`) → not.
 * - `item:release { itemId }`: dropped on the floor → not carried.
 *
 * Repairs of components that can really break in this build (`components[].inGame` in balance/hub.json)
 * need their tool (`components[].toolId`). With only two holsters and four tools, the player chooses
 * what to carry: a small, real trade-off.
 */
export class Toolbelt {
  /**
   * @param {{ id: string, toolId: string, inGame?: boolean }[]} components balance.components
   * @param {import('mitt').Emitter<any>} bus
   */
  constructor(components, bus) {
    /** @type {Record<string, string>} componentId → toolId, only for components that can break in this build */
    this.required = Object.fromEntries((components ?? []).filter((c) => c.inGame).map((c) => [c.id, c.toolId]));
    /** @type {Set<string>} */
    this.carried = new Set();
    bus.on('item:grab', (/** @type {any} */ e) => {
      if (e?.itemId) this.carried.add(e.itemId);
    });
    bus.on('item:socket', (/** @type {any} */ e) => {
      if (!e?.itemId) return;
      if (e.slot === 'toolwall') this.carried.delete(e.itemId);
      else this.carried.add(e.itemId);
    });
    bus.on('item:release', (/** @type {any} */ e) => {
      if (e?.itemId) this.carried.delete(e.itemId);
    });
  }

  /** @param {string} toolId */
  has(toolId) {
    return this.carried.has(toolId);
  }

  /** Tool a component's repair needs, or null when it needs none. @param {string} componentId */
  toolFor(componentId) {
    return this.required[componentId] ?? null;
  }

  /** True when the repair of `componentId` can be done with what the player carries. @param {string} componentId */
  canRepair(componentId) {
    const tool = this.toolFor(componentId);
    return tool === null || this.has(tool);
  }
}
