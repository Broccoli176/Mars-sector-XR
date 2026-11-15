import { BUTTON, COLORS } from '../../ui/StationKit.js';
import {
  createRoverTrainingState,
  moveRoverTrainingRover,
  ROVER_TRAINING_BASE,
  ROVER_TRAINING_GRID_SIZE,
  ROVER_TRAINING_ROCKS,
  ROVER_TRAINING_SAMPLE,
} from './roverMinigameRules.js';

/**
 * Adds a standalone rover-driving practice minigame; it does not read or control the simulated rover.
 * @param {import('three').Group} g
 * @param {import('../../ui/StationKit.js').StationKit} kit
 */
export function buildRoverMinigame(g, kit) {
  const { t } = kit;
  const panel = kit.addPanel(g, 1.8, 1, 0, 0.35);
  panel.mesh.position.z = 0.01;
  let state = createRoverTrainingState();

  /** @type {['up' | 'down' | 'left' | 'right', string, number, number][]} */
  const moves = [
    ['up', 'rover.training.button.up', 0, -0.48],
    ['left', 'rover.training.button.left', -0.32, -0.72],
    ['down', 'rover.training.button.down', 0, -0.72],
    ['right', 'rover.training.button.right', 0.32, -0.72],
  ];
  const buttons = moves.map(([direction, key, x, y]) => ({
    direction,
    button: kit.addButton(g, {
      width: 0.24,
      height: 0.14,
      label: t(key),
      color: BUTTON.action,
      onSelect: () => { state = moveRoverTrainingRover(state, direction); },
    }, x, y),
  }));
  const reset = kit.addButton(g, {
    width: 0.68,
    height: 0.13,
    label: t('rover.training.button.reset'),
    color: BUTTON.warn,
    onSelect: () => { state = createRoverTrainingState(); },
  }, 0, -0.98);

  kit.onRefresh(() => {
    const key = `${state.x}|${state.y}|${state.energyPct}|${state.moves}|${state.sampleCollected}|${state.phase}|${state.notice}`;
    panel.renderCustom(key, (ctx, width, height) => drawPanel(ctx, width, height, state, t));
    const locked = state.phase === 'won' || state.phase === 'stranded';
    for (const { direction, button } of buttons) {
      button.setState(t(`rover.training.button.${direction}`), locked ? BUTTON.off : BUTTON.action);
    }
    reset.setState(t('rover.training.button.reset'), BUTTON.warn);
  });
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {import('./roverMinigameRules.js').RoverTrainingState} state
 * @param {Function} t
 */
function drawPanel(ctx, width, height, state, t) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 5;
  ctx.strokeRect(2.5, 2.5, width - 5, height - 5);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  ctx.fillStyle = COLORS.title;
  ctx.font = `bold ${Math.round(height * 0.07)}px system-ui, sans-serif`;
  ctx.fillText(t('rover.training.title'), width * 0.035, height * 0.09, width * 0.93);
  ctx.fillStyle = COLORS.warning;
  ctx.font = `bold ${Math.round(height * 0.045)}px system-ui, sans-serif`;
  ctx.fillText(t('rover.training.disconnected'), width * 0.035, height * 0.18, width * 0.93);

  const cell = Math.floor(Math.min(height * 0.52, width * 0.34) / ROVER_TRAINING_GRID_SIZE);
  const gridX = width * 0.035;
  const gridY = height * 0.25;
  ctx.textAlign = 'center';
  for (let y = 0; y < ROVER_TRAINING_GRID_SIZE; y++) {
    for (let x = 0; x < ROVER_TRAINING_GRID_SIZE; x++) {
      const isRover = x === state.x && y === state.y;
      const isBase = x === ROVER_TRAINING_BASE.x && y === ROVER_TRAINING_BASE.y;
      const isSample = !state.sampleCollected && x === ROVER_TRAINING_SAMPLE.x && y === ROVER_TRAINING_SAMPLE.y;
      const isRock = ROVER_TRAINING_ROCKS.some((rock) => rock.x === x && rock.y === y);
      const left = gridX + x * cell;
      const top = gridY + y * cell;
      ctx.fillStyle = isRover ? '#225a7e' : isBase ? '#244b36' : isSample ? '#55451e' : isRock ? '#51433a' : '#202a33';
      ctx.fillRect(left, top, cell - 3, cell - 3);
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 2;
      ctx.strokeRect(left, top, cell - 3, cell - 3);
      const symbol = isRover ? 'R' : isBase ? 'B' : isSample ? 'M' : isRock ? 'X' : '';
      if (symbol) {
        ctx.fillStyle = isRover ? '#ffffff' : isBase ? COLORS.nominal : isSample ? COLORS.title : COLORS.dim;
        ctx.font = `bold ${Math.round(cell * 0.48)}px system-ui, sans-serif`;
        ctx.fillText(symbol, left + cell / 2, top + cell / 2, cell - 4);
      }
    }
  }

  const infoX = gridX + cell * ROVER_TRAINING_GRID_SIZE + width * 0.04;
  const maxWidth = width - infoX - width * 0.035;
  ctx.textAlign = 'left';
  ctx.font = `bold ${Math.round(height * 0.05)}px system-ui, sans-serif`;
  ctx.fillStyle = COLORS.text;
  ctx.fillText(t('rover.training.link'), infoX, height * 0.31, maxWidth);
  ctx.fillText(t('rover.training.energy', { pct: state.energyPct }), infoX, height * 0.43, maxWidth);

  const barX = infoX;
  const barY = height * 0.49;
  const barWidth = maxWidth;
  ctx.fillStyle = COLORS.border;
  ctx.fillRect(barX, barY, barWidth, height * 0.035);
  ctx.fillStyle = state.energyPct <= 25 ? COLORS.critical : COLORS.nominal;
  ctx.fillRect(barX, barY, barWidth * (state.energyPct / 100), height * 0.035);

  ctx.font = `${Math.round(height * 0.045)}px system-ui, sans-serif`;
  ctx.fillStyle = COLORS.info;
  ctx.fillText(t('rover.training.goal'), infoX, height * 0.62, maxWidth);
  ctx.fillStyle = state.phase === 'won' ? COLORS.nominal : state.phase === 'stranded' ? COLORS.critical : COLORS.text;
  ctx.fillText(t(state.notice), infoX, height * 0.78, maxWidth);

  ctx.fillStyle = COLORS.dim;
  ctx.font = `${Math.round(height * 0.04)}px system-ui, sans-serif`;
  ctx.fillText(t('rover.training.legend'), gridX, height * 0.91, width - gridX * 2);
}
