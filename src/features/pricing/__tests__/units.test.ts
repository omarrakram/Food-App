import { createTranslator } from '@/i18n';

import {
  formatKitchenNumber,
  formatQuantity,
  isCountableUnit,
  perPieceWeightFor,
  roundForKitchen,
  scaleQuantity,
  toGrams,
  unitLabel,
  unitName,
} from '../units';

// Real dictionaries, not stubs: the point of these helpers is that they read
// the same as a recipe does in each language.
const en = createTranslator('en');
const ar = createTranslator('ar');

describe('toGrams', () => {
  it('converts absolute mass and volume units', () => {
    expect(toGrams(1, 'kg', null)).toBe(1000);
    expect(toGrams(250, 'g', null)).toBe(250);
    expect(toGrams(1, 'l', null)).toBe(1000);
    expect(toGrams(500, 'ml', null)).toBe(500);
  });

  it('converts spoon and cup measures', () => {
    expect(toGrams(1, 'tbsp', null)).toBe(15);
    expect(toGrams(2, 'tsp', null)).toBe(10);
    expect(toGrams(1, 'cup', null)).toBe(240);
  });

  it('treats "to taste" as weightless so it cannot distort a budget', () => {
    expect(toGrams(1, 'to_taste', null)).toBe(0);
  });

  it('uses the per-piece weight for the ingredient own countable unit', () => {
    expect(toGrams(3, 'piece', { unit: 'piece', grams: 120 })).toBe(360);
    expect(toGrams(2, 'clove', { unit: 'clove', grams: 5 })).toBe(10);
  });

  it('REFUSES to convert a countable unit the weight is not quoted for', () => {
    // 60 g is the weight of one bunch of parsley. Using it for a "clove" would
    // produce a number that means nothing, so the conversion is undefined.
    expect(toGrams(1, 'clove', { unit: 'bunch', grams: 60 })).toBeNull();
  });

  it('returns null for a countable unit with no per-piece weight', () => {
    // The caller then falls back to a per-unit price instead of inventing one.
    expect(toGrams(3, 'piece', null)).toBeNull();
  });

  it('rejects nonsense input', () => {
    expect(toGrams(-1, 'g', null)).toBeNull();
    expect(toGrams(Number.NaN, 'g', null)).toBeNull();
  });
});

describe('perPieceWeightFor', () => {
  it('quotes the weight against the ingredient own countable unit', () => {
    // Garlic is counted in cloves.
    expect(
      perPieceWeightFor({ defaultUnit: 'clove', gramsPerPiece: 5 }, 'kg'),
    ).toEqual({ unit: 'clove', grams: 5 });
  });

  it('falls back to the QUOTED unit when the default unit is not countable', () => {
    // Yogurt is measured in grams but sold by the pot. The quoted unit now
    // arrives from the price row rather than the catalogue entry.
    expect(perPieceWeightFor({ defaultUnit: 'g', gramsPerPiece: 105 }, 'piece')).toEqual({
      unit: 'piece',
      grams: 105,
    });
  });

  it('returns null when no quoted unit is supplied and the default is not countable', () => {
    expect(perPieceWeightFor({ defaultUnit: 'g', gramsPerPiece: 105 })).toBeNull();
  });

  it('returns null when neither unit is countable', () => {
    expect(perPieceWeightFor({ defaultUnit: 'g', gramsPerPiece: 100 }, 'kg')).toBeNull();
  });

  it('returns null when there is no weight at all', () => {
    expect(
      perPieceWeightFor({ defaultUnit: 'piece', gramsPerPiece: null }, 'kg'),
    ).toBeNull();
    expect(perPieceWeightFor(null)).toBeNull();
  });
});

describe('isCountableUnit', () => {
  it('identifies units whose weight depends on the ingredient', () => {
    expect(isCountableUnit('piece')).toBe(true);
    expect(isCountableUnit('can')).toBe(true);
    expect(isCountableUnit('g')).toBe(false);
  });
});

describe('roundForKitchen', () => {
  it('rounds to something a cook can measure', () => {
    expect(roundForKitchen(0.33)).toBe(0.25);
    expect(roundForKitchen(2.4)).toBe(2.5);
    expect(roundForKitchen(37.2)).toBe(37);
    expect(roundForKitchen(233)).toBe(230);
  });

  it('never returns a negative amount', () => {
    expect(roundForKitchen(-5)).toBe(0);
  });
});

describe('scaleQuantity', () => {
  it('scales up and down from the recipe base', () => {
    expect(scaleQuantity(300, 4, 2)).toBe(150);
    expect(scaleQuantity(300, 4, 8)).toBe(600);
  });

  it('leaves the quantity alone when it is unknown', () => {
    expect(scaleQuantity(null, 4, 8)).toBeNull();
  });

  it('does not divide by zero', () => {
    expect(scaleQuantity(300, 0, 2)).toBe(300);
  });
});

