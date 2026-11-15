import { describe, expect, it } from 'vitest';
import { createRoverTrainingState, moveRoverTrainingRover } from '../src/rooms/control/roverMinigameRules.js';

describe('disconnected rover practice minigame', () => {
  it('blocks rocks and the edge without spending practice energy', () => {
    let state = createRoverTrainingState();
    state = moveRoverTrainingRover(state, 'right');
    const beforeBlockedMove = state;
    state = moveRoverTrainingRover(state, 'up');
    expect(state).toMatchObject({ x: 1, y: 4, energyPct: 95, moves: 1, notice: 'rover.training.status.blocked' });
    expect(state).not.toBe(beforeBlockedMove);

    state = createRoverTrainingState();
    const atEdge = moveRoverTrainingRover(state, 'down');
    expect(atEdge).toMatchObject({ x: 0, y: 4, energyPct: 100, moves: 0, notice: 'rover.training.status.edge' });
  });

  it('completes the local objective by reaching the sample and returning to base', () => {
    let state = createRoverTrainingState();
    for (const direction of ['up', 'up', 'right', 'up', 'right', 'up', 'right', 'right', 'left', 'left', 'down', 'left', 'down', 'left', 'down', 'down']) {
      state = moveRoverTrainingRover(state, direction);
    }
    expect(state).toMatchObject({ x: 0, y: 4, energyPct: 20, moves: 16, sampleCollected: true, phase: 'won' });
    expect(moveRoverTrainingRover(state, 'up')).toBe(state);
  });

  it('strands the practice rover when its local energy runs out', () => {
    let state = createRoverTrainingState();
    for (let i = 0; i < 20; i++) state = moveRoverTrainingRover(state, i % 2 === 0 ? 'right' : 'left');
    expect(state).toMatchObject({ energyPct: 0, phase: 'stranded', notice: 'rover.training.status.stranded' });
  });
});
