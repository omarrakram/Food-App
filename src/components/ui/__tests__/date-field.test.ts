import { parseISODate, toISODate } from '../date-field.shared';

/**
 * Expiry dates used to be free text in a `YYYY-MM-DD` box, which asks the user
 * to know a format and accepts days that do not exist. `new Date('2026-02-31')`
 * silently returns 3 March, so a typo becomes a real but wrong date and the
 * food-safety rules then run on it.
 */
describe('parseISODate', () => {
  it('accepts a real date', () => {
    const parsed = parseISODate('2026-09-11');
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(8);
    expect(parsed?.getDate()).toBe(11);
  });

  it('REJECTS a day that does not exist in that month', () => {
    // The trap: Date would roll this forward to 3 March rather than fail.
    expect(parseISODate('2026-02-31')).toBeNull();
    expect(parseISODate('2026-04-31')).toBeNull();
    expect(parseISODate('2026-13-01')).toBeNull();
    expect(parseISODate('2026-00-10')).toBeNull();
  });

  it('respects leap years in both directions', () => {
    expect(parseISODate('2024-02-29')).not.toBeNull();
    expect(parseISODate('2026-02-29')).toBeNull();
  });

  it('rejects anything that is not exactly YYYY-MM-DD', () => {
    for (const value of ['', '2026-9-11', '11/09/2026', '2026-09-11T00:00:00', 'tomorrow', '20260911']) {
      expect(parseISODate(value)).toBeNull();
    }
  });
});

describe('toISODate', () => {
  it('formats in local time, so a late-evening date does not shift a day', () => {
    // toISOString would render this as the 12th in any timezone east of UTC.
    const date = new Date(2026, 8, 11, 23, 30);
    expect(toISODate(date)).toBe('2026-09-11');
  });

  it('pads single-digit months and days', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('round-trips through the parser', () => {
    const iso = toISODate(new Date(2026, 11, 31));
    expect(toISODate(parseISODate(iso)!)).toBe(iso);
  });
});
