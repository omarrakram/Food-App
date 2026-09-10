import { buildShoppingItem, LOCAL_LIST_ID } from '@/features/shopping/repository';

import { MockGroceryProvider } from '../mock-provider';
import { GroceryUnsupportedError, MATCH_CONFIRM_THRESHOLD } from '../provider';
import { allProviders, enabledProvidersFor, getProvider, isOrderingAvailable } from '../registry';

describe('registry', () => {
  it('registers the mock provider', () => {
    expect(getProvider('mock')).toBeInstanceOf(MockGroceryProvider);
    expect(allProviders().length).toBeGreaterThan(0);
  });

  it('exposes NO enabled provider — ordering is not live', () => {
    // Two gates guard this: the feature flag and the provider's own
    // isEnabled. Both are off, so neither alone can expose ordering.
    expect(enabledProvidersFor('EG')).toHaveLength(0);
    expect(isOrderingAvailable('EG')).toBe(false);
  });

  it('returns null for an unknown provider rather than throwing', () => {
    expect(getProvider('carrefour-eg')).toBeNull();
  });
});

describe('MockGroceryProvider', () => {
  const provider = new MockGroceryProvider();

  it('is never enabled', () => {
    // A development mock must not be selectable in production, whatever the
    // feature flag says.
    expect(provider.isEnabled).toBe(false);
  });

  it('names its store so nobody mistakes it for a real one', async () => {
    const stores = await provider.listStores();
    expect(stores[0]?.name).toMatch(/mock/i);
  });

  it('searches the catalogue by ingredient name', async () => {
    const results = await provider.searchCatalogue({ storeId: 'mock-store-1', term: 'tomatoes' });
    expect(results[0]?.name).toBe('tomatoes');
  });

  it('returns nothing for an unknown term', async () => {
    const results = await provider.searchCatalogue({
      storeId: 'mock-store-1',
      term: 'dragonfruit marmalade',
    });
    expect(results).toHaveLength(0);
  });

  it('matches a shopping list item with a confidence score', async () => {
    const item = buildShoppingItem({ name: 'rice', quantity: 1, unit: 'kg' }, LOCAL_LIST_ID);
    const match = await provider.matchItem(item, 'mock-store-1');

    expect(match).not.toBeNull();
    expect(match?.confidence).toBeGreaterThanOrEqual(MATCH_CONFIRM_THRESHOLD);
    expect(match?.product.price.currency).toBe('EGP');
  });

  it('returns no match for an ingredient it cannot resolve', async () => {
    const item = buildShoppingItem({ name: 'dragonfruit marmalade' }, LOCAL_LIST_ID);
    expect(await provider.matchItem(item, 'mock-store-1')).toBeNull();
  });

  it('reports availability deterministically', async () => {
    const first = await provider.checkAvailability('mock-store-1', ['rice', 'milk']);
    const second = await provider.checkAvailability('mock-store-1', ['rice', 'milk']);

    expect(first).toEqual(second);
  });

  it('builds a cart, separating out what the store cannot fulfil', async () => {
    const cart = await provider.createCart('mock-store-1', [
      { productId: 'rice', quantity: 2, sourceItemId: 'item-1' },
      { productId: 'milk', quantity: 1, sourceItemId: 'item-2' },
    ]);

    expect(cart.storeId).toBe('mock-store-1');
    expect(cart.lines.length + cart.unavailable.length).toBe(2);
    expect(cart.total.amountMinor).toBe(
      cart.subtotal.amountMinor + (cart.deliveryFee?.amountMinor ?? 0),
    );
  });

  it('REFUSES to checkout — a mock must never imply an order was placed', async () => {
    await expect(provider.checkout()).rejects.toBeInstanceOf(GroceryUnsupportedError);
  });

  it('refuses order tracking for the same reason', async () => {
    await expect(provider.getOrderStatus()).rejects.toBeInstanceOf(GroceryUnsupportedError);
  });
});
