import * as THREE from 'three';
import { stationTransform } from '../world/Basement.js';
import { createStationKit } from './StationKit.js';

export { renderBio } from './StationKit.js';

/**
 * SHARED registry (see docs/COLLABORATION.md). Each room owns `src/rooms/<room>/stations.js`
 * exporting `builders = { stationId(g, station, kit) {...} }`. Rooms are discovered automatically,
 * so adding a room or a station never requires editing this file.
 */
const roomModules = import.meta.glob('../rooms/*/stations.js', { eager: true });

/** All station builders by id, merged from every room (throws on duplicates). */
export const stationBuilders = mergeBuilders(roomModules);

/** @param {Record<string, any>} modules */
function mergeBuilders(modules) {
  /** @type {Record<string, Function>} */
  const all = {};
  /** @type {Record<string, string>} */
  const origin = {};
  for (const [path, mod] of Object.entries(modules)) {
    for (const [id, fn] of Object.entries(mod.builders ?? {})) {
      if (all[id]) throw new Error(`Station "${id}" is defined twice: ${origin[id]} and ${path}`);
      all[id] = /** @type {Function} */ (fn);
      origin[id] = path;
    }
  }
  return all;
}

/**
 * Builds every diegetic station from layout.stations and keeps them in sync with the simulation.
 * Stations only read simulation state and emit intents through `game.intent()`.
 * @param {{ layout: any, rooms: Record<string, any>, game: import('../core/Game.js').Game, t: Function, scene: THREE.Object3D, interactive: THREE.Object3D[], services?: Record<string, any> }} ctx
 */
export function buildStations({ layout, rooms, game, t, scene, interactive, services = {} }) {
  const kit = createStationKit({ game, t, interactive, services });

  for (const station of layout.stations) {
    const build = stationBuilders[station.id];
    if (!build) {
      console.warn(`No builder for station "${station.id}" (add it to src/rooms/<room>/stations.js)`);
      continue;
    }
    const { position, rotationY } = stationTransform(station, rooms[station.room]);
    const g = new THREE.Group();
    g.name = `station_${station.id}`;
    g.position.copy(position);
    g.rotation.y = rotationY;
    build(g, station, kit);
    scene.add(g);
  }

  return {
    /** Furniture meshes (world transforms valid after the scene's first matrix update). */
    solids: kit.solids,
    /** Redraws panels from simulation state. */
    refresh() {
      kit._refreshAll();
    },
    /** @param {number} dt */
    animate(dt) {
      kit._animate(dt);
    },
  };
}
