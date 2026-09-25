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
  DietaryPreference,
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
 * How a placed order reaches the people who will pick it.
 *
 * V1 ships `dashboard`: the merchant works our own AKALT Merchant Dashboard
 * and moves the order along by hand. `api` exists for a future chain that has
 * a system of its own to push into. Both keep the order record — and the
 * customer — inside AKALT.
 */
export const MERCHANT_FULFILMENT_MODES = ['dashboard', 'api'] as const;
export type MerchantFulfilmentMode = (typeof MERCHANT_FULFILMENT_MODES)[number];

export type Merchant = {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  country: CountryCode;
  currency: CurrencyCode;
  fulfilmentMode: MerchantFulfilmentMode;
  /**
   * Basis points, so 1000 = 10.00%. An integer for the same reason money is an
   * integer: a rate stored as 0.10 drifts once it meets a rounding boundary.
   *
   * Charged on NET FULFILLED MERCHANDISE only — never on delivery or service
   * fees, and never on goods that were removed, substituted away or refunded.
   * There is deliberately no "basis" setting: a second option would only ever
   * produce an invoice that disagrees with the agreement.
   */
  commissionRateBasisPoints: number;
  /**
   * Whether the merchant keeps the delivery fee the customer paid.
   *
   * They own the rider, so normally yes — but it is a term in the agreement,
   * not a law, and the settlement maths reads it.
   */
  merchantKeepsDeliveryFee: boolean;
  /** False until a signed agreement exists. Never default this to true. */
  isEnabled: boolean;
  /**
   * A development catalogue, not a supermarket.
   *
   * Written on the row rather than inferred from a slug, so nothing can
   * mistake it for a partner by reading the data. `isDemo && isEnabled` is
   * refused in production builds.
   */
  isDemo: boolean;
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
  /**
   * The canonical area keys this branch serves.
   *
   * EMPTY MEANS NO COVERAGE, not "delivers everywhere" — the inverse default
   * would accept an Aswan order for a Maadi branch, most confidently for a
   * merchant nobody had configured yet.
   */
  deliveryAreaKeys: readonly string[];
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

/**
 * WHAT A MERCHANT SAYS ABOUT A PRODUCT AND A DIET.
 *
 * A CANONICAL INGREDIENT AND A PACKAGED SKU ARE NOT THE SAME QUESTION.
 * `tomatoes` is vegan; a particular brand of tinned tomatoes may carry a
 * flavouring that is not. `bread` is vegetarian; a bakery's loaf may be
 * brushed with an animal fat nobody would guess from the name. The food layer
 * answers "is this ingredient compatible with this diet"; only the merchant
 * can answer "is this PRODUCT compatible", and only if they publish it.
 *
 * NOTHING HERE IS EVER INFERRED. Not from the product name, not from the
 * brand, not from the canonical ingredient it maps to, not by a model. The
 * whole value of this field is that it carries a statement somebody made.
 */
export type DietCompatibility = 'compatible' | 'incompatible';

/**
 * The diets a merchant can make a statement about.
 *
 * DERIVED from `DietaryPreference` rather than redeclared, so the app has one
 * dietary vocabulary and not two that drift. `none` and `other` are dropped
 * because neither is a claim a product can satisfy or violate.
 * `__tests__/product-diets.test.ts` fails if a new diet is added to the app
 * without a decision being made here.
 */
export type ProductDiet = Exclude<DietaryPreference, 'none' | 'other'>;

export const PRODUCT_DIETS = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'halal',
  'keto',
] as const satisfies readonly ProductDiet[];

/**
 * A merchant's published dietary verdicts for one product.
 *
 * THREE STATES, and the third is the one that matters:
 *
 *   `null`                          the merchant publishes no dietary data at
 *                                   all for this product
 *   diet absent from a non-null map they publish dietary data, but said
 *                                   nothing about THIS diet
 *   `'compatible'`                  they say it is fine
 *   `'incompatible'`                they say it is not
 *
 * The first two are both UNKNOWN, and unknown is not safe — it is unlabelled.
 * They are kept distinct anyway because "this merchant publishes nothing" and
 * "this merchant publishes a lot and is silent on halal" are different facts
 * about a catalogue, and the second is worth chasing.
 */
export type ProductDietaryProfile = Partial<Record<ProductDiet, DietCompatibility>>;

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
  verifiedAt: string | null;
  verifiedBy: string | null;
  /**
   * A mapping a human has REFUSED.
   *
   * Kept rather than deleted, for the same reason `data/images/rejected.json`
   * is kept: a matcher that re-derives its candidates will happily propose the
   * same wrong product again next week. A blocked row is the only durable way
   * to say "not this one, ever" — and buying somebody the wrong thing is the
   * fastest way to lose them.
   */
  isBlocked: boolean;
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
  /**
   * BUMPED ON EVERY CHANGE, and the thing a validation verdict is ABOUT.
   *
   * Validating one basket and ordering another is the race this closes: the
   * order draft is refused unless the revision it was built from is still the
   * cart's. Written by a database trigger rather than by callers, because the
   * caller who forgets is the caller who introduces the bug.
   */
  revision: number;
  /**
   * The delivery fee the customer last saw, so a change can be shown rather
   * than absorbed. Null until a fee has been quoted to them.
   */
  deliveryFeeSnapshot: Money | null;
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
  /**
   * Nothing suitable existed, so the line came off.
   *
   * Distinct from `rejected`, which is the customer turning down an offer. A
   * shop with no safe, equal-or-cheaper replacement never made one — and the
   * difference is what the customer reads when they ask what happened.
   */
  'removed',
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

