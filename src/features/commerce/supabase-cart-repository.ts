import type { SupabaseClient } from '@supabase/supabase-js';

import { toAppError } from '@/lib/errors';
import type { CartLineRow, CartRow, Database } from '@/lib/supabase/database.types';
import type { Cart, CartLine } from '@/types/commerce';
import type { CurrencyCode, Money } from '@/types/domain';

import {
  mergeLines,
  type AddCartLineInput,
  type AddToCartOutcome,
  type CartRepository,
} from './cart-repository';

/**
 * Supabase-backed cart.
 *
 * Mirrors `LocalCartRepository` exactly, and shares `mergeLines` with it so the
 * one piece of behaviour that is easy to get subtly different — adding a
 * product already in the basket — cannot drift between guest and signed-in.
 *
 * NOTE: the tables this queries exist in `supabase/migrations/` and have NOT
 * been applied to hosted Supabase. Until they are, this class compiles and is
 * unreachable; the app runs on the local repository, which is the documented
 * local-first behaviour rather than a fallback.
 */
export class SupabaseCartRepository implements CartRepository {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async get(): Promise<Cart | null> {
    const { data, error } = await this.client
      .from('carts')
      .select('*')
      .eq('user_id', this.userId)
      .maybeSingle();

    if (error) throw toAppError(error, 'database');
    if (!data) return null;

    return this.withLines(data);
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
      current !== null && current.locationId !== first.locationId;

    // ONE CART, ONE BRANCH. A basket spanning two supermarkets cannot be
    // picked, packed or delivered by either of them, so switching branch
    // replaces rather than merges — and the caller is told, because the user
    // must not discover it at checkout.
    if (replacedMerchant && current) {
      const { error } = await this.client.from('carts').delete().eq('id', current.id);
      if (error) throw toAppError(error, 'database');
    }

    const base = replacedMerchant ? null : current;
    const cartId = base?.id ?? (await this.createCart(first));
    const merged = mergeLines(base?.lines ?? [], inputs);

    // Rewritten wholesale rather than diffed. A cart is a handful of rows, and
    // a diff is where an off-by-one quietly leaves a line behind.
    const { error: clearError } = await this.client
      .from('cart_lines')
      .delete()
      .eq('cart_id', cartId);
    if (clearError) throw toAppError(clearError, 'database');

    const { error: insertError } = await this.client.from('cart_lines').insert(
      merged.map((line) => ({
        id: line.id,
        cart_id: cartId,
        merchant_product_id: line.merchantProductId,
        source_ingredient_slug: line.sourceIngredientSlug,
        source_recipe_id: line.sourceRecipeId,
        quantity: line.quantity,
        unit_price_minor: line.unitPriceSnapshot.amountMinor,
        added_at: line.addedAt,
      })),
    );
    if (insertError) throw toAppError(insertError, 'database');

    const cart = await this.get();
    if (!cart) throw new Error('cart vanished immediately after being written');
    return { cart, replacedMerchant, addedLines: inputs.length };
  }

  async setQuantity(lineId: string, quantity: number): Promise<Cart | null> {
    if (quantity <= 0) return this.removeLine(lineId);

    const { error } = await this.client
      .from('cart_lines')
      .update({ quantity })
      .eq('id', lineId);
    if (error) throw toAppError(error, 'database');

    return this.getOrDrop();
  }

  async removeLine(lineId: string): Promise<Cart | null> {
    const { error } = await this.client.from('cart_lines').delete().eq('id', lineId);
    if (error) throw toAppError(error, 'database');
    return this.getOrDrop();
  }

  async refreshPrices(prices: ReadonlyMap<string, Money>): Promise<Cart | null> {
    const cart = await this.get();
    if (!cart) return null;

    for (const line of cart.lines) {
      const now = prices.get(line.merchantProductId);
      if (!now || now.amountMinor === line.unitPriceSnapshot.amountMinor) continue;

      const { error } = await this.client
        .from('cart_lines')
        .update({ unit_price_minor: now.amountMinor })
        .eq('id', line.id);

      if (error) throw toAppError(error, 'database');
    }

    // Re-read rather than patch in memory: the revision is written by the
    // `cart_lines_bump_revision` trigger, so the database is the only place
    // that knows what it now is.
    return this.get();
  }

  async clear(): Promise<void> {
    const { error } = await this.client.from('carts').delete().eq('user_id', this.userId);
    if (error) throw toAppError(error, 'database');
  }

  /** An empty cart is no cart — the same rule the local repository follows. */
  private async getOrDrop(): Promise<Cart | null> {
    const cart = await this.get();
    if (cart && cart.lines.length === 0) {
      await this.clear();
      return null;
    }
    return cart;
  }

  private async createCart(input: AddCartLineInput): Promise<string> {
    const { data, error } = await this.client
      .from('carts')
      .insert({
        user_id: this.userId,
        merchant_id: input.merchantId,
        merchant_location_id: input.locationId,
        currency: input.currency,
      })
      .select('id')
      .single();

    if (error) throw toAppError(error, 'database');
    return data.id;
  }

  private async withLines(row: CartRow): Promise<Cart> {
    const { data, error } = await this.client
      .from('cart_lines')
      .select('*')
      .eq('cart_id', row.id)
      .order('added_at', { ascending: true });

    if (error) throw toAppError(error, 'database');

    return {
      id: row.id,
      userId: row.user_id,
      merchantId: row.merchant_id,
      locationId: row.merchant_location_id,
      currency: row.currency as CurrencyCode,
      // Maintained by the `cart_lines_bump_revision` trigger, never by us.
      revision: row.revision,
      deliveryFeeSnapshot: null,
      lines: (data ?? []).map((line) => toLine(line, row.currency as CurrencyCode)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

function toLine(row: CartLineRow, currency: CurrencyCode): CartLine {
  return {
    id: row.id,
    merchantProductId: row.merchant_product_id,
    sourceIngredientSlug: row.source_ingredient_slug,
    sourceRecipeId: row.source_recipe_id,
    quantity: row.quantity,
    unitPriceSnapshot: { amountMinor: row.unit_price_minor, currency },
    addedAt: row.added_at,
  };
}
