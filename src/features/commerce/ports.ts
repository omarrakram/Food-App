import type {
  Cart,
  IngredientProductMapping,
  Merchant,
  MerchantFulfilmentMode,
  MerchantLocation,
  MerchantProduct,
  Order,
} from '@/types/commerce';
import type { Availability, Unit } from '@/types/domain';

/**
 * The commerce ports.
 *
 * `features/grocery/provider.ts` — which this supersedes — put catalogue
 * lookup and order placement behind ONE interface, and it had to, because it
 * assumed the retailer owned the cart, the checkout and the money. Under
 * Model 2 AKALT owns all three, so the two halves now have genuinely different
 * owners and genuinely different lifetimes, and they are split accordingly:
 *
 *   CatalogueAdapter  — READ. What does this merchant sell, for how much, and
 *                       is it in stock? Every merchant needs one.
 *
 *   FulfilmentAdapter — WRITE. How does a placed order reach the people who
 *                       will pick it? V1 answers "it appears in our own
 *                       dashboard"; a later partner answers "we POST it".
 *
 * THIS SPLIT IS THE B2B OPTION. If AKALT is ever licensed into Breadfast,
 * Rabbit or a retailer's own app, what they buy is the food intelligence plus
 * a `CatalogueAdapter` against their catalogue — and their checkout, their
 * money and their order system stay theirs. Nothing above this line knows
 * whose till the basket ends up in. Keeping `FulfilmentAdapter` separate is
 * what makes that a configuration change rather than a rewrite.
 */

// --- The contract food intelligence speaks ---------------------------------

/**
 * One thing the cook needs, in AKALT's vocabulary.
 *
 * Note what is NOT here: no merchant, no SKU, no price, no store id. This is
 * the output of the recipe/pantry engines and it must stay purchasable-
 * anywhere. The moment a recipe references a SKU, the food intelligence stops
 * being licensable and starts being one supermarket's inventory system.
 */
export type SourcingLine = {
  readonly ingredientSlug: string;
  /** How much the recipe calls for. Null when the recipe does not quantify. */
  readonly quantity: number | null;
  readonly unit: Unit | null;
  /** Which recipe asked for it, so the cart can explain itself. */
  readonly sourceRecipeId: string | null;
};

export type SourcingRequest = {
  readonly lines: readonly SourcingLine[];
  readonly merchantId: string;
  readonly locationId: string;
};

export type ProductCandidate = {
  readonly product: MerchantProduct;
  readonly mapping: IngredientProductMapping;
  /**
   * How many packs cover the requested amount.
   *
   * Null when we cannot tell — an unquantified recipe line, or a pack whose
   * unit does not convert. A null here means "ask the user", never "assume 1".
   */
  readonly packsNeeded: number | null;
  /** Deterministic score. Explained by `reasons`, never by a model. */
  readonly score: number;
  readonly reasons: readonly string[];
};

export const SOURCING_STATUSES = [
  /** A confident mapping exists and it is in stock. */
  'matched',
  /** Candidates exist but none clears the confidence bar. The user chooses. */
  'needs_confirmation',
  /** Mapped, but the merchant has none right now. */
  'out_of_stock',
  /** No mapping exists for this ingredient at this merchant. */
  'unmapped',
] as const;
export type SourcingStatus = (typeof SOURCING_STATUSES)[number];

export type SourcedLine = {
  readonly requested: SourcingLine;
  readonly status: SourcingStatus;
  /** Ranked best-first. Empty when `unmapped`. */
  readonly candidates: readonly ProductCandidate[];
  /** Non-null only when `status === 'matched'`. */
  readonly chosen: ProductCandidate | null;
};

export type SourcingResult = {
  readonly merchantId: string;
  readonly locationId: string;
  readonly lines: readonly SourcedLine[];
  /** Lines the user must resolve before checkout can proceed. */
  readonly unresolvedCount: number;
};

// --- Read side -------------------------------------------------------------

export type ProductQuery = {
  readonly locationId: string;
  readonly term: string;
  readonly limit?: number;
};

export interface CatalogueAdapter {
  readonly merchantId: string;

  getMerchant(): Promise<Merchant>;
  listLocations(options?: { readonly city?: string }): Promise<readonly MerchantLocation[]>;
  searchProducts(query: ProductQuery): Promise<readonly MerchantProduct[]>;
  getProducts(productIds: readonly string[]): Promise<readonly MerchantProduct[]>;

  /**
   * Fresh stock state, read as late as possible.
   *
   * Called again at checkout rather than trusted from when the line was added:
   * a cart built twenty minutes ago is a statement about the past, and the
   * difference between the two is what the customer needs to be told about
   * BEFORE they pay, not after somebody has been sent to pick it.
   */
  checkAvailability(
    locationId: string,
    productIds: readonly string[],
  ): Promise<Readonly<Record<string, Availability>>>;
}

// --- Write side ------------------------------------------------------------

export type OrderSubmission =
  /** The merchant now has it — in their dashboard queue, or via their API. */
  | { readonly kind: 'accepted_for_fulfilment'; readonly merchantReference: string | null }
  /** The merchant cannot take it at all right now (closed, outside area). */
  | { readonly kind: 'refused'; readonly reason: string }
  /**
   * The partner runs their own checkout and wants the customer in their app.
   *
   * Unreachable under Model 2 and present for the B2B shape only. An adapter
   * that returns this must never be paired with an AKALT-captured payment —
   * that would take the customer's money twice.
   */
  | { readonly kind: 'handoff'; readonly url: string };

export interface FulfilmentAdapter {
  readonly merchantId: string;
  readonly mode: MerchantFulfilmentMode;

  /**
   * Hand a PAID order to whoever will pick it.
   *
   * The order already exists and is already paid for when this is called —
   * `canEnterMerchantQueue` is the gate. This method does not create an order
   * and cannot fail it into existence.
   */
  submitOrder(order: Order): Promise<OrderSubmission>;

  /**
   * Pull status for adapters that cannot push it.
   *
   * Optional, and absent on the V1 dashboard adapter: a merchant clicking
   * "Ready" in our own dashboard writes our own row, so there is nothing to
   * poll. An `api` partner that will not call our webhook needs this.
   */
  fetchStatus?(order: Order): Promise<Order['fulfilment']>;
}

/** Thrown by an adapter asked for a capability it genuinely does not have. */
export class CommerceUnsupportedError extends Error {
  constructor(
    readonly merchantId: string,
    readonly capability: string,
  ) {
    super(`${merchantId} does not support ${capability}`);
    this.name = 'CommerceUnsupportedError';
  }
}

// --- Cart validation -------------------------------------------------------

export type CartValidationIssue =
  | { readonly kind: 'out_of_stock'; readonly lineId: string }
  | {
      readonly kind: 'price_changed';
      readonly lineId: string;
      readonly fromMinor: number;
      readonly toMinor: number;
    }
  | { readonly kind: 'delisted'; readonly lineId: string }
  | { readonly kind: 'below_minimum'; readonly shortfallMinor: number };

/**
 * What checkout must run before taking money.
 *
 * Separate from the cart itself because it needs a live catalogue read, and
 * because the ANSWER is a thing the user has to see and agree to. A cart that
 * quietly re-prices itself between the shelf and the till is the most common
 * complaint levelled at every grocery app in this market, and the fix is
 * showing the difference rather than absorbing it.
 */
export type CartValidation = {
  readonly cart: Cart;
  readonly issues: readonly CartValidationIssue[];
  readonly canCheckout: boolean;
};
