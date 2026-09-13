import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useRepositories } from '@/features/data/repositories';
import { toAppError } from '@/lib/errors';
import type { OwnProfile, ProfileEdit, PublicProfile } from '@/types/domain';

import { validateHandle } from './handle';
import type { HandleAvailability } from './repository';

/** How long the field stays quiet before asking the server. */
const HANDLE_CHECK_DELAY_MS = 400;

export function useOwnProfile() {
  const { profile, scopeKey } = useRepositories();

  return useQuery({
    queryKey: ['akla', 'profile', 'own', scopeKey] as const,
    queryFn: async () => {
      try {
        return await profile.own();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

export function useUpdateProfile() {
  const { profile, scopeKey } = useRepositories();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (edit: ProfileEdit) => profile.update(edit),
    onSuccess: (updated: OwnProfile) => {
      queryClient.setQueryData(['akla', 'profile', 'own', scopeKey], updated);
      // A changed handle or avatar changes how this user appears everywhere
      // they are rendered — friend lists, shared cards, message threads.
      void queryClient.invalidateQueries({ queryKey: ['akla', 'profile'] });
    },
  });
}

export function usePublicProfile(username: string | undefined) {
  const { profile, scopeKey } = useRepositories();

  return useQuery({
    queryKey: ['akla', 'profile', 'public', scopeKey, username ?? 'none'] as const,
    enabled: Boolean(username),
    queryFn: async (): Promise<PublicProfile | null> => {
      if (!username) return null;
      return profile.byUsername(username);
    },
  });
}

/**
 * Live availability for a handle the user is still typing.
 *
 * Two things it must not do: ask the server on every keystroke, and ever
 * report "available" for something that is not. The debounce handles the
 * first. The second is why the local format check runs before the request and
 * why a failed request reports `invalid` rather than optimistically passing —
 * the alternative is a green tick followed by a rejected save.
 */
export function useHandleAvailability(
  candidate: string,
  /** The handle already owned, which must not report itself as taken. */
  current: string | null,
): { state: HandleAvailability | 'idle' | 'checking'; problem: ReturnType<typeof validateHandle> } {
  const { profile } = useRepositories();
  const trimmed = candidate.trim();
  const problem = trimmed.length === 0 ? null : validateHandle(trimmed);

  /**
   * Everything decidable without the network is decided during render.
   *
   * `null` means "only the server can answer this", which is the only case
   * that costs a request. Deriving the rest rather than storing it means the
   * field can never briefly show a stale verdict for a handle the user has
   * already changed.
   */
  const localVerdict: HandleAvailability | 'idle' | null =
    trimmed.length === 0
      ? 'idle'
      : trimmed === current
        ? 'available'
        : problem !== null
          ? 'invalid'
          : null;

  // Keyed by the handle it answers, so a late reply for an older handle is
  // ignored rather than rendered against the current one.
  const [remote, setRemote] = useState<{ handle: string; result: HandleAvailability } | null>(null);

  useEffect(() => {
    if (localVerdict !== null) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void profile
        .checkHandle(trimmed)
        .then((result) => {
          if (!cancelled) setRemote({ handle: trimmed, result });
        })
        .catch(() => {
          // Fail closed: reporting "available" because the network hiccuped
          // invites the user to submit a handle about to be rejected.
          if (!cancelled) setRemote({ handle: trimmed, result: 'invalid' });
        });
    }, HANDLE_CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, localVerdict, profile]);

  const state =
    localVerdict ?? (remote?.handle === trimmed ? remote.result : 'checking');

  return { state, problem };
}
