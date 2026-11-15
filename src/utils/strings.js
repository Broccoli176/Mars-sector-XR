/** Languages the player can choose in the start menu (tables in src/data/strings/<lang>/). */
export const LANGUAGES = /** @type {const} */ (['es', 'en']);

/** Decimal separator of the current language ('es' → comma, 'en' → point). Set once at start (main.js). */
let decimalSeparator = ',';

/** @param {string} lang */
export function setNumberLanguage(lang) {
  decimalSeparator = lang === 'en' ? '.' : ',';
}

/**
 * Builds a translator over a flat string table (`<domain>.<context>.<id>` keys, `{param}` interpolation).
 * Missing keys return the key itself so gaps are visible in-game.
 * @param {Record<string, string>} table
 */
export function createTranslator(table) {
  /**
   * @param {string} key
   * @param {Record<string, string | number>} [params]
   */
  return function t(key, params) {
    const template = table[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (_, name) => (name in params ? localizeNumber(params[name]) : `{${name}}`));
  };
}

/**
 * Number with the current language's decimal separator (comma in Spanish, point in English).
 * @param {number} value @param {number} [digits]
 */
export const fmt = (value, digits = 1) => Number(value).toFixed(digits).replace('.', decimalSeparator);

/**
 * Parameters that are plain decimals («2.5», 0.28) use the current decimal separator, so every panel agrees.
 * @param {string | number} value
 */
function localizeNumber(value) {
  const text = String(value);
  return /^[-+]?\d+\.\d+$/.test(text) ? text.replace('.', decimalSeparator) : text;
}

/**
 * Language chosen by the player: `?lang=` in the URL, else the last choice saved in this browser, else Spanish.
 * @param {URLSearchParams} params @param {string | null} saved
 * @returns {'es' | 'en'}
 */
export function pickLanguage(params, saved) {
  const wanted = params.get('lang') ?? saved;
  return wanted === 'en' ? 'en' : 'es';
}

/** @param {number} hour @param {number} minute */
export function formatClock(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
