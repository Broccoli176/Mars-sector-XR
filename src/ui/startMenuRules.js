// @ts-check
// Pure rules of the start menu (tested in tests/startMenu.test.js). No DOM, no Three.js.

/**
 * What the «Realidad virtual» card can do in this browser.
 * - 'ready': a headset browser (Quest) or the Meta Immersive Web Emulator extension offers immersive-vr.
 * - 'needsExtension': no immersive VR here; offer the extension link and the built-in emulator (IWER).
 * @param {{ hasXr: boolean, supported: boolean }} o
 * @returns {'ready' | 'needsExtension'}
 */
export function vrStatus({ hasXr, supported }) {
  return hasXr && supported ? 'ready' : 'needsExtension';
}

/**
 * Whether the menu shows at start, from the dev URL params.
 * `?mode=browser` / `?mode=vr` pick a mode directly; `?view=…` (dev screenshots) means browser.
 * `?iwer` keeps today's behaviour: the emulated Quest is installed and the menu shows with VR ready.
 * @param {URLSearchParams} params
 * @returns {'menu' | 'browser' | 'vr'}
 */
export function startMode(params) {
  const mode = params.get('mode');
  if (mode === 'browser' || mode === 'vr') return mode;
  if (params.has('view')) return 'browser';
  return 'menu';
}

/** Session options used for immersive VR (same features three.js' VRButton requests). */
export const VR_SESSION_INIT = { optionalFeatures: ['local-floor', 'bounded-floor', 'layers'] };

/** Chrome Web Store page of the Meta Immersive Web Emulator extension. */
export const EMULATOR_EXTENSION_URL = 'https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik';

/** Scripted events worth announcing in the mission briefing (type → string key `menu.event.<type>`). */
const BRIEFED_EVENTS = ['relayTrip', 'storm', 'sep', 'failure', 'leak'];

/**
 * Essential mission data for the start menu, read from the game data (never hand-copied numbers).
 * @param {any} balance merged balance (time, power, gameRules, electronics)
 * @param {any[]} events events.json
 * @returns {{ days: number, startHour: number, minutesAt1x: number, powerLossHours: number,
 *   timeline: { day: number, type: string, durationHours?: number }[] }}
 */
export function missionBriefing(balance, events) {
  const time = balance.time;
  /** @type {{ day: number, type: string, durationHours?: number }[]} */
  const timeline = events
    .filter((e) => BRIEFED_EVENTS.includes(e.type))
    .map((e) => ({ day: e.day, type: e.type === 'failure' ? `fault_${e.componentId}` : e.type, ...(e.durationHours ? { durationHours: e.durationHours } : {}) }));
  for (const f of balance.electronics?.faults?.scheduled ?? []) timeline.push({ day: f.day, type: 'receiverFault' });
  timeline.sort((a, b) => a.day - b.day);
  return {
    days: time.totalDays,
    startHour: time.dayStartHour,
    minutesAt1x: Math.round((time.totalDays * time.secondsPerDay) / 60),
    powerLossHours: balance.gameRules.powerLossHours,
    timeline,
  };
}
