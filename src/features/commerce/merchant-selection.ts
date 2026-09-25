import { env } from '@/lib/config/env';
import type { MerchantLocation, ProductDietaryProfile, PublicMerchant } from '@/types/commerce';
import type { Allergen, CountryCode } from '@/types/domain';

import {
  DEMO_LOCATION_SNAPSHOT,
  DEMO_MERCHANT_SNAPSHOT,
  DemoCatalogueAdapter,
  demoAllergensFor,
  demoCandidatesFor,
  demoDietsFor,
} from './demo-adapter';
import type { CatalogueAdapter } from './ports';
import type { SourcingCandidateInput } from './sourcing';

/**
 * Which merchant, and which branch of it.
 *
 * V1 has one merchant, and that is exactly why this exists. An implicit
 * "the merchant" threaded through the app as an assumption is very cheap to
 * write and very expensive to unwind, and every one of the things that will
 * eventually differ already differs per BRANCH, not per chain:
 *
 *   catalogue · stock · delivery area · price · delivery fee · minimum order
 *
 * So sourcing, carts and orders all take a merchant AND a location, from the
 * first line of code rather than from the refactor that follows the second
 * partner.
 *
 * WHAT CHANGED IN PILOT ENABLEMENT, and why it had to:
 *
 * This module used to be entirely static. `enabledPartnerFor()` returned null
 * unconditionally, so the ONLY thing the app could ever select was the bundled
 * development catalogue — which ships `isAcceptingOrders: false` precisely so
 * that no build can order from it. A real supermarket's rows could exist in
 * `merchants` and `merchant_locations`, with RLS, pricing and fulfilment all
 * reading them, and no client code path could reach them. That was blocker B1
 * in PILOT_READINESS.md and it made a pilot impossible.
 *
 * Selecting a merchant is now a READ, which means it is asynchronous, which is
 * the one thing that could not stay the same. Everything downstream already
 * takes a merchant and a location as arguments, so the change stops here.
 *
 * THE TWO SOURCES ARE MUTUALLY EXCLUSIVE AND THE DATABASE WINS. A real
 * enabled merchant, if there is one, is always preferred; the bundled fixture
 * is a development fallback and refuses to construct in a production build.
 */

/**
 * Candidates for the slugs that were asked about, indexed by slug.
 *
 * A MAP RATHER THAN A FUNCTION, because a real catalogue is not in memory. The
 * demo fixture could answer `candidatesFor('cream')` synchronously from a
 * bundled array; a supermarket with forty thousand SKUs cannot, and pretending
 * otherwise would mean either loading the whole shelf into the app or making
 * one round trip per ingredient.
 *
 * A slug with no mapping is ABSENT rather than empty, and callers read it as
 * an empty list — which is the same answer the bundled version gave.
 */
export type CandidateIndex = ReadonlyMap<string, readonly SourcingCandidateInput[]>;

/**
 * What the merchant has published about a product's safety.
 *
 * NULL IS NOT `[]`. An empty allergen array is the merchant saying "none"; null
 * is nobody having said anything, and the two must never be collapsed — see
 * `SourcingCandidateInput.productAllergens`. A product missing from this index
 * is UNKNOWN on both axes, which is the safe direction.
 */
export type ProductSafety = {
  readonly allergens: readonly Allergen[] | null;
  readonly diets: ProductDietaryProfile | null;
};
export type SafetyIndex = ReadonlyMap<string, ProductSafety>;

export const UNKNOWN_SAFETY: ProductSafety = { allergens: null, diets: null };

export type SelectedMerchant = {
  /**
   * The CUSTOMER-FACING subset, deliberately.
   *
   * A guest reaches this through `public_merchants`, a view whose columns are
   * exactly these. Typing it as the full `Merchant` would have compiled, and
   * would have meant every screen could reach for a commission rate that the
   * public path cannot supply — so the narrow type is the boundary, stated
   * where the compiler can hold it.
   */
  readonly merchant: PublicMerchant;
  readonly location: MerchantLocation;
  readonly catalogue: CatalogueAdapter;
  /** Candidate products for these canonical ingredients at this branch. */
  readonly candidatesFor: (slugs: readonly string[]) => Promise<CandidateIndex>;
  /**
   * Published safety metadata by product id, for revalidation.
   *
   * Sourcing reaches these through a candidate; revalidation starts from a
   * cart line and has only a product id, so the same facts have to be
   * reachable that way too.
   */
  readonly safetyFor: (productIds: readonly string[]) => Promise<SafetyIndex>;
  /**
   * True when this is the development catalogue rather than a partner.
   *
   * Every commerce screen reads it and badges itself. A demo basket that looks
   * like a real one is the failure the flag exists to prevent, and a banner is
   * the only part of that guarantee the user can actually see.
   */
  readonly isDemo: boolean;
};

/**
 * The development catalogue, when it is allowed and asked for.
 *
 * Three gates, all of which must pass: the flag is set, the build is not
 * production (both enforced by `env.useDemoMerchantCatalogue`), and the
 * country is Egypt — because the fixture is a Cairo branch and putting it in
 * front of somebody in London would be a lie about coverage rather than a
 * fixture.
 */
export function demoMerchant(country: CountryCode): SelectedMerchant | null {
  if (!env.useDemoMerchantCatalogue) return null;
  if (country !== 'EG') return null;

  const catalogue = new DemoCatalogueAdapter();

  return {
    merchant: DEMO_MERCHANT_SNAPSHOT,
    location: DEMO_LOCATION_SNAPSHOT,
    catalogue,
    candidatesFor: async (slugs) => {
      const index = new Map<string, readonly SourcingCandidateInput[]>();
      for (const slug of slugs) {
        const candidates = demoCandidatesFor(slug);
        if (candidates.length > 0) index.set(slug, candidates);
      }
      return index;
    },
    safetyFor: async (productIds) => {
      const index = new Map<string, ProductSafety>();
      for (const id of productIds) {
        index.set(id, { allergens: demoAllergensFor(id), diets: demoDietsFor(id) });
      }
      return index;
    },
    isDemo: true,
  };
}

/**
 * Whether the demo catalogue could be offered at all.
 *
 * Synchronous and cheap, because it reads only build configuration. It is NOT
 * an answer to "can this person order" — a real merchant may be reachable when
 * this is false, and that question needs a database read.
 */
export function isDemoCatalogueAvailable(country: CountryCode): boolean {
  return env.useDemoMerchantCatalogue && country === 'EG';
}
