// Bundled game data (browser + Vitest). Node scripts load the JSON files directly (scripts/loadData.js).
import resources from './resources.json';
import balance from './balance.json';
import events from './events.json';
import layout from './layout.json';
import strings from './strings.es.json';

export const gameData = { resources, balance, events, layout, strings };
