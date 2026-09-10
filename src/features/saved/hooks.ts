import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRepositories } from '@/features/data/repositories';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { toAppError } from '@/lib/errors';
import type { Recipe } from '@/types/domain';

import type { HistoryKind, SavedRecipe } from './repository';

const savedKey = (scope: string) => ['akla', 'saved', scope] as const;
const historyKey = (scope: string, kind: HistoryKind) =>
  ['akla', 'history', scope, kind] as const;

export function useSavedRecipes() {
  const { saved, scopeKey } = useRepositories();

  return useQuery({
    queryKey: savedKey(scopeKey),
    queryFn: async () => {
      try {
        return await saved.list();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

export function useIsSaved(recipeId: string | undefined) {
  const query = useSavedRecipes();
  return Boolean(recipeId && query.data?.some((item) => item.recipeId === recipeId));
}

export function useToggleSave() {
  const { saved, scopeKey } = useRepositories();
  const queryClient = useQueryClient();
  const key = savedKey(scopeKey);

  return useMutation({
    mutationFn: async ({ recipe, shouldSave }: { recipe: Recipe; shouldSave: boolean }) => {
      try {
        if (shouldSave) await saved.save(recipe);
        else await saved.unsave(recipe.id);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onMutate: async ({ recipe, shouldSave }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SavedRecipe[]>(key);
      queryClient.setQueryData<SavedRecipe[]>(key, (items = []) =>
        shouldSave
          ? [
              { id: `optimistic-${recipe.id}`, recipeId: recipe.id, recipe, savedAt: new Date().toISOString() },
              ...items,
            ]
          : items.filter((item) => item.recipeId !== recipe.id),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useRecipeHistory(kind: HistoryKind) {
  const { history, scopeKey } = useRepositories();

  return useQuery({
    queryKey: historyKey(scopeKey, kind),
    queryFn: async () => {
      try {
        return await history.list(kind);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

/**
 * Records an interaction signal.
 *
 * PRIVACY: silently does nothing when the user has turned personalisation off,
 * so the setting is a real switch rather than a display preference.
 */
export function useRecordHistory() {
  const { history, scopeKey } = useRepositories();
  const { preferences } = usePreferences();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ recipe, kind }: { recipe: Recipe; kind: HistoryKind }) => {
      if (!preferences.personalisationEnabled) return;
      try {
        await history.record(recipe, kind);
      } catch {
        // History is a nicety; failing to record it must never break a flow.
      }
    },
    onSuccess: (_data, { kind }) => {
      void queryClient.invalidateQueries({ queryKey: historyKey(scopeKey, kind) });
    },
  });
}
