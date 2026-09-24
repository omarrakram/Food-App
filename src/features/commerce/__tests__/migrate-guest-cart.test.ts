import { getItem, setItem, StorageKeys } from '@/lib/storage';
import type { Cart, CartLine } from '@/types/commerce';

import { LocalCartRepository, type AddCartLineInput, type CartRepository } from '../cart-repository';
import { migrateGuestCart } from '../migrate-guest-cart';
import {
  clearPendingCart,
  PENDING_CART_TTL_DAYS,
  parkPendingCart,
  readPendingCart,
  type PendingCart,
} from '../pending-cart';

/**
 * SIGNING IN MUST NOT COST SOMEBODY THEIR SHOPPING.
 *
 * One cart, one merchant is a hard invariant, so a guest basket from one
 * branch and an account basket from another cannot both be carts. Neither may
 * be thrown away. Every test here is a way the wrong one could disappear.
 */

const USER = 'user-1';
const OTHER_USER = 'user-2';

function line(over: Partial<CartLine> = {}): CartLine {
  return {
    id: 'line-1',
    merchantProductId: 'prod-a',
    sourceIngredientSlug: 'rice',
    sourceRecipeId: 'r-1',
    quantity: 1,
    unitPriceSnapshot: { amountMinor: 4_000, currency: 'EGP' },
    addedAt: '2026-09-25T09:00:00.000Z',
    ...over,
  };
}

function cart(over: Partial<Cart> = {}): Cart {
  return {
    id: 'cart-1',
    userId: null,
    merchantId: 'merchant-a',
    locationId: 'location-a',
    currency: 'EGP',
    revision: 1,
    deliveryFeeSnapshot: null,
    lines: [line()],
    createdAt: '2026-09-25T09:00:00.000Z',
    updatedAt: '2026-09-25T09:00:00.000Z',
    ...over,
  };
}

/** An in-memory stand-in for the account's server cart. */
class FakeRemoteCart implements CartRepository {
  constructor(private state: Cart | null = null) {}
  private failing = false;

  fail() {
    this.failing = true;
  }

  get(): Promise<Cart | null> {
    if (this.failing) return Promise.reject(new Error('network'));
    return Promise.resolve(this.state);
  }

  addLines(inputs: readonly AddCartLineInput[]) {
    if (this.failing) return Promise.reject(new Error('network'));
    const first = inputs[0]!;
    const replaced = this.state !== null && this.state.locationId !== first.locationId;
    const existing = replaced ? [] : (this.state?.lines ?? []);
    const lines = [...existing];

    for (const input of inputs) {
      const at = lines.findIndex((l) => l.merchantProductId === input.merchantProductId);
      const found = at === -1 ? undefined : lines[at];
      if (found) {
        lines[at] = { ...found, quantity: found.quantity + input.quantity };
      } else {
        lines.push(line({ id: `srv-${lines.length}`, ...input, unitPriceSnapshot: input.unitPrice }));
      }
    }

    this.state = cart({
      id: 'server-cart',
      userId: USER,
      merchantId: first.merchantId,
      locationId: first.locationId,
      lines,
    });
    return Promise.resolve({ cart: this.state, replacedMerchant: replaced, addedLines: inputs.length });
  }

  setQuantity() {
    return Promise.resolve(this.state);
  }
  removeLine() {
    return Promise.resolve(this.state);
  }
  clear() {
    this.state = null;
    return Promise.resolve();
  }
  peek() {
    return this.state;
  }
}

async function seedGuestCart(over: Partial<Cart> = {}): Promise<LocalCartRepository> {
  const local = new LocalCartRepository();
  await local.clear();
  const source = cart(over);
  await local.addLines(
    source.lines.map((l) => ({
      merchantId: source.merchantId,
      locationId: source.locationId,
      currency: source.currency,
      merchantProductId: l.merchantProductId,
      quantity: l.quantity,
      unitPrice: l.unitPriceSnapshot,
      sourceIngredientSlug: l.sourceIngredientSlug,
      sourceRecipeId: l.sourceRecipeId,
    })),
  );
  return local;
}

beforeEach(async () => {
  await clearPendingCart();
  await new LocalCartRepository().clear();
});

