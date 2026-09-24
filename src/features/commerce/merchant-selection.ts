import { env } from '@/lib/config/env';
import type { Merchant, MerchantLocation } from '@/types/commerce';
import type { CountryCode } from '@/types/domain';

import {
  DEMO_LOCATION_SNAPSHOT,
  DEMO_MERCHANT_SNAPSHOT,
  DemoCatalogueAdapter,
  demoCandidatesFor,
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
 */

export type SelectedMerchant = {
  readonly merchant: Merchant;
  readonly location: MerchantLocation;
  readonly catalogue: CatalogueAdapter;
  /** Candidate products for one canonical ingredient at this branch. */
  readonly candidatesFor: (ingredientSlug: string) => readonly SourcingCandidateInput[];
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
 * Real partners, when there are any.
 *
 * There are none: no agreement has been signed, so no merchant row is enabled
 * and this returns empty. It is written out rather than left as a TODO because
 * the shape of the check — enabled merchant AND a branch accepting orders in
 * the right country — is the thing that must be true before a real order is
 * possible, and `isOrderingAvailable` has to ask it either way.
 */
function enabledPartnerFor(_country: CountryCode): SelectedMerchant | null {
  if (!env.enableGroceryOrdering) return null;
  return null;
}

/**
 * The branch to source against, or null when ordering is not possible.
 *
 * Demo is deliberately NOT gated behind `enableGroceryOrdering`. That flag
 * guards a real commercial integration; `useDemoMerchantCatalogue` already
 * requires an explicit opt-in AND a non-production build, so it is its own
 * gate and adding a second one would only mean a developer setting two
 * variables to see a fixture.
 */
export function selectMerchant(country: CountryCode): SelectedMerchant | null {
  const partner = enabledPartnerFor(country);
  if (partner) return partner;

  if (!env.useDemoMerchantCatalogue) return null;
  // The demo catalogue is Egypt-only, and pretending otherwise would put a
  // Cairo branch in front of somebody in London.
  if (country !== 'EG') return null;

  const catalogue = new DemoCatalogueAdapter();
  return {
    merchant: DEMO_MERCHANT_SNAPSHOT,
    location: DEMO_LOCATION_SNAPSHOT,
    catalogue,
    candidatesFor: demoCandidatesFor,
    isDemo: true,
  };
}

/** Whether the commerce entry points can do anything. */
export function isOrderingAvailable(country: CountryCode): boolean {
  return selectMerchant(country) !== null;
}
