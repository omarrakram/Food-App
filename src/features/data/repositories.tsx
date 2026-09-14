import { createContext, use, useMemo, type ReactNode } from 'react';

import { env } from '@/lib/config/env';

import { LocalPantryRepository, type PantryRepository } from '@/features/pantry/repository';
import {
  DemoFriendsRepository,
  LocalFriendsRepository,
  type FriendsRepository,
} from '@/features/friends/repository';
import {
  DemoMessagesRepository,
  LocalMessagesRepository,
  type MessagesRepository,
} from '@/features/messages/repository';
import {
  DemoNotificationsRepository,
  LocalNotificationsRepository,
  type NotificationsRepository,
} from '@/features/notifications/repository';
import {
  DemoProfileRepository,
  LocalProfileRepository,
  type ProfileRepository,
} from '@/features/profile/repository';
import { LocalRecipeRepository, type RecipeRepository } from '@/features/recipes/repository';
import {
  LocalHistoryRepository,
  LocalSavedRepository,
  type HistoryRepository,
  type SavedRepository,
} from '@/features/saved/repository';
import { LocalShoppingRepository, type ShoppingRepository } from '@/features/shopping/repository';
import {
  DemoSubmissionsRepository,
  LocalSubmissionsRepository,
  type SubmissionsRepository,
} from '@/features/submissions/repository';

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
  profile: ProfileRepository;
  friends: FriendsRepository;
  messages: MessagesRepository;
  recipes: RecipeRepository;
  saved: SavedRepository;
  history: HistoryRepository;
  shopping: ShoppingRepository;
  submissions: SubmissionsRepository;
  notifications: NotificationsRepository;
  /** 'local' for guests, otherwise the Supabase user id. */
  scopeKey: string;
  isRemote: boolean;
  /**
   * True when the social repositories are the seeded demo ones.
   *
   * Screens read it to decide whether to render a sign-in wall or the real
   * screen with a DEMO banner over it. It is never true in production: `env`
   * forces the flag off there.
   */
  demoMode: boolean;
  /** True while guest data is being copied to the server after sign-in. */
  isSyncing: boolean;
};

const RepositoryContext = createContext<Repositories | null>(null);

export type RepositoryProviderProps = {
  children: ReactNode;
  /** Supplied by the auth layer once a session exists. */
  remote?: Omit<Repositories, 'scopeKey' | 'isRemote' | 'isSyncing' | 'demoMode'> | null;
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
      return { ...remote, scopeKey: userId, isRemote: true, isSyncing, demoMode: false };
    }
    return {
      pantry: new LocalPantryRepository(),
      profile: env.demoMode ? new DemoProfileRepository() : new LocalProfileRepository(),
      friends: env.demoMode ? new DemoFriendsRepository() : new LocalFriendsRepository(),
      // DEMO MODE, and only ever off a flag that `env` forces false in
      // production. It is real local storage with real behaviour so the hosted
      // preview can be walked through — and every screen it feeds says so,
      // because a demo send must never be mistakable for a delivered one.
      messages: env.demoMode ? new DemoMessagesRepository() : new LocalMessagesRepository(),
      recipes: new LocalRecipeRepository(),
      saved: new LocalSavedRepository(),
      history: new LocalHistoryRepository(),
      shopping: new LocalShoppingRepository(),
      submissions: env.demoMode
        ? new DemoSubmissionsRepository()
        : new LocalSubmissionsRepository(),
      notifications: env.demoMode
        ? new DemoNotificationsRepository()
        : new LocalNotificationsRepository(),
      scopeKey: 'local',
      isRemote: false,
      isSyncing,
      demoMode: env.demoMode,
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