describe('A — the account has no cart', () => {
  it('migrates the guest cart as it stands', async () => {
    const local = await seedGuestCart();
    const remote = new FakeRemoteCart(null);

    const outcome = await migrateGuestCart(USER, remote, local);

    expect(outcome).toEqual({ kind: 'migrated', lines: 1 });
    expect(remote.peek()?.lines).toHaveLength(1);
    expect(await local.get()).toBeNull();
    expect(await readPendingCart(USER)).toBeNull();
  });

  it('does nothing at all when the guest has no cart', async () => {
    const outcome = await migrateGuestCart(USER, new FakeRemoteCart(null));
    expect(outcome).toEqual({ kind: 'nothing_to_migrate' });
  });
});

describe('B — both carts are the same branch', () => {
  it('merges deterministically, by the existing rule', async () => {
    const local = await seedGuestCart({ lines: [line({ merchantProductId: 'prod-a', quantity: 2 })] });
    const remote = new FakeRemoteCart(
      cart({ id: 'server-cart', userId: USER, lines: [line({ id: 'srv-1', quantity: 3 })] }),
    );

    const outcome = await migrateGuestCart(USER, remote, local);

    expect(outcome.kind).toBe('merged');
    // The same product, so one line — not two — and the quantities add up.
    expect(remote.peek()?.lines).toHaveLength(1);
    expect(remote.peek()?.lines[0]?.quantity).toBe(5);
    expect(await readPendingCart(USER)).toBeNull();
  });

  it('keeps distinct products as distinct lines', async () => {
    const local = await seedGuestCart({ lines: [line({ merchantProductId: 'prod-b' })] });
    const remote = new FakeRemoteCart(cart({ id: 'server-cart', userId: USER }));

    await migrateGuestCart(USER, remote, local);
    expect(remote.peek()?.lines).toHaveLength(2);
  });
});

describe('C — the carts are from different branches', () => {
  it('keeps the account cart active and parks the guest one', async () => {
    const local = await seedGuestCart({ merchantId: 'merchant-b', locationId: 'location-b' });
    const serverState = cart({ id: 'server-cart', userId: USER, lines: [line({ id: 'srv-1' })] });
    const remote = new FakeRemoteCart(serverState);

    const outcome = await migrateGuestCart(USER, remote, local);

    expect(outcome).toEqual({ kind: 'parked', lines: 1 });
    // The account's cart is untouched — not merged into, not replaced.
    expect(remote.peek()).toEqual(serverState);

    const pending = await readPendingCart(USER);
    expect(pending?.locationId).toBe('location-b');
    expect(pending?.lines).toHaveLength(1);
    expect(pending?.source).toBe('guest_migration');
  });

  it('never merges lines across merchants', async () => {
    const local = await seedGuestCart({ merchantId: 'merchant-b', locationId: 'location-b' });
    const remote = new FakeRemoteCart(cart({ id: 'server-cart', userId: USER }));

    await migrateGuestCart(USER, remote, local);

    expect(remote.peek()?.merchantId).toBe('merchant-a');
    expect(remote.peek()?.lines).toHaveLength(1);
  });

  it('loses nothing: every guest line survives in the parked record', async () => {
    const guestLines = [
      line({ id: 'g-1', merchantProductId: 'p1', quantity: 2 }),
      line({ id: 'g-2', merchantProductId: 'p2', quantity: 5 }),
    ];
    const local = await seedGuestCart({
      merchantId: 'merchant-b',
      locationId: 'location-b',
      lines: guestLines,
    });
    const remote = new FakeRemoteCart(cart({ id: 'server-cart', userId: USER }));

    await migrateGuestCart(USER, remote, local);

    const pending = await readPendingCart(USER);
    expect(pending?.lines.map((l) => [l.merchantProductId, l.quantity])).toEqual([
      ['p1', 2],
      ['p2', 5],
    ]);
  });
});

describe('D — the user keeps the current cart', () => {
  it('discards the parked one only on that explicit answer', async () => {
    const remote = new FakeRemoteCart(cart({ id: 'server-cart', userId: USER }));
    await parkPendingCart(USER, cart({ merchantId: 'merchant-b', locationId: 'location-b' }));
    expect(await readPendingCart(USER)).not.toBeNull();

    await clearPendingCart();

    expect(await readPendingCart(USER)).toBeNull();
    expect(remote.peek()?.locationId).toBe('location-a');
  });
});

