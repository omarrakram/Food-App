import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useRepositories } from '@/features/data/repositories';
import { INGREDIENTS_BY_SLUG } from '@/features/ingredients/catalogue';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { perPieceWeightFor } from '@/features/pricing/units';
import { toAppError } from '@/lib/errors';
import { queryKeys } from '@/lib/query/client';
import type { Cart, MerchantProduct } from '@/types/commerce';
import type { IngredientMatch } from '@/types/domain';

import { addableLines } from './basket';
import { buildCartView, type CartView } from './cart-view';
import type { AddCartLineInput } from './cart-repository';
import { selectMerchant, type SelectedMerchant } from './merchant-selection';
import type { SourcedLine, SourcingResult } from './ports';
import { requirementsFor, type RequirementsResult } from './requirements';
import { sourceRequest, type SourcingContext } from './sourcing';

/**
 * Commerce hooks.
 *
 * The engines below them are pure and synchronous; these exist to bind them to
 * the user's preferences, the selected branch and the cache. No ranking, no
 * pack arithmetic and no eligibility rule lives here.
 */

/** The branch we are sourcing against, or null when ordering is not possible. */
export function useSelectedMerchant(): SelectedMerchant | null {
  const { preferences } = usePreferences();
  return useMemo(() => selectMerchant(preferences.country), [preferences.country]);
}

/**
 * The user's hard exclusions, straight from their allergen preferences.
 *
 * Read here rather than passed in, so no screen can source a basket while
 * forgetting to apply somebody's allergies.
 */
function useSourcingContext(): SourcingContext {
  const { preferences } = usePreferences();

  return useMemo(
    () => ({
      avoidAllergens: preferences.allergens,
      perPieceFor: (slug: string) => perPieceWeightFor(INGREDIENTS_BY_SLUG.get(slug) ?? null),
    }),
    [preferences.allergens],
  );
}

export type RecipeSourcing = {
  readonly merchant: SelectedMerchant;
  readonly requirements: RequirementsResult;
  readonly result: SourcingResult;
  /** Lines safe to add without asking: matched, eligible, purchasable. */
  readonly addable: readonly SourcedLine[];
};

/**
 * Sources one recipe's missing ingredients against the selected branch.
 *
 * Returns null — rather than an empty result — when no branch can be selected,
 * so a screen renders its "not available here" state instead of an empty
 * basket that looks like a shop with nothing in it.
 */
export function useRecipeSourcing(
  recipeId: string,
  missing: readonly IngredientMatch[],
): RecipeSourcing | null {
  const merchant = useSelectedMerchant();
  const context = useSourcingContext();

  return useMemo(() => {
    if (!merchant) return null;

    const requirements = requirementsFor(missing, recipeId);
    const result = sourceRequest(
      {
        lines: requirements.lines,
        merchantId: merchant.merchant.id,
        locationId: merchant.location.id,
      },
      merchant.candidatesFor,
      context,
    );

    return {
      merchant,
      requirements,
      result,
      addable: addableLines(result),
    };
  }, [merchant, context, missing, recipeId]);
}

