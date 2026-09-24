import type {
  Cart,
  CartLine,
  IngredientProductMapping,
  Merchant,
  MerchantLocation,
  MerchantProduct,
} from '@/types/commerce';

import { DEMO_LOCATION_SNAPSHOT, DEMO_MERCHANT_SNAPSHOT } from '../demo-adapter';
import { blockingIssues, revalidateCart, reviewIssues } from '../revalidation';
import type { SourcingCandidateInput, SourcingContext } from '../sourcing';

/**
 * WHAT IS STILL TRUE, IMMEDIATELY BEFORE AN ORDER EXISTS.
 *
 * A cart is decisions taken on Tuesday against a shop that has moved by
 * Thursday. The safety verdict from Commerce-3 is NOT a property of the line —
 * the user may have declared an allergy since, the merchant may have withdrawn
 * a dietary claim — so everything is asked again here.
 *
 * Three outcomes and no generic error: BLOCKED cannot proceed, REVIEW_REQUIRED
 * proceeds once the customer has seen the new number, CLEAN proceeds.
 */

const MERCHANT: Merchant = { ...DEMO_MERCHANT_SNAPSHOT, isEnabled: true };
const LOCATION: MerchantLocation = {
  ...DEMO_LOCATION_SNAPSHOT,
  isAcceptingOrders: true,
  deliveryAreaKeys: ['demo-maadi'],
  deliveryFee: { amountMinor: 2_500, currency: 'EGP' },
  minimumOrder: { amountMinor: 5_000, currency: 'EGP' },
};

function product(over: Partial<MerchantProduct> = {}): MerchantProduct {
  return {
    id: 'prod-a',
    merchantId: MERCHANT.id,
    locationId: LOCATION.id,
    externalId: 'x',
    sku: null,
    name: 'Rice 1kg',
    nameAr: null,
    brand: null,
    packQuantity: 1,
    packUnit: 'kg',
    price: { amountMinor: 4_000, currency: 'EGP' },
    availability: 'in_stock',
    imageUrl: null,
    isActive: true,
    fetchedAt: '2026-09-25T09:00:00.000Z',
    ...over,
  };
}

const MAPPING: IngredientProductMapping = {
  id: 'map-a',
  ingredientSlug: 'rice',
  merchantProductId: 'prod-a',
  confidence: 1,
  source: 'manual',
  isVerified: true,
  verifiedAt: '2026-09-25T09:00:00.000Z',
  verifiedBy: 'ops',
  isBlocked: false,
  createdAt: '2026-09-25T09:00:00.000Z',
  updatedAt: '2026-09-25T09:00:00.000Z',
};

function candidate(over: Partial<SourcingCandidateInput> = {}): SourcingCandidateInput {
  return {
    product: product(),
    mapping: MAPPING,
    productAllergens: [],
    productDiets: { vegan: 'compatible', vegetarian: 'compatible', halal: 'compatible' },
    ...over,
  };
}

function line(over: Partial<CartLine> = {}): CartLine {
  return {
    id: 'line-1',
    merchantProductId: 'prod-a',
    sourceIngredientSlug: 'rice',
    sourceRecipeId: null,
    quantity: 2,
    unitPriceSnapshot: { amountMinor: 4_000, currency: 'EGP' },
    addedAt: '2026-09-25T09:00:00.000Z',
    ...over,
  };
}

function cart(over: Partial<Cart> = {}): Cart {
  return {
    id: 'cart-1',
    userId: 'user-1',
    merchantId: MERCHANT.id,
    locationId: LOCATION.id,
    currency: 'EGP',
    revision: 7,
    deliveryFeeSnapshot: { amountMinor: 2_500, currency: 'EGP' },
    lines: [line()],
    createdAt: '2026-09-25T09:00:00.000Z',
    updatedAt: '2026-09-25T09:00:00.000Z',
    ...over,
  };
}

const CONTEXT: SourcingContext = {
  avoidAllergens: [],
  requireDiets: [],
  perPieceFor: () => null,
};

function validate(over: Partial<Parameters<typeof revalidateCart>[0]> = {}) {
  const theCart = over.cart ?? cart();
  return revalidateCart({
    cart: theCart,
    revision: theCart.revision,
    merchant: MERCHANT,
    location: LOCATION,
    products: new Map([['prod-a', candidate()]]),
    address: { areaKey: 'demo-maadi' },
    context: CONTEXT,
    ...over,
  });
}

function kinds(result: ReturnType<typeof revalidateCart>) {
  return result.issues.map((issue) => issue.kind);
}

