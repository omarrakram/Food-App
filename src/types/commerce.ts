/**
 * Commerce vocabulary.
 *
 * Separate from `domain.ts` on purpose. `domain.ts` is AKALT's FOOD
 * INTELLIGENCE: recipes, pantry, ingredients, matching, prices. This file is
 * the transaction layer that sits underneath it.
 *
 * THE DEPENDENCY POINTS ONE WAY ONLY. Food intelligence must never import
 * commerce; commerce may import food intelligence. `__tests__/layering.test.ts`
 * enforces it. That rule is what keeps the option open to license the food
 * intelligence into somebody else's checkout (Breadfast, Rabbit, an in-house
 * retailer app) without dragging our order system along with it.
 *
 * Two boundaries inside this file are load-bearing:
 *
 *   1. CANONICAL INGREDIENT vs MERCHANT PRODUCT. A recipe references
 *      `milk`. A merchant sells "Juhayna Full Cream Milk 1L". Recipes must
 *      never reference a SKU — `IngredientProductMapping` is the only bridge,
 *      and it is keyed by the canonical SLUG rather than a database id so the
 *      food layer never learns our primary keys.
 *
 *   2. FULFILMENT STATE vs PAYMENT STATE. Where the goods are and where the
 *      money is are different questions with different actors and different
 *      failure modes. Collapsing them is how an order ends up marked delivered
 *      and unpaid, or refunded and still being picked.
 */
import type {
  Availability,
  CountryCode,
  CurrencyCode,
  Money,
  Unit,
} from './domain';

// --- Actors ----------------------------------------------------------------

/**
 * Who caused a change.
 *
 * Recorded on every state transition and every adjustment. The state machines
 * check it: a merchant cannot cancel a delivered order and a customer cannot
 * mark one ready.
 */
export const COMMERCE_ACTORS = ['customer', 'merchant', 'akalt', 'system'] as const;
export type CommerceActor = (typeof COMMERCE_ACTORS)[number];

// --- Merchant --------------------------------------------------------------

/**
 * How orders reach a merchant.
 *
 * V1 ships `dashboard` only: the merchant works our own AKALT Merchant
 * Dashboard and moves the order along by hand. `api` and `handoff` are named
 * now because they change who owns the order record, which is a schema
 * question, not a UI one.
 */
export const MERCHANT_FULFILMENT_MODES = ['dashboard', 'api', 'handoff'] as const;
export type MerchantFulfilmentMode = (typeof MERCHANT_FULFILMENT_MODES)[number];

/** What AKALT's commission is charged on. A commercial term, so it is data. */
export const COMMISSION_BASES = ['goods', 'goods_and_delivery'] as const;
export type CommissionBasis = (typeof COMMISSION_BASES)[number];

