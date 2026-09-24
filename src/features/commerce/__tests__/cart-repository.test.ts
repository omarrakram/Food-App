import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  LocalCartRepository,
  cartSubtotalMinor,
  mergeLines,
  type AddCartLineInput,
} from '../cart-repository';

/**
 * The cart.
 *
 * The rule under everything here is ONE CART, ONE BRANCH. A basket spanning
 * two supermarkets cannot be picked, packed or delivered by either of them, so
 * it is not a cart — and the moment it is allowed to exist, checkout has to
 * invent a rule for splitting it.
 */

const EGP = (amountMinor: number) => ({ amountMinor, currency: 'EGP' as const });

function input(over: Partial<AddCartLineInput> = {}): AddCartLineInput {
  return {
    merchantId: 'demo-merchant',
    locationId: 'demo-location',
    currency: 'EGP',
    merchantProductId: 'dm-cream-200',
    quantity: 1,
    unitPrice: EGP(5_500),
    sourceIngredientSlug: 'cream',
    sourceRecipeId: 'r-1',
    ...over,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('adding', () => {
  it('creates a cart from the first line', async () => {
    const repo = new LocalCartRepository();
    const { cart, replacedMerchant } = await repo.addLines([input()]);

    expect(replacedMerchant).toBe(false);
    expect(cart.merchantId).toBe('demo-merchant');
    expect(cart.locationId).toBe('demo-location');
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]?.sourceIngredientSlug).toBe('cream');
  });

  it('increases the quantity rather than making a second line', async () => {
    // Two lines for one product is a basket the user has to reconcile by
    // hand. The shopping list already follows this rule.
    const repo = new LocalCartRepository();
    await repo.addLines([input()]);
    const { cart } = await repo.addLines([input({ quantity: 2 })]);

    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]?.quantity).toBe(3);
  });

  it('refreshes the price snapshot when a product is re-added', () => {
    // The second addition is a fresh read of the shelf. Keeping the older
    // number would quote a price we have just seen is no longer current.
    const [existing] = mergeLines([], [input({ unitPrice: EGP(5_500) })]);
    if (!existing) throw new Error('no line');

    const [updated] = mergeLines([existing], [input({ unitPrice: EGP(6_000) })]);
    expect(updated?.unitPriceSnapshot.amountMinor).toBe(6_000);
    expect(updated?.quantity).toBe(2);
  });
});

describe('one cart, one merchant', () => {
  it('REPLACES the basket when the branch changes, and says it did', async () => {
    const repo = new LocalCartRepository();
    await repo.addLines([input()]);

    const { cart, replacedMerchant } = await repo.addLines([
      input({
        merchantId: 'other-merchant',
        locationId: 'other-location',
        merchantProductId: 'other-1',
      }),
    ]);

    expect(replacedMerchant).toBe(true);
    expect(cart.merchantId).toBe('other-merchant');
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]?.merchantProductId).toBe('other-1');
  });

  it('replaces on a different BRANCH of the same merchant', async () => {
    // Stock, price and delivery all differ per branch, so two branches are as
    // unfulfillable together as two chains.
    const repo = new LocalCartRepository();
    await repo.addLines([input()]);

    const { replacedMerchant } = await repo.addLines([
      input({ locationId: 'demo-location-2', merchantProductId: 'p-2' }),
    ]);

    expect(replacedMerchant).toBe(true);
  });
});

describe('editing', () => {
  it('changes a quantity', async () => {
    const repo = new LocalCartRepository();
    const { cart } = await repo.addLines([input()]);
    const lineId = cart.lines[0]?.id ?? '';

    const updated = await repo.setQuantity(lineId, 4);
    expect(updated?.lines[0]?.quantity).toBe(4);
  });

  it('treats zero as a removal, not a line worth nothing', async () => {
    const repo = new LocalCartRepository();
    const { cart } = await repo.addLines([input(), input({ merchantProductId: 'p-2' })]);
    const lineId = cart.lines[0]?.id ?? '';

    const updated = await repo.setQuantity(lineId, 0);
    expect(updated?.lines).toHaveLength(1);
  });

  it('drops the cart entirely when the last line goes', async () => {
    // An empty cart is no cart. Keeping the shell would leave a branch
    // selected that the user never chose, waiting for their next visit.
    const repo = new LocalCartRepository();
    const { cart } = await repo.addLines([input()]);

    expect(await repo.removeLine(cart.lines[0]?.id ?? '')).toBeNull();
    expect(await repo.get()).toBeNull();
  });
});

describe('persistence', () => {
  it('survives a new repository instance, as an app restart would', async () => {
    await new LocalCartRepository().addLines([input()]);

    // A fresh instance reads the same AsyncStorage the app would on relaunch.
    const afterRestart = await new LocalCartRepository().get();
    expect(afterRestart?.lines).toHaveLength(1);
    expect(afterRestart?.merchantId).toBe('demo-merchant');
  });

  it('is gone after clearing', async () => {
    const repo = new LocalCartRepository();
    await repo.addLines([input()]);
    await repo.clear();
    expect(await repo.get()).toBeNull();
  });
});

describe('totals', () => {
  it('sums every line at its snapshot price', async () => {
    const repo = new LocalCartRepository();
    const { cart } = await repo.addLines([
      input({ quantity: 2, unitPrice: EGP(5_500) }),
      input({ merchantProductId: 'p-2', quantity: 1, unitPrice: EGP(14_000) }),
    ]);

    expect(cartSubtotalMinor(cart)).toBe(25_000);
  });
});
