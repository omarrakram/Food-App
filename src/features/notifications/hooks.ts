import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRepositories } from '@/features/data/repositories';
import { toAppError } from '@/lib/errors';

/**
 * Notifications, as React Query.
 *
 * The unread count is derived from the list rather than fetched separately.
 * Two sources for one number is how a badge ends up showing 3 over a feed with
 * nothing unread in it, and the list is already the thing every screen with a
 * badge has loaded.
 */

const key = {
  list: (scope: string) => ['akla', 'notifications', scope] as const,
};

export function useNotifications() {
  const { notifications, scopeKey } = useRepositories();

  return useQuery({
    queryKey: key.list(scopeKey),
    queryFn: async () => {
      try {
        return await notifications.list();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    // A feed people check rather than watch. Stale for a minute is fine.
    staleTime: 60_000,
  });
}

/** Drives the bell. Derived, so it cannot disagree with the feed itself. */
export function useUnreadNotifications(): number {
  const feed = useNotifications();
  return (feed.data ?? []).filter((entry) => entry.readAt === null).length;
}

export function useNotificationActions() {
  const { notifications, scopeKey } = useRepositories();
  const client = useQueryClient();

  const refresh = () => client.invalidateQueries({ queryKey: key.list(scopeKey) });

  return {
    markAllRead: useMutation({
      mutationFn: () => notifications.markAllRead(),
      onSuccess: refresh,
    }),
    markRead: useMutation({
      mutationFn: (id: string) => notifications.markRead(id),
      onSuccess: refresh,
    }),
  };
}

export function useNotificationsAreLive(): boolean {
  const { notifications } = useRepositories();
  return notifications.isLive;
}
