import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useRepositories } from '@/features/data/repositories';
import { usePantryItems } from '@/features/pantry/hooks';
import { usePreferences, requestDefaultsFrom } from '@/features/preferences/preferences-provider';
import { toAppError } from '@/lib/errors';
import type { MealRequest, Recipe, RecipeMatch } from '@/types/domain';

import { rankRecipes } from './rank';

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
export function useLocalSuggestions(request: MealRequest, limit = 20): {
  matches: RecipeMatch[];
  isLoading: boolean;
  recipes: Recipe[];
} {
  const catalogue = useRecipeCatalogue();
  const pantry = usePantryItems();

  const matches = useMemo(() => {
    if (!catalogue.data) return [];
    return rankRecipes(catalogue.data, request, {
      pantryItems: pantry.data ?? [],
      limit,
    });
  }, [catalogue.data, pantry.data, request, limit]);

  return {
    matches,
    isLoading: catalogue.isLoading || pantry.isLoading,
    recipes: catalogue.data ?? [],
  };
}

/**
 * The suggestion entry point every results screen uses.
 *
 * Phase 2 answers purely from the local catalogue. Phase 6 layers AI-generated
 * recipes on top inside this same hook (see `useAiSuggestions`), so screens do
 * not change when generation is switched on.
 */
export function useMealSuggestions(request: MealRequest, limit = 20) {
  const local = useLocalSuggestions(request, limit);
  const catalogue = useRecipeCatalogue();

  return {
    matches: local.matches,
    isLoading: local.isLoading,
    error: catalogue.error ?? undefined,
    refetch: () => {
      void catalogue.refetch();
    },
  };
}
