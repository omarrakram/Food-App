import { createContext, use, useMemo, type ReactNode } from 'react';

import { LocalPantryRepository, type PantryRepository } from '@/features/pantry/repository';
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
  saved: SavedRepository;
  history: HistoryRepository;
  shopping: ShoppingRepository;
  /** 'local' for guests, otherwise the Supabase user id. */
  scopeKey: string;
  isRemote: boolean;
};

const RepositoryContext = createContext<Repositories | null>(null);

export type RepositoryProviderProps = {
  children: ReactNode;
  /** Supplied by the auth layer once a session exists. */
  remote?: Omit<Repositories, 'scopeKey' | 'isRemote'> | null;
  userId?: string | null;
};

export function RepositoryProvider({ children, remote, userId }: RepositoryProviderProps) {
  const value = useMemo<Repositories>(() => {
    if (remote && userId) {
      return { ...remote, scopeKey: userId, isRemote: true };
    }
    return {
      pantry: new LocalPantryRepository(),
      saved: new LocalSavedRepository(),
      history: new LocalHistoryRepository(),
      shopping: new LocalShoppingRepository(),
      scopeKey: 'local',
      isRemote: false,
    };
  }, [remote, userId]);

  return <RepositoryContext value={value}>{children}</RepositoryContext>;
}

export function useRepositories(): Repositories {
  const ctx = use(RepositoryContext);
  if (!ctx) {
    throw new Error('useRepositories must be used inside <RepositoryProvider>');
  }
  return ctx;
}
