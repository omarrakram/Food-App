import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, type ReactNode } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { SupabasePantryRepository } from '@/features/pantry/supabase-repository';
import { SupabaseFriendsRepository } from '@/features/friends/supabase-repository';
import { SupabaseMessagesRepository } from '@/features/messages/supabase-repository';
import { SupabaseNotificationsRepository } from '@/features/notifications/supabase-repository';
import { SupabaseProfileRepository } from '@/features/profile/supabase-repository';
import {
  registerPreferenceSync,
  usePreferences,
} from '@/features/preferences/preferences-provider';
import {
  fetchRemotePreferences,
  pushRemotePreferences,
} from '@/features/preferences/supabase-sync';
import { SupabaseRecipeRepository } from '@/features/recipes/supabase-repository';
import {
  SupabaseHistoryRepository,
  SupabaseSavedRepository,
} from '@/features/saved/supabase-repository';
import { SupabaseShoppingRepository } from '@/features/shopping/supabase-repository';
import { SupabaseSubmissionsRepository } from '@/features/submissions/supabase-repository';
import { getSupabase } from '@/lib/supabase/client';
import { logError } from '@/lib/logger';

import { migrateGuestData } from './migrate-guest-data';
import { RepositoryProvider } from './repositories';

/**
 * Connects authentication to the data layer.
 *
 * When a session appears this:
 *   1. builds the Supabase repositories and hands them to RepositoryProvider,
 *   2. installs the preference write-through so edits reach the database,
 *   3. pulls the server's preferences over the local copy, and
 *   4. migrates any data the user built while signed out.
 *
 * With no session (or no Supabase project) it renders the local repositories
 * and the app behaves exactly as it did before authentication existed.
 */
export function SupabaseBridge({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const { hydrateFromRemote, hasCompletedOnboarding, preferences } = usePreferences();
  const queryClient = useQueryClient();
  const supabase = getSupabase();
  const userId = user?.id ?? null;

  const remote = useMemo(() => {
    if (!supabase || !userId) return null;
    return {
      pantry: new SupabasePantryRepository(supabase, userId),
      profile: new SupabaseProfileRepository(supabase, userId),
      friends: new SupabaseFriendsRepository(supabase, userId),
      messages: new SupabaseMessagesRepository(supabase, userId),
      recipes: new SupabaseRecipeRepository(supabase),
      saved: new SupabaseSavedRepository(supabase, userId),
      history: new SupabaseHistoryRepository(supabase, userId),
      shopping: new SupabaseShoppingRepository(supabase, userId),
      submissions: new SupabaseSubmissionsRepository(supabase, userId),
      notifications: new SupabaseNotificationsRepository(supabase, userId),
    };
  }, [supabase, userId]);

  // Install / tear down the preference write-through alongside the session.
  useEffect(() => {
    if (!supabase || !userId) {
      registerPreferenceSync(null);
      return;
    }

    registerPreferenceSync(async (next) => {
      await pushRemotePreferences(supabase, userId, next, hasCompletedOnboarding);
    });

    return () => registerPreferenceSync(null);
  }, [supabase, userId, hasCompletedOnboarding]);

  /**
   * Pull server preferences and migrate guest data, once per session.
   *
   * Modelled as a query rather than an effect so React Query owns the
   * in-flight flag, deduplicates concurrent mounts, and gives us a retry for
   * free. `staleTime: Infinity` makes it run once per identity.
   */
  const sync = useQuery({
    queryKey: ['akla', 'session-sync', userId ?? 'none'],
    enabled: Boolean(supabase && userId && remote && status === 'signed_in'),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    queryFn: async () => {
      if (!supabase || !userId || !remote) return { migrated: false };

      try {
        const result = await migrateGuestData(userId, remote);
        const server = await fetchRemotePreferences(supabase, userId);

        if (server) {
          await hydrateFromRemote(server.preferences, server.onboardingCompleted);
          // A user who onboarded as a guest has local answers the server has
          // never seen. Push them up rather than discarding them.
          if (!server.onboardingCompleted && hasCompletedOnboarding) {
            await pushRemotePreferences(supabase, userId, preferences, true);
          }
        }

        if (result.migrated) {
          await queryClient.invalidateQueries();
        }
        return { migrated: result.migrated };
      } catch (error) {
        // The app stays usable against the server even if this fails; the
        // local copy of preferences remains authoritative for rendering, and
        // the migration marker is left unset so the next launch retries.
        logError('supabase_bridge_sync_failed', error);
        return { migrated: false };
      }
    },
  });

  return (
    <RepositoryProvider remote={remote} userId={userId} isSyncing={sync.isFetching}>
      {children}
    </RepositoryProvider>
  );
}