describe('a basket that is still fine', () => {
  it('is clean, and totals from the current shelf', () => {
    const result = validate();
    expect(result.outcome).toBe('clean');
    expect(result.issues).toEqual([]);
    expect(result.itemsSubtotal.amountMinor).toBe(8_000);
    expect(result.total.amountMinor).toBe(10_500);
  });

  it('is bound to the revision it judged', () => {
    expect(validate({ cart: cart({ revision: 42 }) }).revision).toBe(42);
  });
});

describe('REVIEW REQUIRED — the customer must see the new number', () => {
  it('surfaces a price increase with both figures', () => {
    const result = validate({
      products: new Map([
        ['prod-a', candidate({ product: product({ price: { amountMinor: 4_200, currency: 'EGP' } }) })],
      ]),
    });

    expect(result.outcome).toBe('review_required');
    const issue = reviewIssues(result)[0];
    expect(issue?.kind).toBe('price_changed');
    expect(issue?.severity === 'review' && issue.was.amountMinor).toBe(4_000);
    expect(issue?.severity === 'review' && issue.now.amountMinor).toBe(4_200);
  });

  it('surfaces a price DECREASE too, rather than pocketing it quietly', () => {
    const result = validate({
      products: new Map([
        ['prod-a', candidate({ product: product({ price: { amountMinor: 3_500, currency: 'EGP' } }) })],
      ]),
    });
    expect(result.outcome).toBe('review_required');
    expect(kinds(result)).toEqual(['price_changed']);
  });

  it('totals at the CURRENT price, never the stale one', () => {
    const result = validate({
      products: new Map([
        ['prod-a', candidate({ product: product({ price: { amountMinor: 4_200, currency: 'EGP' } }) })],
      ]),
    });
    // 2 × 4200, not 2 × 4000. The review is the customer's to accept; the
    // arithmetic never uses the number they are about to stop believing.
    expect(result.itemsSubtotal.amountMinor).toBe(8_400);
  });

  it('surfaces a delivery fee change', () => {
    const result = validate({
      location: { ...LOCATION, deliveryFee: { amountMinor: 3_000, currency: 'EGP' } },
    });
    expect(result.outcome).toBe('review_required');
    const issue = reviewIssues(result)[0];
    expect(issue?.kind).toBe('delivery_fee_changed');
    expect(issue?.severity === 'review' && issue.now.amountMinor).toBe(3_000);
  });

  it('says nothing when the fee is unchanged', () => {
    expect(validate().outcome).toBe('clean');
  });
});

describe('BLOCKED — the branch', () => {
  it('blocks when the merchant is no longer enabled', () => {
    const result = validate({ merchant: { ...MERCHANT, isEnabled: false } });
    expect(result.outcome).toBe('blocked');
    expect(kinds(result)).toContain('merchant_not_enabled');
  });

  it('blocks when the branch stops accepting orders', () => {
    const result = validate({ location: { ...LOCATION, isAcceptingOrders: false } });
    expect(result.outcome).toBe('blocked');
    expect(kinds(result)).toContain('merchant_not_accepting');
  });
});

describe('BLOCKED — where it is going', () => {
  it('blocks an address outside the branch area', () => {
    const result = validate({ address: { areaKey: 'demo-nasr-city' } });
    expect(result.outcome).toBe('blocked');
    expect(kinds(result)).toContain('outside_delivery_area');
  });

  it('blocks when no address has been chosen', () => {
    const result = validate({ address: null });
    expect(kinds(result)).toContain('no_address_selected');
  });

  it('keeps "unfinished address" apart from "we do not go there"', () => {
    const result = validate({ address: { areaKey: '' } });
    expect(kinds(result)).toContain('address_incomplete');
    expect(kinds(result)).not.toContain('outside_delivery_area');
  });
});

describe('BLOCKED — the product', () => {
  it('blocks a delisted product', () => {
    const result = validate({
      products: new Map([['prod-a', candidate({ product: product({ isActive: false }) })]]),
    });
    expect(kinds(result)).toContain('product_delisted');
  });

  it('treats a product missing from a fresh read as delisted, not as fine', () => {
    const result = validate({ products: new Map() });
    expect(kinds(result)).toContain('product_delisted');
  });

  it('blocks an out-of-stock product', () => {
    const result = validate({
      products: new Map([
        ['prod-a', candidate({ product: product({ availability: 'out_of_stock' }) })],
      ]),
    });
    expect(kinds(result)).toContain('out_of_stock');
  });

  it('blocks an impossible quantity', () => {
    const result = validate({ cart: cart({ lines: [line({ quantity: 0 })] }) });
    expect(kinds(result)).toContain('invalid_quantity');
  });

  it('blocks a pack the merchant can no longer describe', () => {
    const result = validate({
      products: new Map([['prod-a', candidate({ product: product({ packQuantity: 0 }) })]]),
    });
    expect(kinds(result)).toContain('pack_invalid');
  });
});

