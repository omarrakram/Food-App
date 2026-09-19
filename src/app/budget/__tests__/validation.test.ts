import { formatMoney, fromMajor, parseMoneyInput, toMajor } from '@/lib/format/money';

/**
 * What the budget screen will and will not accept.
 *
 * The screen's submit is gated on exactly two things — the string parses to
 * money, and that money clears a floor — so those are what these pin. A budget
 * below the floor is not a validation nicety: there is no real meal at 3 EGP,
 * and returning an empty results page would look like the app was broken
 * rather than like the number was too small.
 */

/** Mirrors `MIN_BUDGET_MAJOR` on the screen. */
const MIN_BUDGET_MAJOR = 10;

function accepts(raw: string): boolean {
  const parsed = parseMoneyInput(raw, 'EGP');
  if (parsed === null) return false;
  return parsed.amountMinor >= fromMajor(MIN_BUDGET_MAJOR, 'EGP').amountMinor;
}

describe('budget input', () => {
  it('accepts a realistic amount', () => {
    expect(accepts('150')).toBe(true);
    expect(toMajor(parseMoneyInput('150', 'EGP')!)).toBe(150);
  });

  it('accepts decimals', () => {
    expect(accepts('150.75')).toBe(true);
  });

  it('refuses an empty budget', () => {
    expect(accepts('')).toBe(false);
    expect(accepts('   ')).toBe(false);
  });

  it('refuses zero', () => {
    expect(accepts('0')).toBe(false);
    expect(accepts('0.00')).toBe(false);
  });

  it('refuses a negative amount', () => {
    // `parseMoneyInput` rejects these outright rather than clamping, so a
    // minus sign can never become a positive budget on the way through.
    expect(parseMoneyInput('-50', 'EGP')).toBeNull();
    expect(accepts('-50')).toBe(false);
  });

  it('refuses an amount below the floor, where no real meal exists', () => {
    expect(accepts('3')).toBe(false);
    expect(accepts('9.99')).toBe(false);
    expect(accepts('10')).toBe(true);
  });

  it('refuses text', () => {
    expect(accepts('abc')).toBe(false);
  });

  it('accepts Arabic-Indic digits typed on an Arabic keyboard', () => {
    // The app RENDERS Western numerals everywhere (see numerals.test.ts), but
    // a user's KEYBOARD may still produce ٠١٢٣ — refusing that would be
    // refusing the launch market's own input method.
    expect(toMajor(parseMoneyInput('١٥٠', 'EGP')!)).toBe(150);
    expect(accepts('١٥٠')).toBe(true);
  });

  it('ignores grouping separators in either script', () => {
    expect(toMajor(parseMoneyInput('1,500', 'EGP')!)).toBe(1500);
    expect(toMajor(parseMoneyInput('1٬500', 'EGP')!)).toBe(1500);
  });
});

describe('how a budget reads back', () => {
  const AR = 'ar-EG-u-nu-latn';

  it('shows Western digits with the Arabic currency mark', () => {
    const shown = formatMoney(fromMajor(150, 'EGP'), { locale: AR });
    expect(shown).toContain('150');
    expect(shown).not.toMatch(/[\u0660-\u0669]/);
    expect(shown).toContain('ج.م');
  });

  it('puts the EGP mark AFTER the number, in both languages', () => {
    // An ISO-style currency reads better suffixed, and Arabic suffixes it too.
    // Pinned because a "tidy-up" to a prefix would silently change every price
    // in the product, not just this screen.
    for (const locale of ['en-US', AR]) {
      const shown = formatMoney(fromMajor(150, 'EGP'), { locale });
      expect(shown.trim().endsWith('150')).toBe(false);
      expect(shown).toMatch(/^150\s/);
    }
  });

  it('drops the decimals on a round budget, keeps them when they matter', () => {
    expect(formatMoney(fromMajor(150, 'EGP'), { locale: AR })).toMatch(/^150\s/);
    expect(formatMoney(fromMajor(150.5, 'EGP'), { locale: AR })).toMatch(/^150\.50\s/);
  });
});
