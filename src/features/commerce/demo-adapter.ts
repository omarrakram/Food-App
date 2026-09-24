import { env } from '@/lib/config/env';
import type {
  IngredientProductMapping,
  Merchant,
  MerchantLocation,
  MerchantProduct,
  ProductDietaryProfile,
} from '@/types/commerce';
import type { Allergen, Availability } from '@/types/domain';

import {
  DEMO_LOCATION,
  DEMO_MAPPINGS,
  DEMO_MERCHANT,
  DEMO_PRODUCTS,
} from './demo-catalogue.generated';
import type { CatalogueAdapter, ProductQuery } from './ports';
import type { SourcingCandidateInput } from './sourcing';

/**
 * A `CatalogueAdapter` over the development catalogue.
 *
 * NOT A SUPERMARKET. It exists so the whole journey — missing ingredients,
 * products, cart, checkout, dashboard — can be built and walked before a
 * partner catalogue exists, and so the sourcing engine is exercised against
 * something shaped like a real shelf rather than against test fixtures only.
 *
 * It refuses to construct in a production build. Two gates rather than one —
 * the merchant row is `isDemo` AND this throws — because a fixture that
 * reaches a real user is the single worst outcome available to this layer, and
 * one flag is one mistake away from being flipped.
 */

const MERCHANT_ID = 'demo-merchant';
const LOCATION_ID = 'demo-location';
const TIMESTAMP = '2026-09-23T09:00:00.000Z';

export class DemoCatalogueUnavailableError extends Error {
  constructor() {
    super(
      'The demo merchant catalogue is unavailable. It requires ' +
        'EXPO_PUBLIC_DEMO_MERCHANT=true and a non-production build.',
    );
    this.name = 'DemoCatalogueUnavailableError';
  }
}

/**
 * The runtime half of the guard.
 *
 * `env.useDemoMerchantCatalogue` already requires the flag AND a
 * non-production build, following the same shape as `env.demoMode`. This
 * throws rather than returning empty, because a silent empty catalogue in
 * production looks exactly like a merchant with nothing in stock — the failure
 * would be invisible, and "no products found" is the one answer that would not
 * make anybody investigate.
 *
 * Every entry point into the demo data calls it. A guard on the adapter alone
 * left `demoCandidatesFor` reachable as a bare function, which is a route into
 * the fixtures that skips the class entirely.
 */
export function assertDemoCatalogueAllowed(): void {
  if (!env.useDemoMerchantCatalogue) throw new DemoCatalogueUnavailableError();
}

/**
 * The branch identity, resolved once.
 *
 * The adapter's methods are async because a real catalogue's will be. WHICH
 * branch this is, is not — so merchant selection reads these directly rather
 * than awaiting a promise to learn the name of a constant.
 */
