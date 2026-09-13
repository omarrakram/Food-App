import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { requestSuggestions } from '@/features/ai/client';
import { useAuth } from '@/features/auth/auth-provider';
import { useRepositories } from '@/features/data/repositories';
import { expiringSoonItems } from '@/features/ingredients/freshness';
import { usePantryItems } from '@/features/pantry/hooks';
import { usePreferences, requestDefaultsFrom } from '@/features/preferences/preferences-provider';
import { env } from '@/lib/config/env';
import { toAppError } from '@/lib/errors';
import type { MealRequest, Recipe, RecipeMatch } from '@/types/domain';

import { suggestRelaxations, type Relaxation } from './filter';
import { toConstraints } from './to-constraints';
import { rankRecipes } from './rank';
import { requestFingerprint } from './request-params';

const catalogueKey = (scope: string) => ['akla', 'recipes', 'catalogue', scope] as const;

export function useRecipeCatalogue() {
  const { recipes, scopeKey } = useRepositories();

  return useQuery({
    queryKey: catalogueKey(scopeKey),
    queryFn: async () => {
      try {
        return await recipes.catalogue();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    // Catalogue content is stable within a session; the repository already
    // falls back to the bundled set when the network is unavailable.
    staleTime: 5 * 60_000,
  });
}

export function useRecipe(recipeId: string | undefined) {
  const { recipes, scopeKey } = useRepositories();

  return useQuery({
    queryKey: ['akla', 'recipe', scopeKey, recipeId ?? 'none'] as const,
    enabled: Boolean(recipeId),
    queryFn: async () => {
      if (!recipeId) return null;
      try {
        return await recipes.byId(recipeId);
      } catch (error) {
        throw toAppError(error, 'not_found');
      }
    },
  });
}

/**
 * Builds a complete `MealRequest` from the user's saved preferences plus the
 * fields a screen collected. Preferences are copied in at request time so a
 * result set stays reproducible even if the user edits preferences afterwards.
 */
export function useMealRequest(overrides: Partial<MealRequest> & Pick<MealRequest, 'mode'>) {
  const { preferences } = usePreferences();

  return useMemo<MealRequest>(() => {
    const defaults = requestDefaultsFrom(preferences);
    return {
      ingredients: [],
      budgetMinor: null,
      mealType: null,
      cuisine: null,
      maxMinutes: null,
      minProteinGrams: null,
      maxCalories: null,
      query: null,
      ...defaults,
      ...overrides,
    };
  }, [preferences, overrides]);
}

/**
 * Local recipe suggestions.
 *
 * Deliberately deterministic and offline: the curated catalogue is filtered,
 * priced and ranked on-device. AI generation (Phase 6) supplements these
 * results, it does not replace them — so the app still answers "what can I
 * eat?" with no network and no API key.
 */
export function useLocalSuggestions(
  request: MealRequest,
  limit = 20,
  /**
   * Extra recipes to rank alongside the catalogue — currently AI-generated
   * ones. They go THROUGH `rankRecipes`, not around it, so the allergen and
   * diet filters apply to generated recipes exactly as they do to curated
   * ones. This is the second of the two allergen checks.
   */
  extraRecipes: readonly Recipe[] = [],
): {
  matches: RecipeMatch[];
  isLoading: boolean;
  recipes: Recipe[];
  /**
   * What the user could give up to get results, when nothing matched.
   *
   * Computed only on an empty result set, because it costs one filter pass per
   * blocking constraint. Never contains an allergy, a diet or a hard avoid.
   */
  relaxations: Relaxation[];
} {
  const catalogue = useRecipeCatalogue();
  const pantry = usePantryItems();

  const matches = useMemo(() => {
    if (!catalogue.data) return [];
    return rankRecipes([...catalogue.data, ...extraRecipes], request, {
      pantryItems: pantry.data ?? [],
      limit,
    });
  }, [catalogue.data, pantry.data, request, limit, extraRecipes]);

  const relaxations = useMemo(() => {
    if (matches.length > 0 || !catalogue.data) return [];
    return suggestRelaxations([...catalogue.data, ...extraRecipes], toConstraints(request), {
      pantryItems: pantry.data ?? [],
    });
  }, [matches.length, catalogue.data, extraRecipes, request, pantry.data]);

  return {
    matches,
    isLoading: catalogue.isLoading || pantry.isLoading,
    recipes: catalogue.data ?? [],
    relaxations,
  };
}

/**
 * AI-generated recipes for a request.
 *
 * Supplements the catalogue, never replaces it. Disabled when signed out or
 * unconfigured, and a failure resolves to an empty list plus an error the
 * caller may surface — the results screen still has local matches to show.
 */
export function useAiSuggestions(request: MealRequest, enabled: boolean) {
  const pantry = usePantryItems();
  const { recipes: repository } = useRepositories();

  const expiring = useMemo(
    () => expiringSoonItems(pantry.data ?? []).map((item) => item.ingredientName),
    [pantry.data],
  );

  const fingerprint = useMemo(() => requestFingerprint(request), [request]);

  return useQuery({
    queryKey: ['akla', 'ai', 'suggest', fingerprint] as const,
    enabled,
    // A generation costs real money, so the same request within a session is
    // answered from cache rather than regenerated.
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await requestSuggestions({ request, expiringSoon: expiring, signal });
      // Cache generated recipes locally so their detail pages resolve after
      // the results screen is gone.
      if (result.recipes.length > 0) {
        await repository.cacheGenerated(result.recipes);
      }
      return result;
    },
  });
}

/**
 * The suggestion entry point every results screen uses.
 *
 * Answers from the local catalogue immediately, then merges generated recipes
 * in when they arrive. The local answer is never gated on the network: "what
 * can I cook?" resolves offline, with or without an API key.
 */
export function useMealSuggestions(request: MealRequest, limit = 20) {
  const { status } = useAuth();
  const catalogue = useRecipeCatalogue();

  // Generation needs a signed-in caller: the edge function derives the user
  // from their JWT to rate-limit and account for the call.
  const aiEnabled = status === 'signed_in' && env.hasSupabase;
  const ai = useAiSuggestions(request, aiEnabled);

  const generated = ai.data?.recipes ?? EMPTY_RECIPES;
  const local = useLocalSuggestions(request, limit, generated);

  return {
    matches: local.matches,
    relaxations: local.relaxations,
    isLoading: local.isLoading,
    /** True while generation is still in flight but local results already show. */
    isGenerating: ai.isFetching,
    error: catalogue.error ?? undefined,
    /** Set when generation failed. Local results are unaffected. */
    generationError: ai.data?.error ?? null,
    refetch: () => {
      void catalogue.refetch();
      if (aiEnabled) void ai.refetch();
    },
  };
}

/** Stable identity so the memo in `useLocalSuggestions` does not thrash. */
const EMPTY_RECIPES: readonly Recipe[] = [];
