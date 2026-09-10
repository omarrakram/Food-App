import { INGREDIENT_CATALOGUE, type CatalogueIngredient } from '@/features/ingredients/catalogue';
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
export const BUNDLED_PRICE_DATE = '2026-08-01';

class BundledPriceBook implements PriceBook {
  readonly country: CountryCode;
  readonly currency: CurrencyCode;
  readonly lastUpdated = BUNDLED_PRICE_DATE;

  private readonly index: Map<string, CatalogueIngredient>;

  constructor(country: CountryCode, currency: CurrencyCode) {
    this.country = country;
    this.currency = currency;
    this.index = new Map(INGREDIENT_CATALOGUE.map((item) => [item.name, item]));
  }

  quote(ingredientName: string): PriceQuote | null {
    const resolved = resolveIngredient(ingredientName);
    const entry = resolved ?? this.index.get(ingredientName);
    if (!entry) return null;

    return {
      amountMinor: entry.priceAvgMinor,
      currency: this.currency,
      unit: entry.priceUnit,
      quantity: entry.priceQuantity,
      lowMinor: entry.priceLowMinor,
      highMinor: entry.priceHighMinor,
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