/**
 * A place AKALT can be asked to deliver to, by KEY.
 *
 * The canonical identity of a district, separate from what it is called. The
 * customer picks one of these; they never type it. Deliverability then
 * compares keys, which is exact, instead of comparing text, which is how
 * "Maadi Degla" comes to equal "Degla" and somebody's dinner is promised to
 * the wrong side of Cairo.
 */
export type DeliveryArea = {
  /** Stable, lowercase, hyphenated. The identity; the names are labels. */
  key: string;
  governorate: string;
  nameEn: string;
  nameAr: string;
  /** A development-only area, so a demo branch can serve somewhere unreal. */
  isDemo: boolean;
};

/**
 * Where somebody's dinner goes.
 *
 * Shaped for Egypt rather than for a postal system. A courier here finds a
 * door by building, floor and landmark — "behind the Shell station" is not a
 * nicety, it is how the address resolves — and then telephones. There are no
 * coordinates: pretending an address is a point is exactly how the landmark
 * stops being collected.
 */
export type DeliveryAddress = {
  id: string;
  userId: string | null;
  /** "Home", "Mum's". Optional, and only ever a label. */
  label: string | null;
  /** The person at the door, who is often not the account holder. */
  recipientName: string;
  /** E.164. The UI takes what an Egyptian types and stores one canonical form. */
  phone: string;
  /** The SELECTED area. Deliverability reads this and nothing else. */
  areaKey: string;
  street: string;
  building: string;
  floor: string | null;
  apartment: string | null;
  landmark: string | null;
  country: CountryCode;
  /** Anything else the courier should know. Never parsed. */
  notes: string | null;
  isDefault: boolean;
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
  /**
   * NULL UNTIL A PAYMENT PATH IS CHOSEN, which a draft has not done.
   *
   * Modelled as absence rather than as a placeholder enum value: 'none' or
   * 'unselected' would be a value every `switch` has to remember to exclude,
   * and the one that forgets is the one that charges somebody. The database
   * carries the same shape, with a constraint that refuses null the moment
   * `payment_state` moves past `unpaid`.
   */
  paymentMethod: PaymentMethod | null;
  paymentProvider: PaymentProvider | null;
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

/**
 * Somebody who works in the shop.
 *
 * Deliberately two roles. The question this answers — may this person act for
 * this merchant, at this branch — needs no more, and an RBAC system would be a
 * month of work to answer it worse.
 */
export const MERCHANT_ROLES = ['admin', 'operator'] as const;
export type MerchantRole = (typeof MERCHANT_ROLES)[number];

export type MerchantMembership = {
  id: string;
  merchantId: string;
  userId: string;
  /** Null means every branch of this merchant. */
  locationId: string | null;
  role: MerchantRole;
  createdAt: string;
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

// --- Refunds ---------------------------------------------------------------

/**
 * How far one attempt to send money back has got.
 *
 * `abandoned` is the one worth reading twice: it does NOT mean the refund was
 * cancelled or the debt written off. It means automatic retry has stopped —
 * either the tries ran out, or the provider's answer did not say whether the
 * money moved — and a person has to look. The debt itself is unchanged, and
 * `refundRequiredMinor` still shows it.
 */
export const REFUND_ATTEMPT_STATES = [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'abandoned',
] as const;
export type RefundAttemptState = (typeof REFUND_ATTEMPT_STATES)[number];

/**
 * Where one order's refund stands, as the database answers it.
 *
 * The three money fields are independent facts, not three views of one:
 * `capturedMinor` is history, `refundedMinor` is what has actually gone back,
 * and `refundRequiredMinor` is what is still owed. A failed attempt moves none
 * of them, which is why failure cannot hide.
 */
export type OrderRefundStatus = {
  currency: CurrencyCode;
  capturedMinor: number;
  refundedMinor: number;
  refundRequiredMinor: number;
  /** The most recent attempt, if there has ever been one. */
  attemptState: RefundAttemptState | null;
  attemptAmountMinor: number | null;
  /** Automatic retry is off for this one. Somebody has to check the provider. */
  needsReview: boolean;
  lastErrorCode: string | null;
  requestedAt: string | null;
  settledAt: string | null;
};

// --- Merchant access -------------------------------------------------------

export type MerchantStaffMember = {
  membershipId: string;
  userId: string;
  email: string;
  role: MerchantRole;
  /** Null means every branch of this merchant. */
  locationId: string | null;
  createdAt: string;
};

/** An invitation waiting to be accepted. The token is the capability. */
export type MerchantInvite = {
  id: string;
  token: string;
  merchantId: string;
  merchantName: string;
  locationId: string | null;
  role: MerchantRole;
  expiresAt: string;
};
