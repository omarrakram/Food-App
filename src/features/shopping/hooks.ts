import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useRepositories } from '@/features/data/repositories';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { toAppError } from '@/lib/errors';
import type { ShoppingListItem } from '@/types/domain';

import { estimateListTotal, type AddShoppingItemInput } from './repository';

const shoppingKey = (scope: string) => ['akla', 'shopping', scope] as const;

export function useShoppingList() {
  const { shopping, scopeKey } = useRepositories();

  return useQuery({
    queryKey: shoppingKey(scopeKey),
    queryFn: async () => {
      try {
        return await shopping.list();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

/** Deterministic estimated total for the unchecked items on the list. */
export function useShoppingTotal(items: readonly ShoppingListItem[] | undefined) {
  const { preferences } = usePreferences();
  if (!items || items.length === 0) return null;
  return estimateListTotal(items, preferences.country, preferences.currency);
}

export function useShoppingMutations() {
  const { shopping, scopeKey } = useRepositories();
  const queryClient = useQueryClient();
  const key = shoppingKey(scopeKey);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient, key]);

  const addMany = useMutation({
    mutationFn: async (inputs: readonly AddShoppingItemInput[]) => {
      try {
        return await shopping.addMany(inputs);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onSuccess: invalidate,
  });

  const add = useMutation({
    mutationFn: async (input: AddShoppingItemInput) => {
      try {
        return await shopping.add(input);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onSuccess: invalidate,
  });

  const toggle = useMutation({
    mutationFn: async ({ id, isChecked }: { id: string; isChecked: boolean }) => {
      try {
        await shopping.setChecked(id, isChecked);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    // Ticking items off in a shop must be instant and survive a slow network.
    onMutate: async ({ id, isChecked }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ShoppingListItem[]>(key);
      queryClient.setQueryData<ShoppingListItem[]>(key, (items) =>
        items?.map((item) => (item.id === id ? { ...item, isChecked } : item)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      try {
        await shopping.remove(id);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ShoppingListItem[]>(key);
      queryClient.setQueryData<ShoppingListItem[]>(key, (items) =>
        items?.filter((item) => item.id !== id),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: invalidate,
  });

  const clearChecked = useMutation({
    mutationFn: async () => {
      try {
        await shopping.clearChecked();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onSuccess: invalidate,
  });

  return { add, addMany, toggle, remove, clearChecked };
}
