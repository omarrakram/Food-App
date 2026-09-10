import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useRepositories } from '@/features/data/repositories';
import { expiringSoonItems } from '@/features/ingredients/freshness';
import { toAppError } from '@/lib/errors';
import type { PantryItem } from '@/types/domain';

import type { CreatePantryInput, UpdatePantryInput } from './repository';

/** Query keys are scoped by user so signing out cannot leak cached rows. */
const pantryKey = (scope: string) => ['akla', 'pantry', scope] as const;

export function usePantryItems() {
  const { pantry, scopeKey } = useRepositories();

  return useQuery({
    queryKey: pantryKey(scopeKey),
    queryFn: async () => {
      try {
        return await pantry.list();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

/** Items close to their date, most urgent first. Drives the Home nudge. */
export function useExpiringSoon() {
  const query = usePantryItems();
  return {
    ...query,
    data: query.data ? expiringSoonItems(query.data) : undefined,
  };
}

export function usePantryMutations() {
  const { pantry, scopeKey } = useRepositories();
  const queryClient = useQueryClient();
  const key = pantryKey(scopeKey);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient, key]);

  const add = useMutation({
    mutationFn: async (input: CreatePantryInput) => {
      try {
        return await pantry.add(input);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdatePantryInput }) => {
      try {
        return await pantry.update(id, patch);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    // Optimistic: toggling a staple or nudging a quantity must feel instant.
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PantryItem[]>(key);
      queryClient.setQueryData<PantryItem[]>(key, (items) =>
        items?.map((item) => (item.id === id ? { ...item, ...patch } : item)),
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
        await pantry.remove(id);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PantryItem[]>(key);
      queryClient.setQueryData<PantryItem[]>(key, (items) =>
        items?.filter((item) => item.id !== id),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: invalidate,
  });

  return { add, update, remove };
}
