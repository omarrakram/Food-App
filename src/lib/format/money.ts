import type { CurrencyCode, Money, PricedAmount } from '@/types/domain';

/**
 * Money helpers.
 *
 * Every amount is an integer in the currency's minor unit. All arithmetic
 * happens on integers; we only divide when rendering. This keeps a 40-line
 * shopping list from drifting by a piastre.
 */

const MINOR_UNITS: Record<CurrencyCode, number> = {
  EGP: 100,
  SAR: 100,
  AED: 100,
  USD: 100,
  GBP: 100,
};

/** Symbols we prefer over the Intl default, which is verbose for EGP. */
const SYMBOLS: Record<CurrencyCode, { en: string; ar: string }> = {
  EGP: { en: 'EGP', ar: 'ج.م' },
  SAR: { en: 'SAR', ar: 'ر.س' },
  AED: { en: 'AED', ar: 'د.إ' },
  USD: { en: '$', ar: '$' },
  GBP: { en: '£', ar: '£' },
};

export function minorUnitFactor(currency: CurrencyCode): number {
  return MINOR_UNITS[currency];
}

export function money(amountMinor: number, currency: CurrencyCode): Money {
  return { amountMinor: Math.round(amountMinor), currency };
}

/** Builds a Money from a major-unit value (e.g. 125.5 EGP). */
export function fromMajor(amountMajor: number, currency: CurrencyCode): Money {
  return money(Math.round(amountMajor * minorUnitFactor(currency)), currency);
}

export function toMajor(value: Money): number {
  return value.amountMinor / minorUnitFactor(value.currency);
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add ${a.currency} to ${b.currency}`);
  }
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function sumMoney(values: readonly Money[], currency: CurrencyCode): Money {
  return values.reduce<Money>(
    (acc, value) => (value.currency === currency ? addMoney(acc, value) : acc),
    money(0, currency),
  );
}

export function multiplyMoney(value: Money, factor: number): Money {
  return money(value.amountMinor * factor, value.currency);
}

export function divideMoney(value: Money, divisor: number): Money {
  if (divisor === 0) return money(0, value.currency);
  return money(value.amountMinor / divisor, value.currency);
}

export function compareMoney(a: Money, b: Money): number {
  return a.amountMinor - b.amountMinor;
}

export type FormatMoneyOptions = {
  locale?: string;
  /** Hide minor units when the amount is a round number. Default true. */
  compact?: boolean;
  /** Render '٢٥٠ ج.م' instead of 'EGP 250'. Derived from locale by default. */
  arabicSymbol?: boolean;
};

/**
 * Formats a bare amount. Callers that have a `PricedAmount` should use
 * {@link formatPricedAmount} instead so the estimate/live distinction is never
 * accidentally dropped.
 */
export function formatMoney(value: Money, options: FormatMoneyOptions = {}): string {
  const { locale = 'en-US', compact = true } = options;
  const useArabic = options.arabicSymbol ?? locale.startsWith('ar');
  const major = toMajor(value);
  const isRound = Number.isInteger(major);
  const fractionDigits = compact && isRound ? 0 : 2;

  let numeric: string;
  try {
    numeric = new Intl.NumberFormat(locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(major);
  } catch {
    numeric = major.toFixed(fractionDigits);
  }

  const symbol = useArabic ? SYMBOLS[value.currency].ar : SYMBOLS[value.currency].en;
  // Symbol currencies read better prefixed; ISO codes read better suffixed.
  const isSymbolCurrency = symbol === '$' || symbol === '£';
  return isSymbolCurrency ? `${symbol}${numeric}` : `${numeric} ${symbol}`;
}

/**
 * Formats a price with its provenance made explicit.
 *
 * Product rule: an estimated price is NEVER shown as if it were a real store
 * price. `~` plus the word "Estimated" in nearby copy is the minimum.
 */
export function formatPricedAmount(
  priced: PricedAmount,
  options: FormatMoneyOptions = {},
): { text: string; isEstimate: boolean } {
  const text = formatMoney(priced.money, options);
  if (priced.source === 'estimate') {
    return { text: `~${text}`, isEstimate: true };
  }
  return { text, isEstimate: false };
}

/**
 * Parses user budget input. Tolerates Arabic-Indic digits, thousands
 * separators and a trailing currency word. Returns null when nothing usable
 * was typed.
 */
export function parseMoneyInput(raw: string, currency: CurrencyCode): Money | null {
  if (!raw) return null;
  const westernised = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[,٬\s]/g, '')
    .replace(/[٫]/g, '.');
  const match = westernised.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return fromMajor(parsed, currency);
}

export const CURRENCY_BY_COUNTRY: Record<string, CurrencyCode> = {
  EG: 'EGP',
  SA: 'SAR',
  AE: 'AED',
  US: 'USD',
  GB: 'GBP',
};

export function currencyForCountry(country: string): CurrencyCode {
  return CURRENCY_BY_COUNTRY[country] ?? 'EGP';
}
