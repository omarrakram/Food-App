import { LocalCollection, LocalCollectionKeys, newId, nowISO } from '@/lib/storage/local-collection';
import type { Cart, CartLine } from '@/types/commerce';
import type { CurrencyCode, Money } from '@/types/domain';

/**
 * The cart.
 *
 * ONE CART, ONE MERCHANT. Not a simplification to be relaxed later — a basket
 * spanning two supermarkets cannot be picked, packed or delivered by either of
 * them, so it is not a cart, it is a shopping list with prices on it. Adding
 * from a different branch REPLACES the cart, loudly, rather than silently
 * mixing two catalogues into one order nobody can fulfil.
 *
 * Follows the repository pattern the rest of the app uses: an interface, a
 * local implementation for guests, a Supabase one for signed-in users, and a
 * caller that never learns which is active.
 */

export type AddCartLineInput = {
  readonly merchantId: string;
  readonly locationId: string;
  readonly currency: CurrencyCode;
  readonly merchantProductId: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly sourceIngredientSlug?: string | null;
  readonly sourceRecipeId?: string | null;
};

/**
 * What adding to a cart did.
 *
 * `replaced_merchant` is a real outcome, not an error: the user asked for
 * something from another branch and got it, and the screen has to say the old
 * basket is gone rather than let them discover it at checkout.
 */
export type AddToCartOutcome = {
  readonly cart: Cart;
  readonly replacedMerchant: boolean;
  readonly addedLines: number;
};

export interface CartRepository {
  /** The single open cart, or null. */
  get(): Promise<Cart | null>;
  addLines(inputs: readonly AddCartLineInput[]): Promise<AddToCartOutcome>;
  setQuantity(lineId: string, quantity: number): Promise<Cart | null>;
  removeLine(lineId: string): Promise<Cart | null>;
  clear(): Promise<void>;
}

export const LOCAL_CART_ID = 'local-cart';

/** Sum of every line at its snapshot price. */
export function cartSubtotalMinor(cart: Cart): number {
  return cart.lines.reduce(
    (sum, line) => sum + line.unitPriceSnapshot.amountMinor * line.quantity,
    0,
  );
}

export function buildCartLine(input: AddCartLineInput): CartLine {
  return {
    id: newId(),
    merchantProductId: input.merchantProductId,
    sourceIngredientSlug: input.sourceIngredientSlug ?? null,
    sourceRecipeId: input.sourceRecipeId ?? null,
    quantity: input.quantity,
    unitPriceSnapshot: input.unitPrice,
    addedAt: nowISO(),
  };
}

/**
 * Merges an addition into an existing cart.
 *
 * Adding the same product twice increases the quantity rather than producing
 * two lines, which is the same rule the shopping list already follows and the
 * same reason: two lines for one product is a basket the user has to reconcile
 * by hand.
 *
 * Pure, so the local and Supabase repositories cannot drift on the one piece
 * of behaviour that is easy to get subtly different.
 */
export function mergeLines(
  existing: readonly CartLine[],
  inputs: readonly AddCartLineInput[],
): CartLine[] {
  const lines = [...existing];

  for (const input of inputs) {
    const index = lines.findIndex((line) => line.merchantProductId === input.merchantProductId);
    const found = index === -1 ? undefined : lines[index];

    if (found) {
      lines[index] = {
        ...found,
        quantity: found.quantity + input.quantity,
        // The price snapshot is REFRESHED on re-add: the second addition is a
        // fresh read of the shelf, and keeping the older number would quote a
        // price we have just seen is no longer current.
        unitPriceSnapshot: input.unitPrice,
      };
      continue;
    }

    lines.push(buildCartLine(input));
  }

  return lines;
}

export class LocalCartRepository implements CartRepository {
  private readonly collection = new LocalCollection<Cart>(LocalCollectionKeys.cart);

  async get(): Promise<Cart | null> {
    const [cart] = await this.collection.list();
    return cart ?? null;
  }

  async addLines(inputs: readonly AddCartLineInput[]): Promise<AddToCartOutcome> {
    const first = inputs[0];
    if (!first) {
      const cart = await this.get();
      if (!cart) throw new Error('addLines called with no lines and no cart');
      return { cart, replacedMerchant: false, addedLines: 0 };
    }

    const current = await this.get();
    const replacedMerchant =
      current !== null && locationKey(current) !== locationKey(first);

    const base: Cart =
      current && !replacedMerchant
        ? current
        : {
            id: LOCAL_CART_ID,
            userId: null,
            merchantId: first.merchantId,
            locationId: first.locationId,
            currency: first.currency,
            lines: [],
            createdAt: nowISO(),
            updatedAt: nowISO(),
          };

    const next: Cart = {
      ...base,
      lines: mergeLines(base.lines, inputs),
      updatedAt: nowISO(),
    };

    await this.collection.replaceAll([next]);
    return { cart: next, replacedMerchant, addedLines: inputs.length };
  }

  async setQuantity(lineId: string, quantity: number): Promise<Cart | null> {
    const cart = await this.get();
    if (!cart) return null;

    // Zero is a removal, not a line worth nothing.
    const lines =
      quantity <= 0
        ? cart.lines.filter((line) => line.id !== lineId)
        : cart.lines.map((line) => (line.id === lineId ? { ...line, quantity } : line));

    return this.persist({ ...cart, lines, updatedAt: nowISO() });
  }

  async removeLine(lineId: string): Promise<Cart | null> {
    const cart = await this.get();
    if (!cart) return null;
    return this.persist({
      ...cart,
      lines: cart.lines.filter((line) => line.id !== lineId),
      updatedAt: nowISO(),
    });
  }

  async clear(): Promise<void> {
    await this.collection.replaceAll([]);
  }

  private async persist(cart: Cart): Promise<Cart | null> {
    // An empty cart is no cart. Keeping the shell around would leave a branch
    // selected that the user never chose on their next visit.
    if (cart.lines.length === 0) {
      await this.collection.replaceAll([]);
      return null;
    }
    await this.collection.replaceAll([cart]);
    return cart;
  }
}

/** A cart belongs to one BRANCH, not one chain — stock and prices differ. */
function locationKey(input: Pick<AddCartLineInput, 'merchantId' | 'locationId'>): string {
  return `${input.merchantId}::${input.locationId}`;
}