describe('formatQuantity', () => {
  const format = (value: number) => String(value);
  const english = { t: en, formatNumber: format };

  it('omits the unit for countable pieces', () => {
    expect(formatQuantity(3, 'piece', english)).toBe('3');
  });

  it('pluralises countable units', () => {
    expect(formatQuantity(1, 'clove', english)).toBe('1 clove');
    expect(formatQuantity(3, 'clove', english)).toBe('3 cloves');
  });

  it('renders "to taste" as words', () => {
    expect(formatQuantity(1, 'to_taste', english)).toBe('to taste');
  });

  it('never renders a naked unit when there is no quantity', () => {
    // This asserted `'g'` until a pantry row rendered exactly that: "rice / g /
    // 2 days left". A unit is a suffix to a number, so with no number there is
    // nothing to print, and every caller already treats '' as "print nothing".
    expect(formatQuantity(null, 'g', english)).toBe('');
    expect(formatQuantity(null, 'ml', english)).toBe('');
    expect(formatQuantity(null, 'piece', english)).toBe('');
    expect(formatQuantity(null, null, english)).toBe('');
  });

  it('still names an amount left to the cook', () => {
    // `to_taste` is the one case that carries meaning without a number, and it
    // is resolved before the quantity is looked at.
    expect(formatQuantity(null, 'to_taste', english)).toBe(english.t('unit.toTaste'));
  });
});

describe('formatQuantity in Arabic', () => {
  // An Arabic reader was getting "300 g" and "4 cloves" in the middle of an
  // otherwise Arabic recipe, because the unit table was hard-coded English.
  const arabic = { t: ar, formatNumber: (value: number) => String(value) };

  it('writes the unit in Arabic', () => {
    expect(formatQuantity(300, 'g', arabic)).toBe('300 جم');
    expect(formatQuantity(120, 'ml', arabic)).toBe('120 مل');
  });

  it('pluralises the way Arabic does', () => {
    expect(formatQuantity(1, 'clove', arabic)).toBe('1 فص');
    expect(formatQuantity(4, 'clove', arabic)).toBe('4 فصوص');
    expect(formatQuantity(3, 'tbsp', arabic)).toBe('3 ملاعق كبيرة');
  });

  it('translates "to taste"', () => {
    expect(formatQuantity(1, 'to_taste', arabic)).toBe('حسب الرغبة');
  });

  it('leaves a bare count for pieces in both languages', () => {
    expect(formatQuantity(3, 'piece', arabic)).toBe('3');
  });
});

describe('unitLabel', () => {
  it('covers every unit without throwing', () => {
    // The exhaustiveness guard in unitLabel makes this a compile-time check
    // too; this asserts the runtime side.
    expect(unitLabel('kg', 1, en)).toBe('kg');
    expect(unitLabel('l', 1, en)).toBe('L');
    expect(unitLabel('pinch', 2, en)).toBe('pinches');
  });

  it('says nothing for a piece, which a recipe never spells out', () => {
    expect(unitLabel('piece', 3, en)).toBe('');
    expect(unitLabel('piece', 3, ar)).toBe('');
  });
});

describe('unitName', () => {
  it('names the unit for a picker, including the one with no suffix', () => {
    expect(unitName('piece', en)).toBe('piece');
    expect(unitName('piece', ar)).toBe('حبة');
    expect(unitName('g', ar)).toBe('جم');
  });
});

describe('formatKitchenNumber', () => {
  const plain = (value: number) => String(value);

  it('writes the fractions a recipe would write', () => {
    expect(formatKitchenNumber(0.5, plain)).toBe('½');
    expect(formatKitchenNumber(0.25, plain)).toBe('¼');
    expect(formatKitchenNumber(0.75, plain)).toBe('¾');
  });

  it('writes mixed numbers without a decimal point', () => {
    expect(formatKitchenNumber(1.5, plain)).toBe('1½');
    expect(formatKitchenNumber(2.25, plain)).toBe('2¼');
  });

  it('leaves whole numbers alone', () => {
    expect(formatKitchenNumber(3, plain)).toBe('3');
  });

  it('falls back to the decimal for anything with no clean fraction', () => {
    expect(formatKitchenNumber(1.3, plain)).toBe('1.3');
  });

  it('routes the whole part through the locale formatter', () => {
    // Arabic gets Arabic-Indic digits; only the remainder becomes a glyph.
    expect(formatKitchenNumber(2.5, () => '٢')).toBe('٢½');
  });
});

describe('formatQuantity uses fractions and the right plural', () => {
  const plain = { t: en, formatNumber: (value: number) => String(value) };

  it('says "½ bunch", not "0.5 bunches"', () => {
    expect(formatQuantity(0.5, 'bunch', plain)).toBe('½ bunch');
  });

  it('keeps the plural above one', () => {
    expect(formatQuantity(2, 'clove', plain)).toBe('2 cloves');
    expect(formatQuantity(1.5, 'clove', plain)).toBe('1½ cloves');
  });

  it('keeps the singular at exactly one', () => {
    expect(formatQuantity(1, 'clove', plain)).toBe('1 clove');
  });

  it('never drops the unit', () => {
    expect(formatQuantity(250, 'g', plain)).toBe('250 g');
    expect(formatQuantity(0.5, 'l', plain)).toBe('½ L');
  });
});
