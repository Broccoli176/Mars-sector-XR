import mitt from 'mitt';

/**
 * Creates the event bus shared by simulation and presentation.
 * Event names and payloads are the public contract in AGENTS.md §4.2.
 * @returns {import('mitt').Emitter<Record<string, any>>}
 */
export function createBus() {
  return mitt();
}
