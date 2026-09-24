import type { Cart, CartLine, MerchantLocation, MerchantProduct } from '@/types/commerce';

import { buildCartView } from '../cart-view';
import { DEMO_LOCATION_SNAPSHOT, DEMO_MERCHANT_SNAPSHOT } from '../demo-adapter';
import type { SelectedMerchant } from '../merchant-selection';

/**
 * WHAT THE CART SAYS IT COSTS.
 *
 * The number on this screen is the one somebody decides to spend money on, so
 * the rules behind it are tested directly rather than through a renderer:
 *
 *   - Totals come from the SNAPSHOT price, the one the user was shown.
 *   - A shelf price that has since moved is SURFACED, never silently applied.
 *   - The branch's minimum is measured against the goods, not the goods plus
 *     the branch's own delivery charge.
 */

const TIMESTAMP = '2026-09-24T09:00:00.000Z';

function location(over: Partial<MerchantLocation> = {}): MerchantLocation {
  return { ...DEMO_LOCATION_SNAPSHOT, ...over };
}

function merchant(over: Partial<MerchantLocation> = {}): SelectedMerchant {
  return {
    merchant: DEMO_MERCHANT_SNAPSHOT,
    location: location(over),
    // `buildCartView` is pure and never touches the adapter — the catalogue
    // read happens above it, in the hook — so this is a shape, not a fake.
    catalogue: {
      merchantId: DEMO_MERCHANT_SNAPSHOT.id,
      getMerchant: () => Promise.resolve(DEMO_MERCHANT_SNAPSHOT),
      listLocations: () => Promise.resolve([]),
      searchProducts: () => Promise.resolve([]),
      getProducts: () => Promise.resolve([]),
      checkAvailability: () => Promise.resolve({}),
    },
    candidatesFor: () => [],
    isDemo: true,
  };
}

function cartLine(over: Partial<CartLine> = {}): CartLine {
  return {
    id: 'line-1',
    merchantProductId: 'prod-a',
    sourceIngredientSlug: 'cream',
    sourceRecipeId: 'r-1',
    quantity: 2,
    unitPriceSnapshot: { amountMinor: 4_500, currency: 'EGP' },
    addedAt: TIMESTAMP,
    ...over,
  };
}

