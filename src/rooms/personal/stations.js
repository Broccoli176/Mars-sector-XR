// OWNER: user (Personal · Hydro · Hub) — see docs/COLLABORATION.md
// Personal (crew quarters): EMPTY for now.
//
// To add something:
//   1. Add an entry to src/data/stations/personal.json, e.g.
//      { "id": "personal_bunk", "room": "room_personal", "wall": "west", "along": 0, "y": 1.2 }
//   2. Add a builder with the same id below:
//      personal_bunk(g, station, kit) { kit.addBox(g, 2.0, 0.5, 0.9, 0, 0.25 - station.y, 0.5, '#6a5f58'); }
//   3. Texts go in src/data/strings/es/personal.json (keys like "ui.personal.*").
//   See src/rooms/hub/stations.js for a small complete example (panel + button + refresh).

/** @type {Record<string, (g: import('three').Group, station: any, kit: import('../../ui/StationKit.js').StationKit) => void>} */
export const builders = {};
