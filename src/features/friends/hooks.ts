import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRepositories } from '@/features/data/repositories';
import { toAppError } from '@/lib/errors';

/**
 * Friends, as React Query.
 *
 * Every mutation invalidates the whole `['akla', 'friends']` subtree rather
 * than patching one list. That looks lazy and is not: accepting a request
 * moves a person from Incoming to Friends, blocking removes them from Friends
 * AND withdraws a request in either direction, and unfriending changes what a
 * friends-only profile shows. Any of those touching a single cache entry would
 * leave one of the other lists stale, and a stale friend list is the kind of
 * bug people report as "it added them twice".
 */

const key = (scope: string, part: string) => ['akla', 'friends', scope, part] as const;

export function useFriends() {
  const { friends, scopeKey } = useRepositories();

  return useQuery({
    queryKey: key(scopeKey, 'list'),
    queryFn: async () => {
      try {
        return await friends.list();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

export function useIncomingRequests() {
  const { friends, scopeKey } = useRepositories();

  return useQuery({
    queryKey: key(scopeKey, 'incoming'),
    queryFn: () => friends.incoming(),
  });
}

export function useOutgoingRequests() {
  const { friends, scopeKey } = useRepositories();

  return useQuery({
    queryKey: key(scopeKey, 'outgoing'),
    queryFn: () => friends.outgoing(),
  });
}

export function useBlockedUsers() {
  const { friends, scopeKey } = useRepositories();

  return useQuery({
    queryKey: key(scopeKey, 'blocked'),
    queryFn: () => friends.blocked(),
  });
}

/** Every friend action, sharing one invalidation. */
export function useFriendActions() {
  const { friends } = useRepositories();
  const queryClient = useQueryClient();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['akla', 'friends'] });
    // A block or an unfriend changes whether a friends-only profile resolves,
    // so the profile cache is no longer trustworthy either.
    void queryClient.invalidateQueries({ queryKey: ['akla', 'profile'] });
  };

  return {
    send: useMutation({ mutationFn: (userId: string) => friends.send(userId), onSuccess: refresh }),
    accept: useMutation({
      mutationFn: (requestId: string) => friends.accept(requestId),
      onSuccess: refresh,
    }),
    decline: useMutation({
      mutationFn: (requestId: string) => friends.decline(requestId),
      onSuccess: refresh,
    }),
    cancel: useMutation({
      mutationFn: (requestId: string) => friends.cancel(requestId),
      onSuccess: refresh,
    }),
    unfriend: useMutation({
      mutationFn: (userId: string) => friends.unfriend(userId),
      onSuccess: refresh,
    }),
    block: useMutation({
      mutationFn: (userId: string) => friends.block(userId),
      onSuccess: refresh,
    }),
    unblock: useMutation({
      mutationFn: (userId: string) => friends.unblock(userId),
      onSuccess: refresh,
    }),
  };
}
