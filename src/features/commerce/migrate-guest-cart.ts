import { logError, logInfo } from '@/lib/logger';
import type { Cart } from '@/types/commerce';

import type { AddCartLineInput, CartRepository } from './cart-repository';
import { LocalCartRepository } from './cart-repository';
import { parkPendingCart } from './pending-cart';

/**
 * The guest's cart, when they sign in.
 *
 * Same contract as `migrate-guest-data.ts`, for the same reasons: idempotent,
 * non-destructive, and it never blocks sign-in. The cart is separate from that
 * module because it is the one piece of guest state that CANNOT always be
 * merged — one cart, one merchant is a hard invariant, so two baskets from two
 * branches is a question only the user can answer.
 *
 * Three outcomes, and none of them loses anything:
 *
 *   MIGRATED   the account had no cart, so the guest's becomes theirs.
 *   MERGED     both are the same branch, so the existing deterministic
 *              `mergeLines` rule applies — the same one the app already uses
 *              when you add the same product twice.
 *   PARKED     different branches. The ACCOUNT'S cart stays active and the
 *              guest's is parked for an explicit choice. Nothing is deleted,
 *              nothing is merged across merchants, and nobody is asked to
 *              decide before they have seen both.
 */

export type CartMigrationOutcome =
  | { readonly kind: 'nothing_to_migrate' }
  | { readonly kind: 'migrated'; readonly lines: number }
  | { readonly kind: 'merged'; readonly lines: number }
  | { readonly kind: 'parked'; readonly lines: number }
  | { readonly kind: 'failed' };

function toInputs(cart: Cart): AddCartLineInput[] {
  return cart.lines.map((line) => ({
    merchantId: cart.merchantId,
    locationId: cart.locationId,
    currency: cart.currency,
    merchantProductId: line.merchantProductId,
    quantity: line.quantity,
    // The guest's snapshot, carried so the restored cart looks like the one
    // they left. NOT checkout truth — revalidation re-reads the shelf before
    // any order exists.
    unitPrice: line.unitPriceSnapshot,
    sourceIngredientSlug: line.sourceIngredientSlug,
    sourceRecipeId: line.sourceRecipeId,
  }));
}

export async function migrateGuestCart(
  userId: string,
  remote: CartRepository,
  local: CartRepository = new LocalCartRepository(),
  now: Date = new Date(),
): Promise<CartMigrationOutcome> {
  try {
    const guest = await local.get();
    if (!guest || guest.lines.length === 0) return { kind: 'nothing_to_migrate' };

    const server = await remote.get();

    // CASE C — two branches. Decided FIRST, because it is the only case where
    // writing anything to the server cart would be wrong.
    if (server && server.lines.length > 0 && server.locationId !== guest.locationId) {
      await parkPendingCart(userId, guest, now);
      // The local cart is cleared only because the pending record now holds
      // it: leaving both would mean the next sign-in parks it a second time.
      await local.clear();
      logInfo('guest_cart_parked', { lines: guest.lines.length });
      return { kind: 'parked', lines: guest.lines.length };
    }

    // CASE A and B. `addLines` already merges by product id and already
    // replaces on a branch change, so the empty-cart and same-branch paths are
    // the same call — and the merge rule stays in one place.
    const outcome = await remote.addLines(toInputs(guest));
    await local.clear();

    const kind = server && server.lines.length > 0 ? 'merged' : 'migrated';
    logInfo('guest_cart_migrated', { kind, lines: guest.lines.length });
    return { kind, lines: outcome.addedLines };
  } catch (error) {
    // The local cart is left intact and unmarked, so the next launch retries.
    // Sign-in is unaffected — losing a basket is bad, failing to sign in is
    // worse, and this is the one place both are on the table.
    logError('guest_cart_migration_failed', error);
    return { kind: 'failed' };
  }
}
