import { INGREDIENT_CATALOGUE, type CatalogueIngredient } from '@/features/ingredients/catalogue';
import { PRICE_DATA, PRICE_DATA_DATE } from './price-data';
import { resolveIngredient } from '@/features/ingredients/matching';
import type { CountryCode, CurrencyCode, Unit } from '@/types/domain';

/**
 * The price book: what we believe an ingredient costs, and where that belief
 * came from.
 *
 * V1 ships bundled estimates for Egypt so budgeting works offline and before
 * any store integration exists. `PriceBook` is an interface precisely so a
 * live `GroceryProvider` can be dropped in later without touching the budget
 * engine — see `src/features/grocery/`.
 */

export type PriceQuote = {
  /** Cost in minor units for `quantity` of `unit`. */
  amountMinor: number;
  currency: CurrencyCode;
  unit: Unit;
  quantity: number;
  /** Low/high give the UI an honest range to show. */
  lowMinor: number;
  highMinor: number;
  /** ISO date the figure was last reviewed. */
  lastUpdated: string;
};

export interface PriceBook {
  readonly country: CountryCode;
  readonly currency: CurrencyCode;
  /** Quote for a canonical ingredient name, or null when we have no data. */
  quote(ingredientName: string): PriceQuote | null;
  /** ISO date the underlying data set was last refreshed. */
  readonly lastUpdated: string;
}

/**
 * Date the bundled Egyptian estimates were last reviewed. Shown to users
 * alongside every estimated total so they can judge how stale it is.
 *
 * MAINTENANCE: refresh `INGREDIENT_CATALOGUE` prices and bump this date. A
 * scheduled job that writes into `ingredient_price_estimates` replaces this
 * bundled fallback once the backend is live.
 */
export const BUNDLED_PRICE_DATE = PRICE_DATA_DATE;

/**
 * Prices from the imported survey, looked up by ingredient slug.
 *
 * Recognising an ingredient and pricing it are separate problems, and the data
 * is separate to match: the catalogue can know about a thousand foods while the
 * survey covers a few hundred. An ingredient with no row here has no price —
 * which the estimator reports honestly rather than treating as free.
 */
class BundledPriceBook implements PriceBook {
  readonly country: CountryCode;
  readonly currency: CurrencyCode;
  readonly lastUpdated = PRICE_DATA_DATE;

  private readonly bySlug: Map<string, CatalogueIngredient>;

  constructor(country: CountryCode, currency: CurrencyCode) {
    this.country = country;
    this.currency = currency;
    this.bySlug = new Map(INGREDIENT_CATALOGUE.map((item) => [item.name, item]));
  }

  quote(ingredientName: string): PriceQuote | null {
    const entry = resolveIngredient(ingredientName) ?? this.bySlug.get(ingredientName);
    if (!entry) return null;

    const row = PRICE_DATA[entry.slug];
    if (!row) return null;

    return {
      amountMinor: row.avgMinor,
      currency: this.currency,
      unit: row.unit,
      quantity: row.quantity,
      lowMinor: row.lowMinor,
      highMinor: row.highMinor,
      lastUpdated: this.lastUpdated,
    };
  }
}

/**
 * Price books by market. Only Egypt has curated data today; other countries
 * resolve to a book that returns null for everything, which the estimator
 * surfaces honestly as "no price data" rather than guessing.
 */
const BOOKS: Partial<Record<CountryCode, PriceBook>> = {
  EG: new BundledPriceBook('EG', 'EGP'),
};

class EmptyPriceBook implements PriceBook {
  readonly lastUpdated = BUNDLED_PRICE_DATE;
  constructor(
    readonly country: CountryCode,
    readonly currency: CurrencyCode,
  ) {}
  quote(): PriceQuote | null {
    return null;
  }
}

export function priceBookFor(country: CountryCode, currency: CurrencyCode): PriceBook {
  return BOOKS[country] ?? new EmptyPriceBook(country, currency);
}

/** Test/DI seam: lets a fake price book be installed for a market. */
export function registerPriceBook(country: CountryCode, book: PriceBook): void {
  BOOKS[country] = book;
}

/**
 * Whether we can quote prices in this country at all.
 *
 * Budget features are only honest where a real survey exists. Rather than keep
 * a second list in the UI that can drift, this reads the registry itself: a
 * country is supported exactly when a book has been registered for it.
 */
export function isCountrySupported(country: CountryCode): boolean {
  return BOOKS[country] !== undefined;
}

/** Countries the UI may offer as fully working today. */
export function supportedCountries(): CountryCode[] {
  return Object.keys(BOOKS) as CountryCode[];
}

/**
 * How long bundled survey prices stay trustworthy.
 *
 * Egyptian grocery prices move fast enough that half a year old is worth
 * saying out loud. This is a disclosure threshold, not an expiry: stale data is
 * still shown, still labelled an estimate, and never silently replaced with an
 * invented figure.
 */
export const PRICE_STALE_AFTER_DAYS = 180;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days since an ISO date, or null when it cannot be parsed. */
export function priceDataAgeDays(lastUpdated: string, now: Date = new Date()): number | null {
  const then = Date.parse(lastUpdated);
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / MS_PER_DAY);
}

export function isPriceDataStale(
  lastUpdated: string,
  now: Date = new Date(),
  thresholdDays: number = PRICE_STALE_AFTER_DAYS,
): boolean {
  const age = priceDataAgeDays(lastUpdated, now);
  return age !== null && age > thresholdDays;
}
