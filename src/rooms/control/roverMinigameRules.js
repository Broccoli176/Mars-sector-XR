/** @typedef {'up' | 'down' | 'left' | 'right'} RoverTrainingDirection */
/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   energyPct: number,
 *   moves: number,
 *   sampleCollected: boolean,
 *   phase: 'ready' | 'active' | 'stranded' | 'won',
 *   notice: string
 * }} RoverTrainingState
 */

export const ROVER_TRAINING_GRID_SIZE = 5;
export const ROVER_TRAINING_BASE = Object.freeze({ x: 0, y: 4 });
export const ROVER_TRAINING_SAMPLE = Object.freeze({ x: 4, y: 0 });
export const ROVER_TRAINING_ROCKS = Object.freeze([
  Object.freeze({ x: 1, y: 3 }),
  Object.freeze({ x: 2, y: 2 }),
  Object.freeze({ x: 3, y: 1 }),
  Object.freeze({ x: 2, y: 4 }),
]);

const MOVE_ENERGY_COST = 5;
/** @type {Record<RoverTrainingDirection, { x: number, y: number }>} */
const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** @returns {RoverTrainingState} */
export function createRoverTrainingState() {
  return {
    x: ROVER_TRAINING_BASE.x,
    y: ROVER_TRAINING_BASE.y,
    energyPct: 100,
    moves: 0,
    sampleCollected: false,
    phase: 'ready',
    notice: 'rover.training.status.ready',
  };
}

/**
 * Moves only the local practice rover. This state is intentionally independent of the game simulation.
 * @param {RoverTrainingState} state
 * @param {RoverTrainingDirection} direction
 * @returns {RoverTrainingState}
 */
export function moveRoverTrainingRover(state, direction) {
  if (state.phase === 'won' || state.phase === 'stranded') return state;
  const delta = DIRECTIONS[direction];
  if (!delta) throw new RangeError(`Unknown training direction: ${direction}`);

  const x = state.x + delta.x;
  const y = state.y + delta.y;
  if (x < 0 || x >= ROVER_TRAINING_GRID_SIZE || y < 0 || y >= ROVER_TRAINING_GRID_SIZE) {
    return { ...state, notice: 'rover.training.status.edge' };
  }
  if (ROVER_TRAINING_ROCKS.some((rock) => rock.x === x && rock.y === y)) {
    return { ...state, notice: 'rover.training.status.blocked' };
  }

  /** @type {RoverTrainingState} */
  const next = {
    ...state,
    x,
    y,
    energyPct: Math.max(0, state.energyPct - MOVE_ENERGY_COST),
    moves: state.moves + 1,
    phase: 'active',
    notice: 'rover.training.status.driving',
  };
  if (next.energyPct === 0) {
    return { ...next, phase: 'stranded', notice: 'rover.training.status.stranded' };
  }
  if (!next.sampleCollected && x === ROVER_TRAINING_SAMPLE.x && y === ROVER_TRAINING_SAMPLE.y) {
    return { ...next, sampleCollected: true, notice: 'rover.training.status.sample' };
  }
  if (next.sampleCollected && x === ROVER_TRAINING_BASE.x && y === ROVER_TRAINING_BASE.y) {
    return { ...next, phase: 'won', notice: 'rover.training.status.won' };
  }
  return next;
}