export type Merchant = {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  country: CountryCode;
  currency: CurrencyCode;
  fulfilmentMode: MerchantFulfilmentMode;
  /**
   * Basis points, so 250 = 2.50%. An integer for the same reason money is an
   * integer: a rate stored as 0.025 drifts once it meets a rounding boundary.
   */
  commissionRateBasisPoints: number;
  commissionBasis: CommissionBasis;
  /**
   * Whether the merchant keeps the delivery fee the customer paid.
   *
   * They own the rider, so normally yes — but it is a term in the agreement,
   * not a law, and the settlement maths reads it.
   */
  merchantKeepsDeliveryFee: boolean;
  /** False until a signed agreement exists. Never default this to true. */
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MerchantLocation = {
  id: string;
  merchantId: string;
  /** The merchant's own identifier for this branch. */
  externalId: string;
  name: string;
  nameAr: string | null;
  city: string | null;
  /** Districts this branch delivers to. Empty means "not yet configured". */
  deliveryAreas: readonly string[];
  deliveryFee: Money | null;
  /** Below this the merchant will not accept an order. Null means no floor. */
  minimumOrder: Money | null;
  estimatedDeliveryMinutes: number | null;
  isAcceptingOrders: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * A real, purchasable thing with a price and a stock state.
 *
 * NOT modelled: a separate variant table. Every supermarket catalogue we have
 * looked at gives each pack size its own SKU and its own price, so "Tomatoes
 * 500g" and "Tomatoes 1kg" are two products, not two variants of one. A
 * variant layer would add a join and answer no question we have.
 */
export type MerchantProduct = {
  id: string;
  merchantId: string;
  /** Null when the catalogue is chain-wide rather than per branch. */
  locationId: string | null;
  externalId: string;
  sku: string | null;
  name: string;
  nameAr: string | null;
  brand: string | null;
  /** Pack size — 1 kg, 500 g, 12 piece. Drives "how many packs do I need?". */
  packQuantity: number | null;
  packUnit: Unit | null;
  /** A LIVE price. Never merge this with an ingredient price ESTIMATE. */
  price: Money;
  availability: Availability;
  imageUrl: string | null;
  isActive: boolean;
  /** When this row was last read from the merchant. Staleness is visible. */
  fetchedAt: string;
};

// --- Ingredient → product mapping ------------------------------------------

export const MAPPING_SOURCES = [
  'manual',
  'sku_exact',
  'name_match',
  'category_fallback',
] as const;
export type MappingSource = (typeof MAPPING_SOURCES)[number];

/**
 * The only bridge between food intelligence and a merchant catalogue.
 *
 * Keyed by `ingredientSlug` — the canonical, stable, human-readable key the
 * rest of the app already uses — rather than an ingredient UUID, so this table
 * can be rebuilt, re-seeded or shipped to a partner without carrying our
 * primary keys with it.
 */
export type IngredientProductMapping = {
  id: string;
  ingredientSlug: string;
  merchantProductId: string;
  /** 0–1. Below `MAPPING_CONFIRM_THRESHOLD` the user confirms it themselves. */
  confidence: number;
  source: MappingSource;
  /** True once a human has checked it. Verified mappings outrank scored ones. */
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Below this, a mapping is offered as a suggestion, never applied silently.
 *
 * Buying the wrong thing on somebody's behalf is worse than asking them.
 */
export const MAPPING_CONFIRM_THRESHOLD = 0.75;

// --- Cart ------------------------------------------------------------------

export type CartLine = {
  id: string;
  merchantProductId: string;
  /**
   * The canonical ingredient this line is here to satisfy, when it came from a
   * recipe. Null for a line added by browsing. This is what lets the cart say
   * "this covers the cream you were missing" instead of listing SKUs.
   */
  sourceIngredientSlug: string | null;
  sourceRecipeId: string | null;
  quantity: number;
  /**
   * The unit price WHEN ADDED, not a live read.
   *
   * Re-validated at checkout: a cart that silently re-prices itself between
   * the shelf and the till is the single most common grocery-app complaint,
   * and the snapshot is what lets us show the difference rather than absorb it.
   */
  unitPriceSnapshot: Money;
  addedAt: string;
};

/** One cart, one merchant. Cross-merchant baskets are explicitly out of scope. */
export type Cart = {
  id: string;
  /** Null for a guest cart held in local storage. */
  userId: string | null;
  merchantId: string;
  locationId: string;
  currency: CurrencyCode;
  lines: readonly CartLine[];
  createdAt: string;
  updatedAt: string;
};

// --- Fulfilment state ------------------------------------------------------

/**
 * WHERE THE GOODS ARE. Not where the money is — see `PaymentState`.
 *
 * `pending` exists so a merchant never sees an order that has not been paid
 * for. Picking an unpaid basket is the merchant's risk, and the queue is the
 * place to prevent it.
 *
 * `undeliverable` exists because nobody-was-home happens constantly and it is
 * neither delivered nor cancelled. Without it, operations will record it as
 * one of those two, and both are lies with money attached: the goods were
 * picked and somebody has to pay for them.
 */
export const ORDER_FULFILMENT_STATES = [
  'draft',
  'pending',
  'placed',
  'accepted',
  'picking',
  'ready',
  'dispatched',
  'delivered',
  'rejected',
  'cancelled',
  'failed',
  'undeliverable',
] as const;
export type OrderFulfilmentState = (typeof ORDER_FULFILMENT_STATES)[number];

// --- Payment state ---------------------------------------------------------

/**
 * WHERE THE MONEY IS. Deliberately a separate axis from fulfilment.
 *
 * `authorised` and `captured` are distinct because card payments hold funds
 * before taking them, and the gap is where substitutions and removals get
 * resolved. Capturing before the basket is final is how a customer ends up
 * refunded for something they never received.
 */
export const PAYMENT_STATES = [
  'unpaid',
  'authorising',
  'authorised',
  'captured',
  'partially_refunded',
  'refunded',
  'voided',
  'failed',
] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

/**
 * Cash on delivery is first-class, not an afterthought.
 *
 * It is the dominant method in Egyptian grocery delivery, and it INVERTS the
 * settlement direction: the merchant's rider collects the cash, so the
 * merchant ends up holding our commission instead of us holding their revenue.
 * `settleOrder` reads this field and flips the direction rather than assuming
 * money always flows one way.
 */
export const PAYMENT_METHODS = ['card', 'wallet', 'cash_on_delivery'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Which payment integration handled it.
 *
 * `demo` is a real value and it is written to the order, so a demo payment can
 * never be mistaken for a production one by reading the row. Nothing maps
 * `demo` to a successful production state.
 */
export const PAYMENT_PROVIDERS = ['demo', 'paymob', 'fawry', 'cash'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

// --- Substitutions ---------------------------------------------------------

/** What the customer wants done when the merchant cannot find something. */
export const SUBSTITUTION_PREFERENCES = ['contact_me', 'best_match', 'remove'] as const;
export type SubstitutionPreference = (typeof SUBSTITUTION_PREFERENCES)[number];

export const SUBSTITUTION_DECISIONS = [
  'pending_customer',
  'approved',
  'rejected',
  'auto_approved',
] as const;
export type SubstitutionDecision = (typeof SUBSTITUTION_DECISIONS)[number];

export type OrderSubstitution = {
  id: string;
  orderId: string;
  orderItemId: string;
  originalProductId: string;
  originalProductName: string;
  originalUnitPrice: Money;
  replacementProductId: string | null;
  replacementProductName: string | null;
  replacementUnitPrice: Money | null;
  /** Signed, in minor units. Positive means the replacement costs more. */
  unitPriceDeltaMinor: number;
  quantity: number;
  decision: SubstitutionDecision;
  decidedAt: string | null;
  proposedBy: CommerceActor;
  createdAt: string;
};

// --- Adjustments (the money ledger) ----------------------------------------

export const ADJUSTMENT_KINDS = [
  'substitution',
  'item_removed',
  'quantity_reduced',
  'order_cancelled',
  'fee_waived',
  'goodwill',
] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];

/**
 * An append-only change to what the customer owes.
 *
 * The order's financial position is a FOLD over these rows, never a set of
 * mutable columns. Substitutions, removals, cancellations and goodwill are all
 * the same kind of row, so the totals cannot drift out of step with the
 * history that produced them, and "why was I charged this?" is answerable.
 */
export type OrderAdjustment = {
  id: string;
  orderId: string;
  /** Null for order-level adjustments such as a waived delivery fee. */
  orderItemId: string | null;
  kind: AdjustmentKind;
  /** SIGNED minor units. Negative reduces what the customer owes. */
  amountMinor: number;
  reason: string | null;
  actor: CommerceActor;
  actorId: string | null;
  createdAt: string;
};

// --- Order -----------------------------------------------------------------

export type OrderItem = {
  id: string;
  orderId: string;
  merchantProductId: string;
  /**
   * Denormalised on purpose. A catalogue row can be edited or delisted; what
   * the customer bought must still be readable in five years.
   */
  productName: string;
  productNameAr: string | null;
  sku: string | null;
  packQuantity: number | null;
  packUnit: Unit | null;
  quantity: number;
  unitPrice: Money;
  /** `unitPrice × quantity`, stored so the row is self-describing. */
  lineTotalMinor: number;
  sourceIngredientSlug: string | null;
  sourceRecipeId: string | null;
};

/** What the customer was asked to pay, before any adjustment. */
export type OrderCharge = {
  currency: CurrencyCode;
  itemsSubtotalMinor: number;
  deliveryFeeMinor: number;
  serviceFeeMinor: number;
  /** Stored positive and subtracted, so no sign confusion at the call site. */
  discountMinor: number;
};

export type DeliveryAddress = {
  id: string;
  userId: string | null;
  label: string | null;
  line1: string;
  line2: string | null;
  district: string | null;
  city: string;
  country: CountryCode;
  /** Free text. Egyptian addresses are directions more often than coordinates. */
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export const ORDER_EVENT_KINDS = [
  'fulfilment_state',
  'payment_state',
  'adjustment',
  'substitution',
  'note',
] as const;
export type OrderEventKind = (typeof ORDER_EVENT_KINDS)[number];

/**
 * The audit trail. Every status-changing action appends one.
 *
 * Timestamps like `acceptedAt` are derived from this rather than stored as a
 * dozen nullable columns, so an order can never claim it was accepted without
 * a row saying who accepted it and when.
 */
export type OrderEvent = {
  id: string;
  orderId: string;
  at: string;
  kind: OrderEventKind;
  actor: CommerceActor;
  actorId: string | null;
  from: string | null;
  to: string | null;
  note: string | null;
};

export type Order = {
  id: string;
  /** Human-facing, shown to the customer and the merchant. */
  reference: string;
  userId: string;
  merchantId: string;
  locationId: string;

  fulfilment: OrderFulfilmentState;
  payment: PaymentState;
  paymentMethod: PaymentMethod;
  paymentProvider: PaymentProvider;
  /** The provider's id for the transaction, for reconciliation. */
  paymentReference: string | null;

  substitutionPreference: SubstitutionPreference;

  charge: OrderCharge;
  /** Minor units actually taken from the customer. */
  capturedMinor: number;
  /** Minor units given back. */
  refundedMinor: number;

  items: readonly OrderItem[];
  adjustments: readonly OrderAdjustment[];
  substitutions: readonly OrderSubstitution[];
  events: readonly OrderEvent[];

  deliveryAddress: DeliveryAddress;
  contactPhone: string;
  customerNote: string | null;

  createdAt: string;
  updatedAt: string;
};

// --- Settlement ------------------------------------------------------------

/**
 * Which way money moves between AKALT and the merchant.
 *
 * Prepaid: we hold the customer's money and owe the merchant their share.
 * Cash on delivery: the merchant collected it and owes us our commission.
 */
export const SETTLEMENT_DIRECTIONS = ['akalt_owes_merchant', 'merchant_owes_akalt'] as const;
export type SettlementDirection = (typeof SETTLEMENT_DIRECTIONS)[number];

/** The computed financial position of one order. Never stored; always folded. */
export type OrderFinancials = {
  currency: CurrencyCode;
  /** What the customer was originally asked to pay. */
  authorisedTotalMinor: number;
  /** After adjustments. Never exceeds `authorisedTotalMinor` — see `ledger.ts`. */
  amountDueMinor: number;
  /** Goods actually fulfilled, after removals and substitutions. */
  goodsFulfilledMinor: number;
  /** Owed back to the customer right now. */
  refundDueMinor: number;
  commissionMinor: number;
  settlementDirection: SettlementDirection;
  /** Always non-negative; read it together with `settlementDirection`. */
  settlementAmountMinor: number;
};