export function useCart() {
  const { cart, scopeKey } = useRepositories();

  return useQuery({
    queryKey: queryKeys.cart(scopeKey),
    queryFn: async () => {
      try {
        return await cart.get();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

export function useCartMutations() {
  const { cart, scopeKey } = useRepositories();
  const queryClient = useQueryClient();
  const key = queryKeys.cart(scopeKey);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient, key]);

  const addLines = useMutation({
    mutationFn: async (inputs: readonly AddCartLineInput[]) => {
      try {
        return await cart.addLines(inputs);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onSuccess: invalidate,
  });

  const setQuantity = useMutation({
    mutationFn: async ({ lineId, quantity }: { lineId: string; quantity: number }) => {
      try {
        return await cart.setQuantity(lineId, quantity);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onSuccess: invalidate,
  });

  const removeLine = useMutation({
    mutationFn: async (lineId: string) => {
      try {
        return await cart.removeLine(lineId);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onSuccess: invalidate,
  });

  const clear = useMutation({
    mutationFn: async () => {
      try {
        await cart.clear();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onSuccess: invalidate,
  });

  return { addLines, setQuantity, removeLine, clear };
}

/** Turns sourced lines into cart inputs. One place, so the mapping is one rule. */
export function toCartInputs(
  sourcing: RecipeSourcing,
  lines: readonly SourcedLine[],
  recipeId: string,
): AddCartLineInput[] {
  const inputs: AddCartLineInput[] = [];

  for (const line of lines) {
    const chosen = line.chosen;
    // Both guards are `addableLines`' rules restated at the point money is
    // committed. Callers are supposed to pass addable lines; this makes a
    // caller that does not fail quietly rather than expensively.
    if (!chosen || chosen.packsNeeded === null) continue;

    inputs.push({
      merchantId: sourcing.merchant.merchant.id,
      locationId: sourcing.merchant.location.id,
      currency: sourcing.merchant.merchant.currency,
      merchantProductId: chosen.product.id,
      quantity: chosen.packsNeeded,
      unitPrice: chosen.product.price,
      sourceIngredientSlug: line.requested.ingredientSlug,
      sourceRecipeId: recipeId,
    });
  }

  return inputs;
}

/**
 * Why a cart cannot be shown, when it cannot.
 *
 * `unknown_merchant` is the one that matters: a cart whose branch is no longer
 * selectable — the demo catalogue switched off, a partner withdrawn — must not
 * render as an ordinary basket, because none of its prices can be trusted and
 * none of its lines can be ordered.
 */
export type CartProblem = 'unknown_merchant';

export type CartState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: unknown; readonly refetch: () => void }
  | { readonly kind: 'empty' }
  | { readonly kind: 'problem'; readonly problem: CartProblem; readonly cart: Cart }
  | { readonly kind: 'ready'; readonly view: CartView; readonly isRefreshing: boolean };

/**
 * The catalogue rows for a cart's lines.
 *
 * Separate from the cart query because they have different lifetimes: the cart
 * is the user's own durable state, these are a read of somebody else's shelf
 * that is stale the moment it lands.
 */
function useCartProducts(
  merchant: SelectedMerchant | null,
  cart: Cart | null | undefined,
): { products: ReadonlyMap<string, MerchantProduct>; isFetching: boolean } {
  const ids = useMemo(
    () => (cart ? cart.lines.map((line) => line.merchantProductId) : []),
    [cart],
  );

  const enabled = Boolean(merchant) && ids.length > 0 && cart?.merchantId === merchant?.merchant.id;

  const query = useQuery({
    queryKey: queryKeys.merchantProducts(merchant?.location.id ?? 'none', ids),
    enabled,
    queryFn: async () => {
      if (!merchant) return [] as readonly MerchantProduct[];
      try {
        return await merchant.catalogue.getProducts(ids);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });

  const products = useMemo(() => {
    const map = new Map<string, MerchantProduct>();
    for (const product of query.data ?? []) map.set(product.id, product);
    return map;
  }, [query.data]);

  return { products, isFetching: query.isFetching };
}

/**
 * Everything the cart screen needs, as one discriminated state.
 *
 * TOTALS ARE COMPUTED FROM THE SNAPSHOT PRICES, not from the catalogue read.
 * The snapshot is what the user was shown when they added the line, and
 * silently re-totalling a basket underneath somebody is how a shop loses an
 * argument about what they agreed to pay. A changed price is SURFACED per line
 * instead; reconciling it belongs to checkout, which does not exist yet.
 */
export function useCartView(): CartState {
  const merchant = useSelectedMerchant();
  const { data: cart, isLoading, isError, error, refetch } = useCart();
  const { products, isFetching } = useCartProducts(merchant, cart);

  const refetchCart = useCallback(() => {
    void refetch();
  }, [refetch]);

  return useMemo<CartState>(() => {
    if (isLoading) return { kind: 'loading' };
    if (isError) return { kind: 'error', error, refetch: refetchCart };
    if (!cart || cart.lines.length === 0) return { kind: 'empty' };

    if (!merchant || merchant.merchant.id !== cart.merchantId) {
      return { kind: 'problem', problem: 'unknown_merchant', cart };
    }

    return {
      kind: 'ready',
      isRefreshing: isFetching,
      view: buildCartView(cart, merchant, products),
    };
  }, [cart, isLoading, isError, error, refetchCart, merchant, products, isFetching]);
}

export type { CartLineView, CartView } from './cart-view';
