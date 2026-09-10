import { resolveIngredient } from '@/features/ingredients/matching';
import { normaliseIngredientName } from '@/features/ingredients/normalise';
import { priceBookFor } from '@/features/pricing/price-book';
import { money } from '@/lib/format/money';
import type { Availability, ShoppingListItem } from '@/types/domain';

import {
  GroceryUnsupportedError,
  MATCH_CONFIRM_THRESHOLD,
  type Cart,
  type CartLine,
  type CatalogueQuery,
  type CheckoutResult,
  type GroceryProvider,
  type OrderStatus,
  type ProductMatch,
  type Store,
  type StoreProduct,
} from './provider';

/**
 * Development-only provider.
 *
 * Exists so the adapter layer can be exercised end to end — matching, cart
 * building, availability — without a real integration. It is NOT a fake API:
 * it serves obviously-synthetic data from the bundled price book, its store is
 * named so no one mistakes it for a real one, and `isEnabled` is false so it
 * cannot be selected in a production build.
 *
 * Every real provider replaces this file's shape, not the code that calls it.
 */

const MOCK_STORE: Store = {
  id: 'mock-store-1',
  providerId: 'mock',
  name: 'Development Mock Store (not a real shop)',
  country: 'EG',
  city: 'Cairo',
  deliveryFee: money(2500, 'EGP'),
  estimatedDeliveryMinutes: 45,
};

/** Deterministic pseudo-availability, so tests and demos are reproducible. */
function availabilityFor(productId: string): Availability {
  const hash = [...productId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const bucket = hash % 10;
  if (bucket === 0) return 'out_of_stock';
  if (bucket === 1) return 'low_stock';
  return 'in_stock';
}

export class MockGroceryProvider implements GroceryProvider {
  readonly id = 'mock';
  readonly displayName = 'Development Mock Store';
  readonly country = 'EG' as const;
  readonly currency = 'EGP' as const;
  /** Never true. A real provider is enabled by configuration, not by code. */
  readonly isEnabled = false;

  async listStores(): Promise<Store[]> {
    return [MOCK_STORE];
  }

  async searchCatalogue(query: CatalogueQuery): Promise<StoreProduct[]> {
    const term = normaliseIngredientName(query.term);
    if (!term) return [];

    const ingredient = resolveIngredient(query.term);
    if (!ingredient) return [];

    return [this.productFor(ingredient.slug, ingredient.name)];
  }

  async matchItem(item: ShoppingListItem, storeId: string): Promise<ProductMatch | null> {
    const ingredient = resolveIngredient(item.name);
    if (!ingredient) return null;

    const product = this.productFor(ingredient.slug, ingredient.name, storeId);

    // An exact catalogue resolution is high confidence; anything looser would
    // be offered to the user for confirmation rather than applied silently.
    return {
      product,
      confidence: 0.9,
      reason: 'name_match',
    };
  }

  async checkAvailability(
    _storeId: string,
    productIds: string[],
  ): Promise<Record<string, Availability>> {
    return Object.fromEntries(productIds.map((id) => [id, availabilityFor(id)]));
  }

  async createCart(storeId: string, lines: CartLine[]): Promise<Cart> {
    const products = new Map<string, StoreProduct>();
    for (const line of lines) {
      products.set(line.productId, this.productFor(line.productId, line.productId, storeId));
    }

    const available: CartLine[] = [];
    const unavailable: Cart['unavailable'] = [];

    for (const line of lines) {
      const product = products.get(line.productId);
      if (product && product.availability !== 'out_of_stock') available.push(line);
      else unavailable.push({ sourceItemId: line.sourceItemId, substitutes: [] });
    }

    const subtotalMinor = available.reduce((sum, line) => {
      const product = products.get(line.productId);
      return sum + (product ? product.price.amountMinor * line.quantity : 0);
    }, 0);

    const deliveryFee = MOCK_STORE.deliveryFee;

    return {
      id: `mock-cart-${storeId}`,
      storeId,
      lines: available,
      subtotal: money(subtotalMinor, 'EGP'),
      deliveryFee,
      total: money(subtotalMinor + (deliveryFee?.amountMinor ?? 0), 'EGP'),
      unavailable,
    };
  }

  async checkout(): Promise<CheckoutResult> {
    // A mock must never look like it took an order. Refusing here is what
    // stops a development build from implying a purchase happened.
    throw new GroceryUnsupportedError(this.id, 'checkout');
  }

  async getOrderStatus(): Promise<OrderStatus> {
    throw new GroceryUnsupportedError(this.id, 'order tracking');
  }

  /**
   * Builds a product from the bundled price estimates.
   *
   * The figures come from the same estimate data the app already shows, so the
   * mock cannot accidentally imply it knows a real shelf price.
   */
  private productFor(id: string, name: string, storeId = MOCK_STORE.id): StoreProduct {
    const book = priceBookFor('EG', 'EGP');
    const quote = book.quote(name);

    return {
      id,
      storeId,
      sku: `MOCK-${id.toUpperCase()}`,
      name,
      brand: 'Mock Brand',
      packQuantity: quote?.quantity ?? 1,
      packUnit: quote?.unit ?? null,
      price: money(quote?.amountMinor ?? 0, 'EGP'),
      availability: availabilityFor(id),
      imageUrl: null,
      fetchedAt: new Date().toISOString(),
    };
  }
}

export { MATCH_CONFIRM_THRESHOLD };