describe('E — the user switches to the parked cart', () => {
  it('replaces the active cart and clears the pending state', async () => {
    const remote = new FakeRemoteCart(cart({ id: 'server-cart', userId: USER }));
    const parked = cart({ merchantId: 'merchant-b', locationId: 'location-b' });
    await parkPendingCart(USER, parked);

    const pending = await readPendingCart(USER);
    expect(pending).not.toBeNull();

    // What the UI does on "switch": replay the parked lines into the cart,
    // which replaces by branch under the one-cart-one-merchant rule.
    await remote.addLines(
      pending!.lines.map((l) => ({
        merchantId: pending!.merchantId,
        locationId: pending!.locationId,
        currency: pending!.currency,
        merchantProductId: l.merchantProductId,
        quantity: l.quantity,
        unitPrice: l.unitPriceSnapshot,
      })),
    );
    await clearPendingCart();

    expect(remote.peek()?.locationId).toBe('location-b');
    expect(await readPendingCart(USER)).toBeNull();
  });
});

describe('F — a parked cart belongs to one account', () => {
  it('does not surface for a different account on the same device', async () => {
    await parkPendingCart(USER, cart({ merchantId: 'merchant-b', locationId: 'location-b' }));

    expect(await readPendingCart(OTHER_USER)).toBeNull();
    // And it is still there for the person it belongs to — not deleted by the
    // other account merely looking.
    expect(await readPendingCart(USER)).not.toBeNull();
  });
});

describe('G — migration never blocks sign-in', () => {
  it('reports failure and leaves the guest cart intact to retry', async () => {
    const local = await seedGuestCart();
    const remote = new FakeRemoteCart(null);
    remote.fail();

    const outcome = await migrateGuestCart(USER, remote, local);

    expect(outcome).toEqual({ kind: 'failed' });
    // Not cleared: the next launch tries again.
    expect((await local.get())?.lines).toHaveLength(1);
  });
});

describe('H — retrying is idempotent', () => {
  it('does not duplicate lines when the migration runs twice', async () => {
    const local = await seedGuestCart();
    const remote = new FakeRemoteCart(null);

    await migrateGuestCart(USER, remote, local);
    const second = await migrateGuestCart(USER, remote, local);

    expect(second).toEqual({ kind: 'nothing_to_migrate' });
    expect(remote.peek()?.lines).toHaveLength(1);
  });

  it('does not park a second time', async () => {
    const local = await seedGuestCart({ merchantId: 'merchant-b', locationId: 'location-b' });
    const remote = new FakeRemoteCart(cart({ id: 'server-cart', userId: USER }));

    await migrateGuestCart(USER, remote, local);
    const second = await migrateGuestCart(USER, remote, local);

    expect(second).toEqual({ kind: 'nothing_to_migrate' });
    expect((await readPendingCart(USER))?.lines).toHaveLength(1);
  });
});

describe('the parked record cannot rot', () => {
  it('expires rather than resurfacing months later', async () => {
    const parkedAt = new Date('2026-09-01T00:00:00.000Z');
    await parkPendingCart(USER, cart({ locationId: 'location-b' }), parkedAt);

    const justInside = new Date(parkedAt.getTime() + (PENDING_CART_TTL_DAYS - 1) * 86_400_000);
    expect(await readPendingCart(USER, justInside)).not.toBeNull();

    const past = new Date(parkedAt.getTime() + (PENDING_CART_TTL_DAYS + 1) * 86_400_000);
    expect(await readPendingCart(USER, past)).toBeNull();
    // And it is gone, not merely hidden.
    expect(await getItem(StorageKeys.pendingCart)).toBeNull();
  });

  it('survives a corrupt record without blocking anything', async () => {
    await setItem(StorageKeys.pendingCart, { userId: USER, lines: 'not an array' } as never);

    expect(await readPendingCart(USER)).toBeNull();
    expect(await getItem(StorageKeys.pendingCart)).toBeNull();
  });

  it('drops an empty parked cart rather than offering nothing', async () => {
    const empty: PendingCart = {
      userId: USER,
      merchantId: 'merchant-b',
      locationId: 'location-b',
      currency: 'EGP',
      lines: [],
      sourceCartId: 'cart-x',
      parkedAt: new Date().toISOString(),
      source: 'guest_migration',
    };
    await setItem(StorageKeys.pendingCart, empty);

    expect(await readPendingCart(USER)).toBeNull();
  });
});
