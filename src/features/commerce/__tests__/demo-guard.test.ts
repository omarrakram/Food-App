/**
 * The demo catalogue cannot reach a real customer.
 *
 * `data/commerce-demo/` is a development fixture. The worst outcome available
 * to this layer is a fixture that reaches production and reads as a real
 * partner, so there are four separate things standing in the way and this file
 * asserts the runtime one:
 *
 *   1. `env.useDemoMerchantCatalogue` requires an explicit flag AND a
 *      non-production build — the same shape as `env.demoMode`.
 *   2. EVERY entry point calls `assertDemoCatalogueAllowed()`, so there is no
 *      bare function that skips the class.
 *   3. The merchant row is `isDemo: true` and `isEnabled: false`, checked by
 *      `scripts/__tests__/commerce-demo-isolation.test.ts`.
 *   4. Nothing outside `features/commerce` may import the generated file, also
 *      checked there.
 *
 * It THROWS rather than returning an empty catalogue. An empty catalogue in
 * production looks exactly like a merchant with nothing in stock — the one
 * failure mode nobody would investigate.
 */

jest.mock('@/lib/config/env', () => ({
  env: { useDemoMerchantCatalogue: false, isProduction: true },
}));

/* eslint-disable import/first --
 * `jest.mock` is hoisted above imports by the transform, so the mock has to be
 * written above them too or it reads as replacing a module that was already
 * loaded. The lint rule cannot see the hoist.
 */
import {
  DemoCatalogueAdapter,
  DemoCatalogueUnavailableError,
  assertDemoCatalogueAllowed,
  demoCandidatesFor,
} from '../demo-adapter';

describe('with the demo catalogue disabled', () => {
  it('refuses to construct the adapter', () => {
    expect(() => new DemoCatalogueAdapter()).toThrow(DemoCatalogueUnavailableError);
  });

  it('refuses the bare candidate lookup too', () => {
    // The route that a guard on the class alone would leave open.
    expect(() => demoCandidatesFor('chicken-breast')).toThrow(DemoCatalogueUnavailableError);
  });

  it('refuses rather than returning nothing', () => {
    // An empty list would be indistinguishable from a merchant that is out of
    // everything, and nobody raises a ticket about that.
    expect(() => assertDemoCatalogueAllowed()).toThrow(DemoCatalogueUnavailableError);
  });

  it('says how to turn it on, so the failure is actionable', () => {
    expect(() => assertDemoCatalogueAllowed()).toThrow(/EXPO_PUBLIC_DEMO_MERCHANT/);
  });
});
