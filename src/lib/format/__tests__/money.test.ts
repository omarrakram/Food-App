import {
  addMoney,
  compareMoney,
  currencyForCountry,
  divideMoney,
  formatMoney,
  formatPricedAmount,
  fromMajor,
  money,
  multiplyMoney,
  parseMoneyInput,
  sumMoney,
  toMajor,
} from '../money';

describe('minor-unit arithmetic', () => {
  it('round-trips major and minor units', () => {
    expect(fromMajor(125.5, 'EGP').amountMinor).toBe(12550);
    expect(toMajor(money(12550, 'EGP'))).toBe(125.5);
  });

  it('adds without float drift over a long list', () => {
    // 0.1 + 0.2 in floats is the classic failure; integers make it exact.
    const values = Array.from({ length: 1000 }, () => fromMajor(0.1, 'EGP'));
    expect(toMajor(sumMoney(values, 'EGP'))).toBe(100);
  });

  it('refuses to add across currencies', () => {
    expect(() => addMoney(money(100, 'EGP'), money(100, 'USD'))).toThrow();
  });

  it('ignores mismatched currencies when summing', () => {
    const total = sumMoney([money(100, 'EGP'), money(500, 'USD')], 'EGP');
    expect(total.amountMinor).toBe(100);
  });

  it('multiplies and divides, rounding to whole minor units', () => {
    expect(multiplyMoney(money(333, 'EGP'), 3).amountMinor).toBe(999);
    expect(divideMoney(money(1000, 'EGP'), 3).amountMinor).toBe(333);
    expect(divideMoney(money(1000, 'EGP'), 0).amountMinor).toBe(0);
  });

  it('compares by amount', () => {
    expect(compareMoney(money(100, 'EGP'), money(200, 'EGP'))).toBeLessThan(0);
  });
});

describe('formatMoney', () => {
  it('suffixes ISO-code currencies and prefixes symbol currencies', () => {
    expect(formatMoney(fromMajor(150, 'EGP'))).toBe('150 EGP');
    expect(formatMoney(fromMajor(15, 'USD'))).toBe('$15');
  });

  it('hides trailing zeros on round amounts, keeps them otherwise', () => {
    expect(formatMoney(fromMajor(150, 'EGP'))).toBe('150 EGP');
    expect(formatMoney(fromMajor(150.5, 'EGP'))).toBe('150.50 EGP');
  });

  it('uses the Arabic currency symbol for an Arabic locale', () => {
    expect(formatMoney(fromMajor(150, 'EGP'), { locale: 'ar-EG' })).toContain('ج.م');
  });
});

describe('formatPricedAmount', () => {
  it('MARKS an estimate with ~ so it can never read as a real price', () => {
    const result = formatPricedAmount({
      money: fromMajor(126, 'EGP'),
      source: 'estimate',
    });

    expect(result.isEstimate).toBe(true);
    expect(result.text).toBe('~126 EGP');
  });

  it('leaves a live store price unmarked', () => {
    const result = formatPricedAmount({
      money: fromMajor(126, 'EGP'),
      source: 'live',
      storeName: 'Example Market',
    });

    expect(result.isEstimate).toBe(false);
    expect(result.text).toBe('126 EGP');
  });

  it('ROUNDS an estimate to whole units, because 2dp claims a precision we lack', () => {
    // A bundled survey figure scaled by servings lands on numbers like this.
    // Showing "~142.04 EGP" would assert we know the price to the piastre.
    expect(formatPricedAmount({ money: fromMajor(142.04, 'EGP'), source: 'estimate' }).text).toBe(
      '~142 EGP',
    );
    expect(formatPricedAmount({ money: fromMajor(126.5, 'EGP'), source: 'estimate' }).text).toBe(
      '~127 EGP',
    );
  });

  it('keeps the piastres on a live price, which really is exact', () => {
    const result = formatPricedAmount({
      money: fromMajor(142.04, 'EGP'),
      source: 'live',
      storeName: 'Example Market',
    });

    expect(result.text).toBe('142.04 EGP');
  });

  it('keeps decimals below one unit, where rounding would distort', () => {
    // A pinch of salt at 50 piastres is cheap, not free ("~0 EGP") and not
    // twice its price ("~1 EGP").
    expect(formatPricedAmount({ money: money(50, 'EGP'), source: 'estimate' }).text).toBe(
      '~0.50 EGP',
    );
    expect(formatPricedAmount({ money: money(99, 'EGP'), source: 'estimate' }).text).toBe(
      '~0.99 EGP',
    );
    // One whole unit and up rounds normally.
    expect(formatPricedAmount({ money: money(100, 'EGP'), source: 'estimate' }).text).toBe(
      '~1 EGP',
    );
    expect(formatPricedAmount({ money: money(0, 'EGP'), source: 'estimate' }).text).toBe('~0 EGP');
  });

  it('rounds for display only, leaving the underlying amount exact', () => {
    // The shopping list totals from these integers; if rendering mutated them
    // a 40-line list would drift by a pound.
    const exact = fromMajor(142.04, 'EGP');
    formatPricedAmount({ money: exact, source: 'estimate' });

    expect(exact.amountMinor).toBe(14204);
  });
});

describe('parseMoneyInput', () => {
  it('parses plain and decimal input', () => {
    expect(parseMoneyInput('150', 'EGP')?.amountMinor).toBe(15000);
    expect(parseMoneyInput('150.75', 'EGP')?.amountMinor).toBe(15075);
  });

  it('tolerates separators and a trailing currency word', () => {
    expect(parseMoneyInput('1,500 EGP', 'EGP')?.amountMinor).toBe(150000);
    expect(parseMoneyInput('  250  ', 'EGP')?.amountMinor).toBe(25000);
  });

  it('parses Arabic-Indic digits', () => {
    expect(parseMoneyInput('١٥٠', 'EGP')?.amountMinor).toBe(15000);
  });

  it('rejects empty, negative and non-numeric input', () => {
    expect(parseMoneyInput('', 'EGP')).toBeNull();
    expect(parseMoneyInput('abc', 'EGP')).toBeNull();
    expect(parseMoneyInput('-50', 'EGP')).toBeNull();
  });
});

describe('currencyForCountry', () => {
  it('maps the launch market and falls back safely', () => {
    expect(currencyForCountry('EG')).toBe('EGP');
    expect(currencyForCountry('GB')).toBe('GBP');
    expect(currencyForCountry('ZZ')).toBe('EGP');
  });
});
