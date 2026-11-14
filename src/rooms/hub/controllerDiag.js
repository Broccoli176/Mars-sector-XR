// OWNER: Persona A (Personal · Hidro · Hub) — see docs/COLLABORATION.md
//
// «Prueba de mandos»: read-only diagnostics of the WebXR controllers (what the browser receives),
// shown on a hub wall so problems can be diagnosed inside the headset. Never touches the simulation.
// Button/axis indices follow the WebXR 'xr-standard' gamepad mapping used by Quest Touch controllers:
// buttons 0 trigger, 1 squeeze, 3 thumbstick press, 4 A/X, 5 B/Y · axes 2/3 thumbstick (0/1 touchpad, unused).

export const PRESS_THRESHOLD = 0.5;

/**
 * Snapshot of one XRInputSource-like object.
 * @param {any} src
 */
export function describeInputSource(src) {
  const pad = src?.gamepad ?? null;
  const btn = (/** @type {number} */ i) => {
    const b = pad?.buttons?.[i];
    return b ? { value: Number(b.value) || 0, pressed: Boolean(b.pressed) || (Number(b.value) || 0) >= PRESS_THRESHOLD } : null;
  };
  const axis = (/** @type {number} */ i) => (pad?.axes && Number.isFinite(pad.axes[i]) ? pad.axes[i] : null);
  return {
    handedness: /** @type {string} */ (src?.handedness ?? 'none'),
    profile: /** @type {string} */ (src?.profiles?.[0] ?? '—'),
    rayMode: /** @type {string} */ (src?.targetRayMode ?? '—'),
    hasGamepad: Boolean(pad),
    mapping: /** @type {string} */ (pad?.mapping ?? ''),
    trigger: btn(0),
    squeeze: btn(1),
    stickPress: btn(3),
    a: btn(4),
    b: btn(5),
    stick: { x: axis(2), y: axis(3) },
    pad: { x: axis(0), y: axis(1) },
  };
}

/** "-0.73" style, or "—" when missing. @param {number | null} v */
export function formatAxis(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(2);
}

/** Counts select/squeeze events per handedness on an XR session (attach on sessionstart). */
export function createInputCounters() {
  /** @type {Record<string, { select: number, squeeze: number, last: string }>} */
  const byHand = {};
  let sourcesChanged = 0;
  const hand = (/** @type {string} */ h) => (byHand[h] ??= { select: 0, squeeze: 0, last: '' });
  /** @type {any} */
  let session = null;
  const onSelect = (/** @type {any} */ e) => {
    const c = hand(e.inputSource?.handedness ?? 'none');
    c.select++;
    c.last = 'select';
  };
  const onSqueeze = (/** @type {any} */ e) => {
    const c = hand(e.inputSource?.handedness ?? 'none');
    c.squeeze++;
    c.last = 'squeeze';
  };
  const onChange = () => {
    sourcesChanged++;
  };
  return {
    byHand,
    /** @param {string} h */
    get: (h) => hand(h),
    get sourcesChanged() {
      return sourcesChanged;
    },
    /** @param {any} s XRSession */
    attach(s) {
      this.detach();
      session = s;
      s.addEventListener('selectstart', onSelect);
      s.addEventListener('squeezestart', onSqueeze);
      s.addEventListener('inputsourceschange', onChange);
    },
    detach() {
      if (!session) return;
      session.removeEventListener('selectstart', onSelect);
      session.removeEventListener('squeezestart', onSqueeze);
      session.removeEventListener('inputsourceschange', onChange);
      session = null;
    },
    reset() {
      for (const k of Object.keys(byHand)) delete byHand[k];
      sourcesChanged = 0;
    },
  };
}

/**
 * Panel lines for one hand.
 * @param {ReturnType<typeof describeInputSource> | null} info null = not connected
 * @param {string} handLabelKey e.g. 'hub.ctrl.left'
 * @param {{ select: number, squeeze: number, last: string }} counts
 * @param {(key: string, params?: Record<string, any>) => string} t
 * @param {{ text: string, dim: string, nominal: string, warning: string, info: string }} colors
 */
export function handLines(info, handLabelKey, counts, t, colors) {
  if (!info) return [{ text: `${t(handLabelKey)} · ${t('hub.ctrl.missing')}`, color: colors.warning, size: 0.85 }];
  const mark = (/** @type {{ value: number, pressed: boolean } | null} */ b) => (b ? (b.pressed ? '●' : '○') : '×');
  const val = (/** @type {{ value: number, pressed: boolean } | null} */ b) => (b ? b.value.toFixed(2) : '—');
  const anyPressed = [info.trigger, info.squeeze, info.stickPress, info.a, info.b].some((b) => b?.pressed);
  const stickMoved = Math.abs(info.stick.x ?? 0) > 0.3 || Math.abs(info.stick.y ?? 0) > 0.3;
  const isLeft = info.handedness === 'left';
  return [
    { text: `${t(handLabelKey)} · ${info.profile} · ${info.rayMode}${info.hasGamepad ? '' : ' · ' + t('hub.ctrl.no_gamepad')}`, color: colors.info, size: 0.8 },
    {
      text: t('hub.ctrl.buttons', {
        trigger: `${mark(info.trigger)} ${val(info.trigger)}`,
        grip: `${mark(info.squeeze)} ${val(info.squeeze)}`,
        a: `${isLeft ? 'X' : 'A'} ${mark(info.a)}`,
        b: `${isLeft ? 'Y' : 'B'} ${mark(info.b)}`,
      }),
      color: anyPressed ? colors.nominal : colors.text,
      size: 0.8,
    },
    {
      text: t('hub.ctrl.stick', { x: formatAxis(info.stick.x), y: formatAxis(info.stick.y), press: mark(info.stickPress), px: formatAxis(info.pad.x), py: formatAxis(info.pad.y) }),
      color: stickMoved ? colors.nominal : colors.text,
      size: 0.8,
    },
    { text: t('hub.ctrl.events', { select: counts.select, squeeze: counts.squeeze, last: counts.last || '—' }), color: colors.dim, size: 0.75 },
  ];
}
