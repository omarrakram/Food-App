import { env } from '@/lib/config/env';
import type { CountryCode } from '@/types/domain';

import { MockGroceryProvider } from './mock-provider';
import type { GroceryProvider } from './provider';

/**
 * Provider registry.
 *
 * The single place that knows which integrations exist. Adding a supermarket
 * is a registration here plus a file in this directory — nothing else in the
 * app names a supermarket.
 *
 * Real providers are absent by design: each needs a commercial agreement and
 * credentials before it can be written. See PROJECT_STATUS.md § Required
 * credentials for the list and what obtaining them involves.
 */

const registry = new Map<string, GroceryProvider>();

export function registerProvider(provider: GroceryProvider): void {
  registry.set(provider.id, provider);
}

// Development only, and `isEnabled` is false, so `enabledProvidersFor` never
// returns it. Registered so the adapter layer can be exercised in tests.
registerProvider(new MockGroceryProvider());

export function getProvider(id: string): GroceryProvider | null {
  return registry.get(id) ?? null;
}

export function allProviders(): GroceryProvider[] {
  return [...registry.values()];
}

/**
 * Providers a user in `country` can actually order from.
 *
 * Requires BOTH the feature flag and the provider's own enabled state, so a
 * flag flipped early cannot expose a half-finished integration.
 */
export function enabledProvidersFor(country: CountryCode): GroceryProvider[] {
  if (!env.enableGroceryOrdering) return [];
  return allProviders().filter(
    (provider) => provider.isEnabled && provider.country === country,
  );
}

/** Whether the "Order ingredients" action can do anything yet. */
export function isOrderingAvailable(country: CountryCode): boolean {
  return enabledProvidersFor(country).length > 0;
}