function cart(lines: readonly CartLine[]): Cart {
  return {
    id: 'cart-1',
    userId: null,
    merchantId: DEMO_MERCHANT_SNAPSHOT.id,
    locationId: DEMO_LOCATION_SNAPSHOT.id,
    currency: 'EGP',
    lines,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

function product(over: Partial<MerchantProduct> = {}): MerchantProduct {
  return {
    id: 'prod-a',
    merchantId: DEMO_MERCHANT_SNAPSHOT.id,
    locationId: DEMO_LOCATION_SNAPSHOT.id,
    externalId: 'prod-a',
    sku: null,
    name: 'Juhayna Cooking Cream 200ml',
    nameAr: null,
    brand: null,
    packQuantity: 200,
    packUnit: 'ml',
    price: { amountMinor: 4_500, currency: 'EGP' },
    availability: 'in_stock',
    imageUrl: null,
    isActive: true,
    fetchedAt: TIMESTAMP,
    ...over,
  };
}

function catalogue(...products: readonly MerchantProduct[]): ReadonlyMap<string, MerchantProduct> {
  return new Map(products.map((entry) => [entry.id, entry]));
}

describe('what the basket costs', () => {
  it('totals the lines at the price they were added for', () => {
    const view = buildCartView(cart([cartLine()]), merchant(), catalogue(product()));

    expect(view.subtotal.amountMinor).toBe(9_000);
    expect(view.itemCount).toBe(2);
  });

  it('adds the branch delivery fee to the total and leaves the subtotal alone', () => {
    const view = buildCartView(
      cart([cartLine()]),
      merchant({ deliveryFee: { amountMinor: 2_500, currency: 'EGP' } }),
      catalogue(product()),
    );

    expect(view.subtotal.amountMinor).toBe(9_000);
    expect(view.total.amountMinor).toBe(11_500);
  });

  it('shows no delivery line where the branch has not set one', () => {
    const view = buildCartView(
      cart([cartLine()]),
      merchant({ deliveryFee: null }),
      catalogue(product()),
    );

    expect(view.deliveryFee).toBeNull();
    expect(view.total.amountMinor).toBe(view.subtotal.amountMinor);
  });
});

describe('a price that moved since the line was added', () => {
  it('keeps the total at the snapshot and flags the line', () => {
    // The shelf now says 60.00; the cart was built at 45.00. Re-totalling
    // underneath somebody is how a shop loses an argument about what was
    // agreed, so the number stays and the change is shown.
    const view = buildCartView(
      cart([cartLine()]),
      merchant(),
      catalogue(product({ price: { amountMinor: 6_000, currency: 'EGP' } })),
    );

    expect(view.subtotal.amountMinor).toBe(9_000);
    expect(view.lines[0]?.priceChanged).toBe(true);
    expect(view.lines[0]?.currentUnitPrice?.amountMinor).toBe(6_000);
  });

  it('says nothing when the price is the same', () => {
    const view = buildCartView(cart([cartLine()]), merchant(), catalogue(product()));

    expect(view.lines[0]?.priceChanged).toBe(false);
  });

  it('claims no change when the shelf could not be read at all', () => {
    // An empty catalogue is a failed or in-flight read, NOT a shop that
    // dropped every product. Reporting a change here would put a warning on
    // every line of a cart opened offline.
    const view = buildCartView(cart([cartLine()]), merchant(), catalogue());

    expect(view.lines[0]?.product).toBeNull();
    expect(view.lines[0]?.priceChanged).toBe(false);
    expect(view.lines[0]?.currentUnitPrice).toBeNull();
  });

  it('keeps the rest of the basket usable when one product is delisted', () => {
    const view = buildCartView(
      cart([cartLine(), cartLine({ id: 'line-2', merchantProductId: 'prod-gone', quantity: 1 })]),
      merchant(),
      catalogue(product()),
    );

    expect(view.lines[0]?.product).not.toBeNull();
    expect(view.lines[1]?.product).toBeNull();
    // The delisted line still counts towards the total: the user added it at a
    // price, and hiding its cost would understate the basket.
    expect(view.subtotal.amountMinor).toBe(13_500);
  });
});

describe("the branch's minimum order", () => {
  it('reports the gap to close rather than the floor itself', () => {
    const view = buildCartView(
      cart([cartLine({ quantity: 1 })]),
      merchant({ minimumOrder: { amountMinor: 10_000, currency: 'EGP' } }),
      catalogue(product()),
    );

    expect(view.shortfall?.amountMinor).toBe(5_500);
  });

  it('is silent once the basket clears it', () => {
    const view = buildCartView(
      cart([cartLine()]),
      merchant({ minimumOrder: { amountMinor: 9_000, currency: 'EGP' } }),
      catalogue(product()),
    );

    expect(view.shortfall).toBeNull();
  });

  it('does not let the delivery fee pay for the minimum', () => {
    // 45.00 of goods plus a 25.00 delivery fee is 70.00 through the till and
    // still a 45.00 basket to pick. The floor is about the picking.
    const view = buildCartView(
      cart([cartLine({ quantity: 1 })]),
      merchant({
        minimumOrder: { amountMinor: 6_000, currency: 'EGP' },
        deliveryFee: { amountMinor: 2_500, currency: 'EGP' },
      }),
      catalogue(product()),
    );

    expect(view.total.amountMinor).toBe(7_000);
    expect(view.shortfall?.amountMinor).toBe(1_500);
  });

  it('is silent where the branch has no floor', () => {
    const view = buildCartView(
      cart([cartLine({ quantity: 1 })]),
      merchant({ minimumOrder: null }),
      catalogue(product()),
    );

    expect(view.shortfall).toBeNull();
  });
});

describe('the demo flag travels with the view', () => {
  it('is carried so no screen can render a fixture basket unbadged', () => {
    expect(buildCartView(cart([cartLine()]), merchant(), catalogue()).isDemo).toBe(true);
  });
});
