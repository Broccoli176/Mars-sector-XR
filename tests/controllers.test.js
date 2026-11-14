// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
import { describe, it, expect } from 'vitest';
import { describeInputSource, formatAxis, createInputCounters, handLines } from '../src/rooms/hub/controllerDiag.js';
import { gameData } from '../src/data/index.js';
import { createTranslator } from '../src/utils/strings.js';
import { COLORS } from '../src/ui/Panel.js';

const b = (value = 0, pressed = false) => ({ value, pressed, touched: false });
/** Fake Quest Touch source (xr-standard mapping). */
const quest = (handedness = 'right', over = {}) => ({
  handedness,
  targetRayMode: 'tracked-pointer',
  profiles: ['meta-quest-touch-plus', 'oculus-touch-v3', 'generic-trigger-squeeze-thumbstick'],
  gamepad: { mapping: 'xr-standard', buttons: [b(0.9, true), b(0.1), b(), b(), b(1, true), b()], axes: [0, 0, -0.8, 0.1], ...over },
});

describe('controller diagnostics («Prueba de mandos»)', () => {
  it('reads trigger, grip, A/B and thumbstick from the xr-standard mapping', () => {
    const d = describeInputSource(quest());
    expect(d.profile).toBe('meta-quest-touch-plus');
    expect(d.trigger).toEqual({ value: 0.9, pressed: true });
    expect(d.squeeze?.pressed).toBe(false);
    expect(d.a?.pressed).toBe(true);
    expect(d.stick).toEqual({ x: -0.8, y: 0.1 });
  });

  it('copes with a source without gamepad or with short axes', () => {
    const noPad = describeInputSource({ handedness: 'left', targetRayMode: 'tracked-pointer', profiles: [] });
    expect(noPad.hasGamepad).toBe(false);
    expect(noPad.trigger).toBeNull();
    const short = describeInputSource(quest('left', { axes: [0.5, 0] }));
    expect(short.stick).toEqual({ x: null, y: null });
    expect(short.pad.x).toBe(0.5);
    expect(formatAxis(null)).toBe('—');
    expect(formatAxis(0.256)).toBe('+0.26');
  });

  it('counts select/squeeze per hand from session events', () => {
    const listeners = /** @type {Record<string, Function>} */ ({});
    const session = { addEventListener: (/** @type {string} */ n, /** @type {Function} */ f) => { listeners[n] = f; }, removeEventListener: () => {} };
    const c = createInputCounters();
    c.attach(session);
    listeners.selectstart({ inputSource: { handedness: 'right' } });
    listeners.selectstart({ inputSource: { handedness: 'right' } });
    listeners.squeezestart({ inputSource: { handedness: 'left' } });
    listeners.inputsourceschange({});
    expect(c.get('right')).toEqual({ select: 2, squeeze: 0, last: 'select' });
    expect(c.get('left').squeeze).toBe(1);
    expect(c.sourcesChanged).toBe(1);
    c.reset();
    expect(c.get('right').select).toBe(0);
  });

  it('renders Spanish lines with every string defined', () => {
    const t = createTranslator(gameData.strings);
    const lines = handLines(describeInputSource(quest('left')), 'hub.ctrl.left', { select: 1, squeeze: 0, last: 'select' }, t, COLORS);
    expect(lines).toHaveLength(4);
    expect(lines[1].text).toContain('X ●'); // left hand shows X/Y
    expect(lines[1].color).toBe(COLORS.nominal); // something is pressed
    for (const l of lines) expect(l.text).not.toMatch(/hub\.ctrl|\{/);
    expect(handLines(null, 'hub.ctrl.right', { select: 0, squeeze: 0, last: '' }, t, COLORS)[0].color).toBe(COLORS.warning);
  });
});
