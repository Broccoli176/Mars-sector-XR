// SHARED (see docs/COLLABORATION.md): start menu shown before playing (DOM overlay, not an in-game HUD).
// Lets the player choose immersive VR (Quest browser or the Meta Immersive Web Emulator extension, with the
// built-in IWER emulator as a fallback) or the browser mode (mouse + keyboard). Presentation only.
import { vrStatus, EMULATOR_EXTENSION_URL } from './startMenuRules.js';

/** @typedef {ReturnType<typeof import('./startMenuRules.js').missionBriefing>} Briefing */

/** @typedef {'vr' | 'emulator' | 'browser'} StartChoice */

/**
 * @param {HTMLElement} root container (#start-menu)
 * @param {Function} t translator
 * @param {{ onChoose: (choice: StartChoice) => Promise<void> | void, briefing?: Briefing,
 *   language?: string, onLanguage?: (lang: string) => void, canChangeLanguage?: () => boolean }} handlers
 */
export function createStartMenu(root, t, { onChoose, briefing, language = 'es', onLanguage, canChangeLanguage = () => true }) {
  root.innerHTML = `
    <div class="sm-card">
      <div class="sm-lang" role="group">
        <span class="sm-lang-label"></span>
        <button type="button" class="sm-lang-btn" data-lang="es" lang="es">Español</button>
        <button type="button" class="sm-lang-btn" data-lang="en" lang="en">English</button>
        <span class="sm-lang-note" hidden></span>
      </div>
      <h1 class="sm-title"></h1>
      <section class="sm-mission" hidden>
        <h2 class="sm-mission-title"></h2>
        <ul class="sm-mission-facts"></ul>
        <h3 class="sm-timeline-title"></h3>
        <ol class="sm-timeline"></ol>
        <p class="sm-mission-start"></p>
      </section>
      <p class="sm-subtitle"></p>
      <div class="sm-options">
        <button type="button" class="sm-option sm-vr">
          <span class="sm-icon" aria-hidden="true">🥽</span>
          <span class="sm-name"></span>
          <span class="sm-desc"></span>
          <span class="sm-status"></span>
        </button>
        <button type="button" class="sm-option sm-browser">
          <span class="sm-icon" aria-hidden="true">🖱️</span>
          <span class="sm-name"></span>
          <span class="sm-desc"></span>
        </button>
      </div>
      <div class="sm-help" hidden>
        <p class="sm-help-text"></p>
        <div class="sm-help-actions">
          <a class="sm-link" target="_blank" rel="noopener noreferrer"></a>
          <button type="button" class="sm-emulator"></button>
        </div>
      </div>
      <p class="sm-error" hidden></p>
    </div>`;
  const $ = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (root.querySelector(sel));
  $('.sm-title').textContent = t('menu.title');
  // Language switch: each language is written in itself; the current one is highlighted.
  $('.sm-lang').setAttribute('aria-label', t('menu.lang.label'));
  $('.sm-lang-label').textContent = t('menu.lang.label');
  for (const btn of root.querySelectorAll('.sm-lang-btn')) {
    const b = /** @type {HTMLButtonElement} */ (btn);
    const current = b.dataset.lang === language;
    b.setAttribute('aria-pressed', String(current));
    b.addEventListener('click', () => {
      if (current) return;
      if (!canChangeLanguage()) {
        $('.sm-lang-note').textContent = t('menu.lang.locked');
        $('.sm-lang-note').hidden = false;
        return;
      }
      onLanguage?.(/** @type {string} */ (b.dataset.lang));
    });
  }
  $('.sm-subtitle').textContent = t('menu.subtitle');
  $('.sm-vr .sm-name').textContent = t('menu.vr.name');
  $('.sm-vr .sm-desc').textContent = t('menu.vr.desc');
  $('.sm-browser .sm-name').textContent = t('menu.browser.name');
  $('.sm-browser .sm-desc').textContent = t('menu.browser.desc');
  $('.sm-help-text').textContent = t('menu.vr.missing');
  const link = /** @type {HTMLAnchorElement} */ ($('.sm-link'));
  link.href = EMULATOR_EXTENSION_URL;
  link.textContent = t('menu.vr.install');
  $('.sm-emulator').textContent = t('menu.vr.emulator');

  // Mission briefing: the 7 days, how long they last, how you lose and the crises on the way (from game data).
  if (briefing) {
    $('.sm-mission').hidden = false;
    $('.sm-mission-title').textContent = t('menu.mission.title');
    const facts = [
      t('menu.mission.goal', { days: briefing.days }),
      t('menu.mission.time', { hour: String(briefing.startHour).padStart(2, '0'), minutes: briefing.minutesAt1x }),
      t('menu.mission.keep'),
      t('menu.mission.lose', { hours: briefing.powerLossHours }),
    ];
    for (const text of facts) {
      const li = document.createElement('li');
      li.textContent = text;
      $('.sm-mission-facts').appendChild(li);
    }
    $('.sm-timeline-title').textContent = t('menu.mission.timeline');
    for (const e of briefing.timeline) {
      const li = document.createElement('li');
      const day = document.createElement('span');
      day.className = 'sm-day';
      day.textContent = t('menu.mission.day', { day: e.day });
      const what = document.createElement('span');
      what.textContent = t(`menu.event.${e.type}`, { hours: e.durationHours ?? 0 });
      li.append(day, what);
      $('.sm-timeline').appendChild(li);
    }
    $('.sm-mission-start').textContent = t('menu.mission.start');
  }

  /** @type {'ready' | 'needsExtension'} */
  let status = 'needsExtension';
  const statusEl = $('.sm-vr .sm-status');
  const showStatus = () => {
    statusEl.textContent = t(status === 'ready' ? 'menu.vr.ready' : 'menu.vr.not_detected');
    statusEl.dataset.state = status;
  };

  /** Re-checks immersive-vr support (an extension may have been enabled meanwhile). */
  const refresh = async () => {
    const xr = /** @type {any} */ (navigator).xr;
    let supported = false;
    try {
      supported = Boolean(xr && (await xr.isSessionSupported('immersive-vr')));
    } catch {
      supported = false;
    }
    status = vrStatus({ hasXr: Boolean(xr), supported });
    showStatus();
    return status;
  };

  const error = $('.sm-error');
  /** @param {StartChoice} choice */
  const choose = async (choice) => {
    error.hidden = true;
    try {
      await onChoose(choice);
    } catch (e) {
      error.textContent = t('menu.error', { message: e instanceof Error ? e.message : String(e) });
      error.hidden = false;
    }
  };

  $('.sm-vr').addEventListener('click', () => {
    // Ask for the session inside this click: browsers require a user gesture for immersive VR.
    if (status === 'ready') {
      choose('vr');
      return;
    }
    $('.sm-help').hidden = false;
  });
  $('.sm-browser').addEventListener('click', () => choose('browser'));
  $('.sm-emulator').addEventListener('click', () => choose('emulator'));

  showStatus();
  refresh();

  return {
    show() {
      $('.sm-help').hidden = true;
      error.hidden = true;
      root.hidden = false;
      refresh();
    },
    hide() {
      root.hidden = true;
    },
    get isOpen() {
      return !root.hidden;
    },
    refresh,
  };
}
