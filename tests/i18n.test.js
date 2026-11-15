import { describe, it, expect } from 'vitest';
import { gameData } from '../src/data/index.js';
import { createTranslator, fmt, pickLanguage, setNumberLanguage, LANGUAGES } from '../src/utils/strings.js';

const placeholders = (/** @type {string} */ s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('Spanish and English tables', () => {
  it('both languages are offered and every Spanish text has an English translation', () => {
    expect(LANGUAGES).toEqual(['es', 'en']);
    const es = gameData.stringsByLang.es;
    const en = gameData.stringsByLang.en;
    const missing = Object.keys(es).filter((k) => en[k] === es[k] && /[áéíóúñ¿¡]/i.test(es[k]));
    expect(missing, 'keys still in Spanish in the English table').toEqual([]);
    for (const k of Object.keys(es)) expect(placeholders(en[k]), k).toBe(placeholders(es[k]));
  });

  it('the English table is complete on its own (no fallback to Spanish needed)', async () => {
    const files = import.meta.glob('../src/data/strings/en/*.json', { eager: true });
    /** @type {Record<string, string>} */
    const enOnly = Object.assign({}, ...Object.values(files).map((m) => /** @type {any} */ (m).default ?? m));
    for (const k of Object.keys(gameData.stringsByLang.es)) expect(enOnly[k], k).toBeTypeOf('string');
  });

  it('picks the language from the URL, then the saved choice, Spanish by default', () => {
    expect(pickLanguage(new URLSearchParams('lang=en'), 'es')).toBe('en');
    expect(pickLanguage(new URLSearchParams(''), 'en')).toBe('en');
    expect(pickLanguage(new URLSearchParams(''), null)).toBe('es');
    expect(pickLanguage(new URLSearchParams('lang=fr'), null)).toBe('es');
  });

  it('numbers use a decimal comma in Spanish and a point in English', () => {
    const t = createTranslator({ k: '{v} kW' });
    setNumberLanguage('en');
    expect(fmt(2.5)).toBe('2.5');
    expect(t('k', { v: '1.25' })).toBe('1.25 kW');
    setNumberLanguage('es');
    expect(fmt(2.5)).toBe('2,5');
    expect(t('k', { v: '1.25' })).toBe('1,25 kW');
  });
});
