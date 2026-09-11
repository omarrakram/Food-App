import { ar } from '../locales/ar';
import { en } from '../locales/en';

/**
 * Locale parity.
 *
 * Arabic sat at roughly 40% for a long time, with the rest silently falling
 * back to English — which reads as neglect in an Egyptian product, and is
 * invisible to every other test. `ar` is typed as a complete record so a gap is
 * a compile error; these assertions catch the things types cannot see, like a
 * translation that was pasted but left in English.
 */
describe('Arabic locale parity', () => {
  const enKeys = Object.keys(en).sort();
  const arKeys = Object.keys(ar).sort();

  it('translates EVERY key the app can render', () => {
    const missing = enKeys.filter((key) => !(key in ar));
    expect(missing).toEqual([]);
  });

  it('has no keys English does not have', () => {
    // A stale key is dead weight that survives a rename in en.ts.
    const extra = arKeys.filter((key) => !(key in en));
    expect(extra).toEqual([]);
  });

  it('leaves no translation empty', () => {
    const empty = arKeys.filter((key) => !(ar as Record<string, string>)[key]?.trim());
    expect(empty).toEqual([]);
  });

  const placeholders = (value: string) => (value.match(/\{[a-zA-Z]+\}/g) ?? []).sort();

  it('never invents a placeholder the English string does not have', () => {
    // An unknown {token} renders as a literal brace to the user, because
    // nothing will ever substitute it.
    const invented = enKeys.filter((key) => {
      const source = new Set(placeholders((en as Record<string, string>)[key] ?? ''));
      return placeholders((ar as Record<string, string>)[key] ?? '').some(
        (token) => !source.has(token),
      );
    });

    expect(invented).toEqual([]);
  });

  it('keeps every placeholder outside the singular forms', () => {
    // `_one` is exempt on purpose: Arabic lexicalises the singular, so
    // "1 serving" is «طبق واحد» — the numeral is in the word, and repeating
    // it as "{count} طبق واحد" would be wrong. Every other form must carry
    // its placeholders through.
    const dropped = enKeys
      .filter((key) => !key.endsWith('_one'))
      .filter((key) => {
        const source = placeholders((en as Record<string, string>)[key] ?? '');
        const target = placeholders((ar as Record<string, string>)[key] ?? '');
        return JSON.stringify(source) !== JSON.stringify(target);
      });

    expect(dropped).toEqual([]);
  });

  it('keeps both halves of every plural', () => {
    const bases = new Set(
      enKeys.filter((key) => key.endsWith('_one')).map((key) => key.slice(0, -'_one'.length)),
    );

    // `in` rather than toHaveProperty: the keys contain dots, which
    // toHaveProperty reads as a nested path.
    for (const base of bases) {
      expect(`${base}_one` in ar).toBe(true);
      expect(`${base}_other` in ar).toBe(true);
    }
  });

  it('is actually in Arabic, not English left in place', () => {
    // Deliberate exceptions: brand names and an email example are not translated.
    const intentionallyLatin = new Set([
      'auth.emailPlaceholder',
      'auth.continueWithApple',
      'auth.continueWithGoogle',
      'language.english',
      'price.live',
      'common.estimatedPrefix',
    ]);

    const arabic = /[؀-ۿ]/;
    const untranslated = arKeys.filter((key) => {
      if (intentionallyLatin.has(key)) return false;
      const value = (ar as Record<string, string>)[key] ?? '';
      // A value with no Arabic character at all is either a placeholder token
      // or an untranslated string.
      return !arabic.test(value);
    });

    expect(untranslated).toEqual([]);
  });
});
