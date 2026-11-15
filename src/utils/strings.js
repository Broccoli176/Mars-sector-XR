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
 * Spanish number format: decimal comma. @param {number} value @param {number} [digits]
 */
export const fmt = (value, digits = 1) => Number(value).toFixed(digits).replace('.', ',');

/**
 * Parameters that are plain decimals («2.5», 0.28) are shown with a decimal comma, so every panel agrees.
 * @param {string | number} value
 */
function localizeNumber(value) {
  const text = String(value);
  return /^[-+]?\d+\.\d+$/.test(text) ? text.replace('.', ',') : text;
}

/** @param {number} hour @param {number} minute */
export function formatClock(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
