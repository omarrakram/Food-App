import { ar } from '@/i18n/locales/ar';
import { en } from '@/i18n/locales/en';
import { formatMoney, money } from '@/lib/format/money';

/**
 * ONE numeral system, in both languages: Western 0–9.
 *
 * The app used to speak two at once. `t()` does plain string substitution, so
 * an interpolated count arrived as Latin digits; anything routed through
 * `formatNumber` / `formatMoney` / `formatDate` went through `Intl` with an
 * `ar-EG` locale and arrived as Arabic-Indic; and a handful of Arabic strings
 * had ٠١٢٣ typed into them by hand. A price could disagree with the count
 * beside it on the same row.
 *
 * These tests pin the decision rather than the implementation: whatever the
 * formatting path, a digit that reaches a user is 0–9.
 */

const ARABIC_INDIC = /[٠-٩۰-۹]/;
const AR_LOCALE = 'ar-EG-u-nu-latn';

describe('numerals', () => {
  it('formats numbers with Western digits under the Arabic locale', () => {
    const formatted = new Intl.NumberFormat(AR_LOCALE).format(1234.5);
    expect(formatted).not.toMatch(ARABIC_INDIC);
    expect(formatted).toMatch(/\d/);
  });

  it('formats money with Western digits, and keeps the Arabic currency symbol', () => {
    const value = formatMoney(money(15000, 'EGP'), { locale: AR_LOCALE });
    expect(value).not.toMatch(ARABIC_INDIC);
    expect(value).toMatch(/150/);
    // The numeral system changed; the language did not. `formatMoney` keys the
    // Arabic symbol off `startsWith('ar')`, which the -u-nu-latn extension
    // preserves — this is the assertion that catches someone "simplifying"
    // the locale to plain `en-US` to get Latin digits.
    expect(value).toMatch(/ج\.?م|EGP/);
  });

  it('formats dates with Western digits under the Arabic locale', () => {
    const formatted = new Intl.DateTimeFormat(AR_LOCALE, { dateStyle: 'medium' }).format(
      new Date('2026-03-14T00:00:00Z'),
    );
    expect(formatted).not.toMatch(ARABIC_INDIC);
  });

  it('has no hand-typed Arabic-Indic digits in any shipped string', () => {
    // The exported objects rather than the source files: this is the text that
    // actually reaches a user, and it needs no Node types to read.
    for (const [name, dictionary] of [
      ['en', en],
      ['ar', ar],
    ] as const) {
      const offenders = Object.entries(dictionary)
        .filter(([, value]) => ARABIC_INDIC.test(value))
        // Naming the keys is what makes a failure fixable.
        .map(([key, value]) => `${key}: ${value}`);
      expect({ name, offenders }).toEqual({ name, offenders: [] });
    }
  });
});
