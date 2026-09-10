import { QueryClient } from '@tanstack/react-query';

import { AppError, isRetryableError } from '@/lib/errors';

/**
 * Shared query client.
 *
 * Defaults are tuned for a mobile app on a possibly-flaky connection:
 * generous stale times to avoid refetch storms, and retries only for errors
 * that could plausibly succeed on a second attempt.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Recipe and pantry data changes rarely within a session.
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        retry: (failureCount, error) => {
          if (failureCount >= 2) return false;
          return isRetryableError(error);
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        refetchOnWindowFocus: false,
        // React Native has no window focus; reconnect is the useful trigger.
        refetchOnReconnect: true,
      },
      mutations: {
        retry: (failureCount, error) => failureCount < 1 && isRetryableError(error),
      },
    },
  });
}

/**
 * Query key factory.
 *
 * Every key in the app is built here so invalidations can never miss a
 * cache entry because of a typo'd string array.
 */
export const queryKeys = {
  all: ['akla'] as const,

  profile: (userId: string) => ['akla', 'profile', userId] as const,
  preferences: (userId: string) => ['akla', 'preferences', userId] as const,

  pantry: (userId: string) => ['akla', 'pantry', userId] as const,
  pantryItem: (userId: string, itemId: string) => ['akla', 'pantry', userId, itemId] as const,

  ingredients: () => ['akla', 'ingredients'] as const,
  ingredientSearch: (term: string) => ['akla', 'ingredients', 'search', term] as const,

  recipe: (recipeId: string) => ['akla', 'recipe', recipeId] as const,
  recipeCollection: (slug: string) => ['akla', 'recipes', 'collection', slug] as const,
  recipeSuggestions: (requestHash: string) => ['akla', 'recipes', 'suggest', requestHash] as const,

  savedRecipes: (userId: string) => ['akla', 'saved', userId] as const,
  recipeHistory: (userId: string, kind: string) => ['akla', 'history', userId, kind] as const,

  shoppingList: (userId: string) => ['akla', 'shopping', userId] as const,

  priceEstimates: (country: string) => ['akla', 'prices', country] as const,
} as const;

export { AppError };
