import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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

import { buildIndexFor, checkRecipe, suggestRelaxations, type Relaxation } from './filter';
import {
  planQuery,
  planFingerprint,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type RecipePage,
} from './query';
import { toConstraints } from './to-constraints';
import { describeMatch, rankRecipes } from './rank';
import { requestFingerprint } from './request-params';

const catalogueKey = (scope: string) => ['akla', 'recipes', 'catalogue', scope] as const;

/**
 * The whole catalogue, for the screens that rank it as a set.
 *
 * `enabled` exists so a screen that is normally served by the paginated query
 * path can still reach for the full set on the one occasion it needs it —
 * counting honest relaxation options for an empty result — without paying for
 * that fetch on every search that worked.
 */
export function useRecipeCatalogue(enabled = true) {
  const { recipes, scopeKey } = useRepositories();

  return useQuery({
    queryKey: catalogueKey(scopeKey),
    enabled,
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
 * Ranks and prices a pool of recipes, and explains an empty result.
 *
 * Shared by the two ways a screen gets its pool: the whole catalogue (ranking
 * is the product) and one page of a database query (the query already did the
 * narrowing). Splitting it out is what keeps the two paths honest — the same
 * hard filter, the same pricing, the same relaxation logic either way.
 */
function useRanked(
  pool: readonly Recipe[] | undefined,
  request: MealRequest,
  limit: number,
  extraRecipes: readonly Recipe[],
  /**
   * The set relaxation counts are measured against. Must be the WIDEST set
   * available, not the narrowed page: "drop the time limit → 34 recipes" is a
   * lie if it was counted over the twenty-four rows a query already returned.
   */
  relaxationPool: readonly Recipe[] | undefined,
): { matches: RecipeMatch[]; relaxations: Relaxation[] } {
  const pantry = usePantryItems();

  const matches = useMemo(() => {
    if (!pool) return [];
    return rankRecipes([...pool, ...extraRecipes], request, {
      pantryItems: pantry.data ?? [],
      limit,
    });
  }, [pool, pantry.data, request, limit, extraRecipes]);

  const relaxations = useMemo(() => {
    if (matches.length > 0 || !relaxationPool) return [];
    return suggestRelaxations([...relaxationPool, ...extraRecipes], toConstraints(request), {
      pantryItems: pantry.data ?? [],
    });
  }, [matches.length, relaxationPool, extraRecipes, request, pantry.data]);

  return { matches, relaxations };
}

/**
 * Local recipe suggestions.
 *
 * Deliberately deterministic and offline: the curated catalogue is filtered,
 * priced and ranked on-device. AI generation supplements these results, it does
 * not replace them — so the app still answers "what can I eat?" with no
 * network and no API key.
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
  const { matches, relaxations } = useRanked(
    catalogue.data,
    request,
    limit,
    extraRecipes,
    catalogue.data,
  );

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
 * Answers locally first, then merges generated recipes in when they arrive.
 * The local answer is never gated on the network: "what can I cook?" resolves
 * offline, with or without an API key.
 *
 * `source` picks where the pool comes from, and the two are genuinely
 * different problems:
 *
 *   `catalogue` — cook and budget mode. The request barely narrows anything
 *     (everyone can cook with what they have), so the answer is "rank the
 *     whole set and show the top twenty" and the ORDER is the product.
 *   `query`     — search. The request is highly selective, so the database
 *     does the narrowing over its indexes and only a page comes back. Fetching
 *     the catalogue to find nine matching recipes is the thing this avoids.
 */
export function useMealSuggestions(
  request: MealRequest,
  limit = 20,
  options: { source?: 'catalogue' | 'query' } = {},
) {
  const { status } = useAuth();
  const { source = 'catalogue' } = options;

  // Generation needs a signed-in caller: the edge function derives the user
  // from their JWT to rate-limit and account for the call.
  const aiEnabled = status === 'signed_in' && env.hasSupabase;
  const ai = useAiSuggestions(request, aiEnabled);
  const generated = ai.data?.recipes ?? EMPTY_RECIPES;

  const search = useRecipeSearch(request, {
    pageSize: MAX_PAGE_SIZE,
    enabled: source === 'query',
  });

  // The full catalogue is fetched on the query path ONLY to count relaxation
  // options once a search has come back empty. That is the one moment the
  // wider set is worth its cost, and by then the user is stuck anyway.
  const needsWiderSet =
    source === 'catalogue' || (!search.isLoading && search.matches.length === 0);
  const catalogue = useRecipeCatalogue(needsWiderSet);

  const pool = source === 'query' ? search.recipes : catalogue.data;
  const { matches, relaxations } = useRanked(pool, request, limit, generated, catalogue.data);

  return {
    matches,
    relaxations,
    isLoading: source === 'query' ? search.isLoading : catalogue.isLoading,
    /** True while generation is still in flight but local results already show. */
    isGenerating: ai.isFetching,
    error: (source === 'query' ? search.error : catalogue.error) ?? undefined,
    /** Set when generation failed. Local results are unaffected. */
    generationError: ai.data?.error ?? null,
    /** More pages exist for this query. Only ever true on the `query` source. */
    hasMore: source === 'query' && search.hasNextPage,
    isLoadingMore: search.isFetchingNextPage,
    loadMore: search.fetchNextPage,
    refetch: () => {
      if (source === 'query') search.refetch();
      else void catalogue.refetch();
      if (aiEnabled) void ai.refetch();
    },
  };
}

/** Stable identity so the memo in `useLocalSuggestions` does not thrash. */
const EMPTY_RECIPES: readonly Recipe[] = [];

/**
 * A paginated, database-filtered slice of the catalogue.
 *
 * The other suggestion hooks pull the whole catalogue and rank it in memory,
 * which is the right shape for "what should I eat tonight?" — the answer is
 * twenty recipes and the ordering IS the product. Browsing is the opposite
 * shape: hundreds of rows, no meaningful global order beyond recency, and a
 * user who will look at the first dozen. So this one pushes the constraints
 * into SQL and walks pages, keeping the order the database returned.
 *
 * The client-side hard filter still runs on every page. The database narrows;
 * it does not protect. A plan that is subtly wrong, a row whose declared
 * allergens are stale, or the offline fallback path must not be able to put an
 * allergen on screen.
 */
export function useRecipeSearch(
  request: MealRequest,
  options: { tags?: readonly string[]; pageSize?: number; enabled?: boolean } = {},
): {
  matches: RecipeMatch[];
  /** The same recipes, for callers that want to rank them themselves. */
  recipes: Recipe[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  /** True when the database could not answer and the bundled catalogue did. */
  isFallback: boolean;
  error: unknown;
  refetch: () => void;
} {
  const { recipes: repository, scopeKey } = useRepositories();
  const pantry = usePantryItems();
  const { tags = EMPTY_TAGS, pageSize = DEFAULT_PAGE_SIZE, enabled = true } = options;

  const constraints = useMemo(
    () => ({ ...toConstraints(request), tags: [...tags] }),
    [request, tags],
  );

  const plan = useMemo(
    () => planQuery({ constraints, limit: pageSize }),
    [constraints, pageSize],
  );

  const query = useInfiniteQuery({
    queryKey: ['akla', 'recipes', 'search', scopeKey, planFingerprint(plan)] as const,
    enabled,
    initialPageParam: null as string | null,
    getNextPageParam: (last: RecipePage) => last.nextCursor,
    queryFn: async ({ pageParam }) => {
      try {
        return await repository.search({ ...plan, cursor: pageParam });
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });

  const pages = query.data?.pages ?? EMPTY_PAGES;

  const matches = useMemo(() => {
    const index = buildIndexFor(constraints, { pantryItems: pantry.data ?? [] });
    const seen = new Set<string>();
    const kept: RecipeMatch[] = [];
    for (const page of pages) {
      for (const recipe of page.recipes) {
        // A cursor page can repeat a row when the catalogue changed under the
        // scroll; two cards for one recipe is a visible bug, so dedupe here.
        if (seen.has(recipe.id)) continue;
        seen.add(recipe.id);
        if (checkRecipe(recipe, constraints, index) !== null) continue;
        kept.push(describeMatch(recipe, request, index));
      }
    }
    return kept;
  }, [pages, constraints, request, pantry.data]);

  return {
    matches,
    recipes: useMemo(() => matches.map((match) => match.recipe), [matches]),
    isLoading: query.isLoading || pantry.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    isFallback: pages.some((page) => page.isFallback),
    error: query.error ?? undefined,
    refetch: () => {
      void query.refetch();
    },
  };
}

/** Stable identities so the memos above do not thrash. */
const EMPTY_PAGES: readonly RecipePage[] = [];
const EMPTY_TAGS: readonly string[] = [];
