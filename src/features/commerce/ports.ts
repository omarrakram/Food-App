import type {
  Cart,
  IngredientProductMapping,
  PublicMerchant,
  MerchantFulfilmentMode,
  MerchantLocation,
  MerchantProduct,
  Order,
} from '@/types/commerce';
import type { Availability, Unit } from '@/types/domain';

/**
 * The commerce ports.
 *
 * The retired `features/grocery/provider.ts` put catalogue lookup and order
 * placement behind ONE interface, and it had to: it assumed the retailer owned
 * the cart, the checkout and the money. AKALT owns all three, so the two
 * halves have genuinely different owners and lifetimes, and they are split:
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
/**
 * How much of this is actually asked for.
 *
 * Recipes do not all speak in grams, and pretending they do is how a basket
 * ends up with a kilo of something the recipe wanted a pinch of. Each case
 * gets a name so the UI can say the honest sentence and the pack maths can
 * refuse to guess.
 */
export const REQUIREMENT_AMOUNTS = [
  /** A real number and a real unit: 500 g, 2 pieces. */
  'measured',
  /** "To taste." The cook needs some; nobody can say how much. */
  'to_taste',
  /** The recipe gives no amount at all. */
  'unspecified',
] as const;
export type RequirementAmount = (typeof REQUIREMENT_AMOUNTS)[number];

export type SourcingLine = {
  readonly ingredientSlug: string;
  /** Null unless `amount === 'measured'`. */
  readonly quantity: number | null;
  readonly unit: Unit | null;
  readonly amount: RequirementAmount;
  /** Which recipe asked for it, so the cart can explain itself. */
  readonly sourceRecipeId: string | null;
  /**
   * The CALLER'S handle for this line, echoed back on the result untouched.
   *
   * Sourcing never reads it. It exists because the slug is not a key: one
   * recipe can ask for tomatoes twice — fresh and tinned — and a screen that
   * paired results to rows by slug would put the tin under the fresh line.
   * Pairing by position would work today and break the first time either the
   * requirement builder or the sourcer stopped preserving order, and it would
   * break silently, by showing the right product under the wrong ingredient.
   *
   * Null when the caller has nothing to pair against.
   */
  readonly requestLineId: string | null;
};

export type SourcingRequest = {
  readonly lines: readonly SourcingLine[];
  readonly merchantId: string;
  readonly locationId: string;
};

/**
 * Why a candidate scored as it did.
 *
 * Stable codes rather than prose, so the UI translates them and the ranking
 * stays explainable in both languages. "We picked this because" is not a
 * nicety here: the whole reason no model chooses a SKU is that the choice has
 * to be auditable.
 */
export const CANDIDATE_REASONS = [
  // Mapping correctness — "is this SKU this ingredient?"
  'verified_mapping',
  'manual_mapping',
  'exact_sku_mapping',
  'name_match_mapping',
  'category_fallback_mapping',
  // Purchasability — "can anyone buy it?"
  'in_stock',
  'low_stock',
  'stock_unknown',
  'out_of_stock',
  // Eligibility — "may THIS user have it?"
  'dietary_eligible',
  'eligibility_unknown',
  // Fit and price
  'exact_quantity_fit',
  'smallest_overbuy',
  'overbuy',
  'pack_size_unknown',
  /** The recipe gave no amount, so one pack is the honest minimum. */
  'amount_unspecified',
  'lowest_effective_cost',
] as const;
export type CandidateReason = (typeof CANDIDATE_REASONS)[number];

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
  /** What this candidate actually costs: packs x unit price, in minor units. */
  readonly effectiveCostMinor: number | null;
  /** Deterministic integer score. Explained by `reasons`, never by a model. */
  readonly score: number;
  readonly reasons: readonly CandidateReason[];
};

/**
 * Five outcomes, because "we could not get you this" has four different
 * causes and they need four different sentences.
 *
 * Collapsing them was the first version's mistake: an ingredient whose only
 * product is out of stock came back `unmapped`, which reads as "we do not
 * stock this" when the truth is "we stock it and it has run out". One of
 * those is a catalogue gap for us to fix; the other is a Tuesday.
 */
export const SOURCING_STATUSES = [
  /** Trusted mapping, eligible for this user, and buyable right now. */
  'matched',
  /** Buyable candidates exist, but we are not sure enough to choose for them. */
  'needs_confirmation',
  /** Eligible mappings exist; none can be bought right now. */
  'no_purchasable_match',
  /** Mappings exist; every one is excluded for THIS user. */
  'no_eligible_match',
  /** No usable mapping exists for this ingredient at this merchant. */
  'unmapped',
] as const;
export type SourcingStatus = (typeof SOURCING_STATUSES)[number];

/**
 * THREE INDEPENDENT AXES, and keeping them apart is the point.
 *
 *   mapping        — does this SKU represent this ingredient?
 *   eligibility    — may THIS user receive it?
 *   purchasability — can anyone buy it right now?
 *
 * A manual or verified mapping is an assertion about the FIRST axis only. It
 * says a human confirmed that Brand X Milk 1L is milk. It says nothing about
 * whether this particular cook can have it, and nothing about whether the
 * merchant has any. Letting verification override the other two would mean a
 * hand-checked mapping could hand somebody an allergen.
 */
export const EXCLUSION_AXES = ['mapping', 'eligibility', 'purchasability'] as const;
export type ExclusionAxis = (typeof EXCLUSION_AXES)[number];

export const EXCLUSION_REASONS = [
  /** A human refused this mapping. Kept rather than deleted. */
  'blocked',
  /** Carries an allergen this user must avoid. */
  'allergen',
  /**
   * The merchant says this product is not compatible with a diet this user
   * keeps. A SEPARATE reason from `allergen`: one is a medical hazard and the
   * other is a commitment, they are refused for different reasons, and an
   * operator reading an exclusion log needs to know which.
   */
  'diet',
  /** The merchant has delisted it. */
  'delisted',
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export type CandidateExclusion = {
  readonly productId: string;
  readonly axis: ExclusionAxis;
  readonly reason: ExclusionReason;
};

export type SourcedLine = {
  readonly requested: SourcingLine;
  readonly status: SourcingStatus;
  /**
   * Ranked best-first, and only ever things this user could actually pick:
   * correctly mapped, eligible, and on the catalogue. Out-of-stock survivors
   * ARE listed, so the UI can say "usually this one, currently unavailable"
   * rather than pretending the ingredient was never mapped.
   */
  readonly candidates: readonly ProductCandidate[];
  /**
   * Non-null only when `status === 'matched'`.
   *
   * Never an out-of-stock product, whatever its mapping score. Relevance and
   * purchasability are different questions, and the strongest mapping in the
   * catalogue is still not something anybody can put in a bag.
   */
  readonly chosen: ProductCandidate | null;
  /** What was thrown out and on which axis. For debugging and for trust. */
  readonly exclusions: readonly CandidateExclusion[];
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

  /**
   * The merchant, as a CUSTOMER may see one.
   *
   * Narrowed from `Merchant` when the public catalogue surface landed: an
   * adapter reading `public_merchants` genuinely does not have the commission
   * rate, and a signature that claimed otherwise would have forced the one
   * honest implementation to invent numbers.
   */
  getMerchant(): Promise<PublicMerchant>;
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
  | { readonly kind: 'refused'; readonly reason: string };

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