export const DEMO_MERCHANT_SNAPSHOT: Merchant = (() => {
  return {
    id: MERCHANT_ID,
    slug: DEMO_MERCHANT.slug,
    name: DEMO_MERCHANT.name,
    nameAr: DEMO_MERCHANT.nameAr,
    country: 'EG',
    currency: 'EGP',
    fulfilmentMode: 'dashboard',
    commissionRateBasisPoints: DEMO_MERCHANT.commissionRateBasisPoints,
    merchantKeepsDeliveryFee: DEMO_MERCHANT.merchantKeepsDeliveryFee,
    isEnabled: DEMO_MERCHANT.isEnabled,
    isDemo: true,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
})();

export const DEMO_LOCATION_SNAPSHOT: MerchantLocation = (() => {
  return {
    id: LOCATION_ID,
    merchantId: MERCHANT_ID,
    externalId: DEMO_LOCATION.externalId,
    name: DEMO_LOCATION.name,
    nameAr: DEMO_LOCATION.nameAr,
    city: DEMO_LOCATION.city,
    deliveryAreaKeys: DEMO_LOCATION.deliveryAreaKeys,
    deliveryFee: { amountMinor: DEMO_LOCATION.deliveryFeeMinor, currency: 'EGP' },
    minimumOrder: { amountMinor: DEMO_LOCATION.minimumOrderMinor, currency: 'EGP' },
    estimatedDeliveryMinutes: DEMO_LOCATION.estimatedDeliveryMinutes,
    isAcceptingOrders: DEMO_LOCATION.isAcceptingOrders,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
})();

/** The product id IS the external id here. A demo has no other identity. */
function toProduct(row: (typeof DEMO_PRODUCTS)[number]): MerchantProduct {
  return {
    id: row.externalId,
    merchantId: MERCHANT_ID,
    locationId: LOCATION_ID,
    externalId: row.externalId,
    sku: row.sku,
    name: row.name,
    nameAr: row.nameAr,
    brand: row.brand,
    packQuantity: row.packQuantity,
    packUnit: row.packUnit,
    price: { amountMinor: row.priceMinor, currency: 'EGP' },
    availability: row.availability as Availability,
    imageUrl: null,
    isActive: row.isActive,
    fetchedAt: TIMESTAMP,
  };
}

function toMapping(row: (typeof DEMO_MAPPINGS)[number]): IngredientProductMapping {
  return {
    id: `${row.ingredientSlug}::${row.productExternalId}`,
    ingredientSlug: row.ingredientSlug,
    merchantProductId: row.productExternalId,
    confidence: row.confidence,
    source: row.source,
    isVerified: row.isVerified,
    verifiedAt: row.isVerified ? TIMESTAMP : null,
    verifiedBy: null,
    isBlocked: row.isBlocked,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

const PRODUCTS_BY_ID = new Map(DEMO_PRODUCTS.map((row) => [row.externalId, toProduct(row)]));

/** `null` is carried through, not flattened — see `DemoProductRow.allergens`. */
const ALLERGENS_BY_ID = new Map<string, readonly Allergen[] | null>(
  DEMO_PRODUCTS.map((row) => [row.externalId, row.allergens]),
);

/** Same rule, same reason: a merchant who said nothing must arrive as null. */
const DIETS_BY_ID = new Map<string, ProductDietaryProfile | null>(
  DEMO_PRODUCTS.map((row) => [row.externalId, row.diets]),
);

/** Allergens by product id, `null` carried through — see `DemoProductRow`. */
export function demoAllergensFor(productId: string): readonly Allergen[] | null {
  assertDemoCatalogueAllowed();
  return ALLERGENS_BY_ID.get(productId) ?? null;
}

/** Dietary verdicts by product id. Absent and null are both "they did not say". */
export function demoDietsFor(productId: string): ProductDietaryProfile | null {
  assertDemoCatalogueAllowed();
  return DIETS_BY_ID.get(productId) ?? null;
}

export class DemoCatalogueAdapter implements CatalogueAdapter {
  readonly merchantId = MERCHANT_ID;

  constructor() {
    assertDemoCatalogueAllowed();
  }

  getMerchant(): Promise<Merchant> {
    return Promise.resolve(DEMO_MERCHANT_SNAPSHOT);
  }

  listLocations(options?: { readonly city?: string }): Promise<readonly MerchantLocation[]> {
    const only = DEMO_LOCATION_SNAPSHOT;
    if (options?.city && options.city !== only.city) return Promise.resolve([]);
    return Promise.resolve([only]);
  }

  searchProducts(query: ProductQuery): Promise<readonly MerchantProduct[]> {
    const term = query.term.trim().toLowerCase();
    if (!term) return Promise.resolve([]);

    const matches = [...PRODUCTS_BY_ID.values()]
      .filter((product) => product.isActive)
      .filter(
        (product) =>
          product.name.toLowerCase().includes(term) ||
          (product.nameAr ?? '').includes(query.term.trim()),
      )
      // Stable ordering, so the same search twice looks the same twice.
      .sort((a, b) => a.id.localeCompare(b.id));

    return Promise.resolve(matches.slice(0, query.limit ?? 20));
  }

  getProducts(productIds: readonly string[]): Promise<readonly MerchantProduct[]> {
    const found = productIds
      .map((id) => PRODUCTS_BY_ID.get(id))
      .filter((product): product is MerchantProduct => product !== undefined);
    return Promise.resolve(found);
  }

  checkAvailability(
    _locationId: string,
    productIds: readonly string[],
  ): Promise<Readonly<Record<string, Availability>>> {
    const out: Record<string, Availability> = {};
    for (const id of productIds) {
      out[id] = PRODUCTS_BY_ID.get(id)?.availability ?? 'unknown';
    }
    return Promise.resolve(out);
  }
}

/**
 * Candidates for one canonical ingredient, ready for `sourceLine`.
 *
 * Blocked mappings are INCLUDED here and filtered by the sourcing engine
 * rather than hidden at the source. The engine owns the exclusion rules, and
 * hiding a blocked row here would mean two places decide what is buyable —
 * which is how one of them ends up disagreeing.
 */
export function demoCandidatesFor(ingredientSlug: string): readonly SourcingCandidateInput[] {
  assertDemoCatalogueAllowed();

  const out: SourcingCandidateInput[] = [];
  for (const row of DEMO_MAPPINGS) {
    if (row.ingredientSlug !== ingredientSlug) continue;
    const product = PRODUCTS_BY_ID.get(row.productExternalId);
    if (!product) continue;

    out.push({
      product,
      mapping: toMapping(row),
      // `?? []` would be wrong here and dangerously so: it would turn "the
      // merchant published nothing" into "the merchant declared none". The
      // map already holds null for that case and null is what must travel.
      productAllergens: ALLERGENS_BY_ID.get(row.productExternalId) ?? null,
      // `?? null` for the same reason again: an id the map does not hold and a
      // merchant who published nothing are both "we do not know".
      productDiets: DIETS_BY_ID.get(row.productExternalId) ?? null,
    });
  }
  return out;
}
