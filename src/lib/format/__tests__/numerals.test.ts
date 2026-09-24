import { hasEasternNumerals, toWesternNumerals } from '../numerals';

/**
 * PRESENTATION NORMALISATION, and nothing more.
 *
 * AKALT renders 0–9 in both languages. Everything it formats itself already
 * does, because the locale is pinned to `ar-EG-u-nu-latn` — but a merchant's
 * own catalogue writes «رز مصري ١ كجم», and that string is theirs. We do not
 * rewrite it in the database; we render its digits Western and leave every
 * other character exactly where it was.
 *
 * Every test here is a way that promise could be broken.
 */

describe('digits become Western', () => {
  it('converts Arabic-Indic digits', () => {
    expect(toWesternNumerals('رز مصري ١ كجم')).toBe('رز مصري 1 كجم');
  });

  it('converts Extended Arabic-Indic (Persian/Urdu) digits too', () => {
    // A Gulf or Levantine catalogue can carry either block, and a supplier
    // feed can mix them inside one file.
    expect(toWesternNumerals('۵۰۰ گرم')).toBe('500 گرم');
  });

  it('converts every digit in a string, not only the first', () => {
    expect(toWesternNumerals('طماطم ٢٥٠٠ جم × ٣')).toBe('طماطم 2500 جم × 3');
  });

  it('handles a string that mixes both blocks', () => {
    expect(toWesternNumerals('١٢۳۴')).toBe('1234');
  });

  it('is idempotent', () => {
    const once = toWesternNumerals('عبوة ١ كجم');
    expect(toWesternNumerals(once)).toBe(once);
  });
});

describe('everything that is not a digit is left alone', () => {
  it('does not touch Arabic letters', () => {
    expect(toWesternNumerals('جهينة كريمة طبخ')).toBe('جهينة كريمة طبخ');
  });

  it('does not touch a Latin brand name', () => {
    expect(toWesternNumerals('Juhayna Cooking Cream 200ml')).toBe(
      'Juhayna Cooking Cream 200ml',
    );
  });

  it('does not touch spacing, punctuation or word order', () => {
    const stored = 'زيت عباد الشمس — ٢٫٧ لتر (عبوة كبيرة)';
    expect(toWesternNumerals(stored)).toBe('زيت عباد الشمس — 2.7 لتر (عبوة كبيرة)');
  });

  it('leaves an empty string empty', () => {
    expect(toWesternNumerals('')).toBe('');
  });
});

describe('the Arabic separators, which are part of a number', () => {
  it('renders the decimal separator so the number is not half-converted', () => {
    // «1٫5» is neither system and reads as a typo.
    expect(toWesternNumerals('١٫٥ كجم')).toBe('1.5 كجم');
  });

  it('renders the thousands separator', () => {
    expect(toWesternNumerals('١٬٠٠٠ جم')).toBe('1,000 جم');
  });

  it('leaves a separator alone when it is not between two digits', () => {
    // Defensive: these code points have no other use, but silently editing
    // punctuation in somebody's product name is not a thing to be relaxed
    // about.
    expect(toWesternNumerals('عبوة ٫ كبيرة')).toBe('عبوة ٫ كبيرة');
  });
});

describe('the audit helper', () => {
  it('spots an Eastern numeral', () => {
    expect(hasEasternNumerals('رز مصري ١ كجم')).toBe(true);
    expect(hasEasternNumerals('۵۰۰ گرم')).toBe(true);
  });

  it('is quiet about a string that is already Western', () => {
    expect(hasEasternNumerals('رز مصري 1 كجم')).toBe(false);
    expect(hasEasternNumerals('Rice 1kg')).toBe(false);
  });
});