describe('BLOCKED — safety, asked again', () => {
  it('blocks a product that became allergen-ineligible', () => {
    // The user declared a gluten allergy AFTER adding this.
    const result = validate({
      products: new Map([['prod-a', candidate({ productAllergens: ['gluten'] })]]),
      context: { ...CONTEXT, avoidAllergens: ['gluten'] },
    });
    expect(result.outcome).toBe('blocked');
    expect(kinds(result)).toContain('no_longer_allergen_eligible');
  });

  it('blocks a product that became diet-incompatible', () => {
    const result = validate({
      products: new Map([['prod-a', candidate({ productDiets: { vegan: 'incompatible' } })]]),
      context: { ...CONTEXT, requireDiets: ['vegan'] },
    });
    expect(result.outcome).toBe('blocked');
    expect(kinds(result)).toContain('no_longer_diet_eligible');
  });

  it('keeps the two apart — a diet refusal is not an allergy refusal', () => {
    const diet = validate({
      products: new Map([['prod-a', candidate({ productDiets: { vegan: 'incompatible' } })]]),
      context: { ...CONTEXT, requireDiets: ['vegan'] },
    });
    expect(kinds(diet)).not.toContain('no_longer_allergen_eligible');
  });

  it('does NOT let unknown become safe just because it is already in the cart', () => {
    // The merchant withdrew their dietary data, or never published it and the
    // user has since declared a diet. Sitting in a basket does not make a
    // product known.
    const result = validate({
      products: new Map([['prod-a', candidate({ productDiets: null })]]),
      context: { ...CONTEXT, requireDiets: ['vegan'] },
    });
    expect(result.outcome).toBe('blocked');
    expect(kinds(result)).toContain('eligibility_unknown');
  });

  it('leaves an unrestricted cook alone', () => {
    const result = validate({
      products: new Map([['prod-a', candidate({ productDiets: null, productAllergens: null })]]),
    });
    expect(result.outcome).toBe('clean');
  });
});

describe('BLOCKED — the money', () => {
  it('blocks below the branch minimum', () => {
    const result = validate({ cart: cart({ lines: [line({ quantity: 1 })] }) });
    expect(result.outcome).toBe('blocked');
    expect(kinds(result)).toContain('below_minimum');
    expect(result.shortfall?.amountMinor).toBe(1_000);
  });

  it('does not let the delivery fee help clear the floor', () => {
    // 4000 of goods plus a 2500 fee is 6500 through the till and still a 4000
    // basket to pick. The floor is about the picking.
    const result = validate({ cart: cart({ lines: [line({ quantity: 1 })] }) });
    expect(result.total.amountMinor).toBe(6_500);
    expect(kinds(result)).toContain('below_minimum');
  });

  it('blocks an empty cart', () => {
    const result = validate({ cart: cart({ lines: [] }) });
    expect(kinds(result)).toContain('empty_cart');
  });
});

describe('the reasons are not collapsed', () => {
  it('reports every distinct problem rather than one generic failure', () => {
    const result = validate({
      merchant: { ...MERCHANT, isEnabled: false },
      address: { areaKey: 'demo-nasr-city' },
      products: new Map([
        ['prod-a', candidate({ product: product({ availability: 'out_of_stock' }) })],
      ]),
    });

    expect(result.outcome).toBe('blocked');
    expect(kinds(result)).toEqual(
      expect.arrayContaining(['merchant_not_enabled', 'outside_delivery_area', 'out_of_stock']),
    );
  });

  it('names the line a product issue is about, so a screen can point at it', () => {
    const result = validate({
      cart: cart({ lines: [line({ id: 'line-x' })] }),
      products: new Map([['prod-a', candidate({ product: product({ isActive: false }) })]]),
    });
    const issue = blockingIssues(result)[0];
    expect(issue?.lineId).toBe('line-x');
    expect(issue?.productName).toBe('Rice 1kg');
  });

  it('lets blocking beat review — a blocked basket is not "please confirm"', () => {
    const result = validate({
      products: new Map([
        [
          'prod-a',
          candidate({
            product: product({
              price: { amountMinor: 9_000, currency: 'EGP' },
              availability: 'out_of_stock',
            }),
          }),
        ],
      ]),
    });
    expect(result.outcome).toBe('blocked');
  });
});
