import { getItem, removeItem, setItem, StorageKeys } from '@/lib/storage';
import type { Cart, CartLine } from '@/types/commerce';
import type { CurrencyCode } from '@/types/domain';

/**
 * A guest cart that could not be merged when somebody signed in.
 *
 * ONE CART, ONE MERCHANT is a hard invariant of this layer, so when a guest
 * arrives with a basket from one branch and their account already holds one
 * from another, both cannot survive as carts. Neither may be thrown away
 * either: losing somebody's shopping at the exact moment they commit to the
 * product is the worst possible time for it.
 *
 * So the ACCOUNT'S cart stays active, and the guest's is parked here until the
 * user says which they want. This is NOT a second cart:
 *
 *   - nothing reads it as a basket
 *   - it is never sourced, priced, revalidated or ordered from
 *   - it exists only to answer one question, once, and is deleted on the answer
 *
 * ITS PRICES ARE NOT CHECKOUT TRUTH. They are what the guest was shown before
 * signing in, kept so the restored cart looks like the one they left. If the
 * user switches back to it, the normal Commerce-4 revalidation runs before any
 * order and is what decides whether those products are still in stock, still
 * listed, still safe and still that price.
 */

/** How long a parked cart is worth keeping. */
export const PENDING_CART_TTL_DAYS = 14;

export type PendingCart = {
  /**
   * WHOSE. Scoped to the account, not the device: two people sharing a phone
   * must never be shown each other's shopping, and a parked cart outliving a
   * sign-out is exactly how that would happen.
   */
  readonly userId: string;
  readonly merchantId: string;
  readonly locationId: string;
  readonly currency: CurrencyCode;
  readonly lines: readonly CartLine[];
  /** The guest cart's own id, so a retry recognises the same basket. */
  readonly sourceCartId: string;
  readonly parkedAt: string;
  /** Always `guest_migration` today. Named so a second reason must declare itself. */
  readonly source: 'guest_migration';
};

function isExpired(pending: PendingCart, now: Date): boolean {
  const parked = new Date(pending.parkedAt).getTime();
  if (Number.isNaN(parked)) return true;
  return now.getTime() - parked > PENDING_CART_TTL_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Reads the parked cart for this user, if there is a usable one.
 *
 * Returns null — never throws — for every unhappy case: nothing parked, parked
 * for somebody else, expired, or unreadable. A corrupt record is DELETED on
 * the way past rather than left to fail the same way on every launch.
 */
export async function readPendingCart(
  userId: string,
  now: Date = new Date(),
): Promise<PendingCart | null> {
  let stored: PendingCart | null;
  try {
    stored = await getItem<PendingCart>(StorageKeys.pendingCart);
  } catch {
    await clearPendingCart();
    return null;
  }

  if (!stored || typeof stored !== 'object') return null;

  // Shape check rather than trust: this is durable storage written by an older
  // build, and a half-written record must not reach a screen.
  if (
    typeof stored.userId !== 'string' ||
    typeof stored.merchantId !== 'string' ||
    typeof stored.locationId !== 'string' ||
    !Array.isArray(stored.lines)
  ) {
    await clearPendingCart();
    return null;
  }

  // Somebody else's. Left in place: it is still theirs, and they may sign back
  // in on this device.
  if (stored.userId !== userId) return null;

  if (isExpired(stored, now)) {
    await clearPendingCart();
    return null;
  }

  if (stored.lines.length === 0) {
    await clearPendingCart();
    return null;
  }

  return stored;
}

export async function parkPendingCart(
  userId: string,
  cart: Cart,
  now: Date = new Date(),
): Promise<void> {
  const pending: PendingCart = {
    userId,
    merchantId: cart.merchantId,
    locationId: cart.locationId,
    currency: cart.currency,
    lines: cart.lines,
    sourceCartId: cart.id,
    parkedAt: now.toISOString(),
    source: 'guest_migration',
  };
  await setItem(StorageKeys.pendingCart, pending);
}

export async function clearPendingCart(): Promise<void> {
  await removeItem(StorageKeys.pendingCart);
}
