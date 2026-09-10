import type {
  Availability,
  CountryCode,
  CurrencyCode,
  Money,
  ShoppingListItem,
  Unit,
} from '@/types/domain';

/**
 * The grocery-provider abstraction.
 *
 * The application must never be shaped around one supermarket. Everything the
 * app knows about stores goes through this interface, so adding Carrefour,
 * Talabat Mart, Breadfast or Instashop is a new file in `providers/` plus a
 * registration — no screen, no engine and no database column changes.
 *
 * NO REAL PROVIDER IS IMPLEMENTED, and no fake endpoints exist. Each one needs
 * a commercial agreement before credentials can be issued; see
 * PROJECT_STATUS.md § Required credentials. V1 registers the mock only, and it
 * is unreachable in production builds.
 */

export type StoreProduct = {
  /** Provider-scoped product id. */
  id: string;
  storeId: string;
  sku: string | null;
  name: string;
  brand: string | null;
  /** Pack size, e.g. 1 kg. Used to compare a recipe amount against a pack. */
  packQuantity: number | null;
  packUnit: Unit | null;
  /**
   * LIVE price. Distinct from an estimate at the type level so the two cannot
   * be confused downstream — `PricedAmount.source` carries the distinction.
   */
  price: Money;
  availability: Availability;
  imageUrl: string | null;
  /** When this price was read from the store. */
  fetchedAt: string;
};

export type Store = {
  id: string;
  providerId: string;
  name: string;
  country: CountryCode;
  city: string | null;
  /** Delivery fee, when the provider quotes one before checkout. */
  deliveryFee: Money | null;
  estimatedDeliveryMinutes: number | null;
};

export type ProductMatch = {
  product: StoreProduct;
  /** 0–1. Below `MATCH_CONFIRM_THRESHOLD` the user confirms it themselves. */
  confidence: number;
  /** Why we think it matches — shown when asking the user to confirm. */
  reason: 'exact_sku' | 'name_match' | 'category_fallback';
};

/** Below this, a match is offered as a suggestion rather than applied. */
export const MATCH_CONFIRM_THRESHOLD = 0.75;

export type CartLine = {
  productId: string;
  quantity: number;
  /** The shopping list item this line came from, for reconciliation. */
  sourceItemId: string;
};

export type Cart = {
  id: string;
  storeId: string;
  lines: CartLine[];
  subtotal: Money;
  deliveryFee: Money | null;
  total: Money;
  /** Lines the store could not fulfil, with substitutes where offered. */
  unavailable: { sourceItemId: string; substitutes: StoreProduct[] }[];
};

export type CheckoutResult =
  /** The provider handled payment; we have an order to track. */
  | { kind: 'completed'; orderId: string }
  /** The provider wants the user in their own app or web checkout. */
  | { kind: 'handoff'; url: string; orderId: string | null };

export type OrderStatus = {
  orderId: string;
  state: 'pending' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled';
  etaMinutes: number | null;
  updatedAt: string;
};

export type CatalogueQuery = {
  storeId: string;
  term: string;
  limit?: number;
};

/**
 * What every grocery integration must provide.
 *
 * Methods are intentionally granular: a provider that only supports a deep-link
 * handoff implements `createCart` and `checkout` and throws
 * `GroceryUnsupportedError` for order tracking, rather than the app assuming
 * every provider does everything.
 */
export interface GroceryProvider {
  readonly id: string;
  readonly displayName: string;
  readonly country: CountryCode;
  readonly currency: CurrencyCode;
  /** False until a commercial agreement and credentials exist. */
  readonly isEnabled: boolean;

  listStores(options?: { city?: string }): Promise<Store[]>;
  searchCatalogue(query: CatalogueQuery): Promise<StoreProduct[]>;

  /** Best product for a shopping-list line, or null when nothing matches. */
  matchItem(item: ShoppingListItem, storeId: string): Promise<ProductMatch | null>;

  checkAvailability(storeId: string, productIds: string[]): Promise<Record<string, Availability>>;

  createCart(storeId: string, lines: CartLine[]): Promise<Cart>;
  checkout(cartId: string): Promise<CheckoutResult>;
  getOrderStatus(orderId: string): Promise<OrderStatus>;
}

/** Thrown by a provider that does not implement an optional capability. */
export class GroceryUnsupportedError extends Error {
  constructor(
    readonly providerId: string,
    readonly capability: string,
  ) {
    super(`${providerId} does not support ${capability}`);
    this.name = 'GroceryUnsupportedError';
  }
}
