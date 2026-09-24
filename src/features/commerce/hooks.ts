import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useRepositories } from '@/features/data/repositories';
import { INGREDIENTS_BY_SLUG } from '@/features/ingredients/catalogue';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { perPieceWeightFor } from '@/features/pricing/units';
import { toAppError } from '@/lib/errors';
import { queryKeys } from '@/lib/query/client';
import type { IngredientMatch } from '@/types/domain';

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
      // ONLY `matched`. Anything needing confirmation, anything out of stock,
      // anything ruled out for this user and anything unmapped is deliberately
      // excluded — a bulk action must never quietly add a line the cook has
      // not seen.
      addable: result.lines.filter((line) => line.status === 'matched'),
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
