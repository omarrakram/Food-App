import { createContext, use, useMemo, type ReactNode } from 'react';

import { LocalPantryRepository, type PantryRepository } from '@/features/pantry/repository';
import { LocalRecipeRepository, type RecipeRepository } from '@/features/recipes/repository';
import {
  LocalHistoryRepository,
  LocalSavedRepository,
  type HistoryRepository,
  type SavedRepository,
} from '@/features/saved/repository';
import { LocalShoppingRepository, type ShoppingRepository } from '@/features/shopping/repository';

/**
 * Repository wiring.
 *
 * One place decides whether the app reads from AsyncStorage (guest) or from
 * Supabase (signed in). Screens call `useRepositories()` and never learn which.
 * The `scopeKey` is folded into every React Query key so switching accounts —
 * or signing out — cannot serve one user's cache to another.
 */

export type Repositories = {
  pantry: PantryRepository;
  recipes: RecipeRepository;
  saved: SavedRepository;
  history: HistoryRepository;
  shopping: ShoppingRepository;
  /** 'local' for guests, otherwise the Supabase user id. */
  scopeKey: string;
  isRemote: boolean;
  /** True while guest data is being copied to the server after sign-in. */
  isSyncing: boolean;
};

const RepositoryContext = createContext<Repositories | null>(null);

export type RepositoryProviderProps = {
  children: ReactNode;
  /** Supplied by the auth layer once a session exists. */
  remote?: Omit<Repositories, 'scopeKey' | 'isRemote' | 'isSyncing'> | null;
  userId?: string | null;
  isSyncing?: boolean;
};

export function RepositoryProvider({
  children,
  remote,
  userId,
  isSyncing = false,
}: RepositoryProviderProps) {
  const value = useMemo<Repositories>(() => {
    if (remote && userId) {
      return { ...remote, scopeKey: userId, isRemote: true, isSyncing };
    }
    return {
      pantry: new LocalPantryRepository(),
      recipes: new LocalRecipeRepository(),
      saved: new LocalSavedRepository(),
      history: new LocalHistoryRepository(),
      shopping: new LocalShoppingRepository(),
      scopeKey: 'local',
      isRemote: false,
      isSyncing,
    };
  }, [remote, userId, isSyncing]);

  return <RepositoryContext value={value}>{children}</RepositoryContext>;
}

export function useRepositories(): Repositories {
  const ctx = use(RepositoryContext);
  if (!ctx) {
    throw new Error('useRepositories must be used inside <RepositoryProvider>');
  }
  return ctx;
}
