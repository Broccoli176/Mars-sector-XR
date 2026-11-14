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
    return template.replace(/\{(\w+)\}/g, (_, name) => (name in params ? String(params[name]) : `{${name}}`));
  };
}

/** @param {number} hour @param {number} minute */
export function formatClock(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
