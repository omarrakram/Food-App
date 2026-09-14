import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { useRepositories } from '@/features/data/repositories';
import { toAppError } from '@/lib/errors';
import type { Message } from '@/types/domain';


/**
 * Messaging, as React Query.
 *
 * TWO THINGS HERE ARE NOT BOILERPLATE.
 *
 * A send is optimistic, because a chat that waits for a round trip before
 * showing your own words feels broken on a slow connection. The optimistic
 * bubble carries `delivery: 'sending'`, and on failure it stays in the list as
 * `'failed'` rather than vanishing — a message that disappears is one the user
 * assumes was sent. `retry` re-sends it and drops the placeholder.
 *
 * A thread pages BACKWARDS from newest, because that is the end people read
 * from. `useInfiniteQuery` therefore accumulates older pages, and the rendered
 * list reverses them once rather than every screen doing it.
 */

const key = {
  conversations: (scope: string) => ['akla', 'messages', scope, 'conversations'] as const,
  thread: (scope: string, conversationId: string) =>
    ['akla', 'messages', scope, 'thread', conversationId] as const,
};

export function useConversations() {
  const { messages, scopeKey } = useRepositories();

  return useQuery({
    queryKey: key.conversations(scopeKey),
    queryFn: async () => {
      try {
        return await messages.conversations();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    // A conversation list is a live thing; the cost of being a minute stale is
    // a missed message badge.
    staleTime: 15_000,
  });
}

/** Total unread across every thread. Drives the drawer badge. */
export function useUnreadTotal(): number {
  const conversations = useConversations();
  return useMemo(
    () => (conversations.data ?? []).reduce((total, entry) => total + entry.unread, 0),
    [conversations.data],
  );
}

export function useThread(conversationId: string | undefined) {
  const { messages, scopeKey } = useRepositories();

  const query = useInfiniteQuery({
    queryKey: key.thread(scopeKey, conversationId ?? 'none'),
    enabled: Boolean(conversationId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      try {
        return await messages.messages(conversationId!, pageParam);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  // Oldest first, which is how a thread reads. The repository returns newest
  // first because that is what the index can seek to.
  const ordered = useMemo(() => {
    const all = (query.data?.pages ?? []).flatMap((page) => page.messages);
    return [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [query.data]);

  return { ...query, messages: ordered };
}

/**
 * Sends, optimistically, and keeps a failure visible.
 *
 * The outbox is local state rather than a React Query cache write, and that is
 * deliberate. A failed send must SURVIVE a refetch: if the placeholder lived in
 * the query cache, the next successful `conversations()` poll would replace the
 * page and the failed bubble would silently disappear — which is the exact
 * outcome this is here to prevent. Held beside the server data, it stays until
 * the user retries it or discards it.
 *
 * Temporary ids are prefixed so nothing downstream can mistake one for a server
 * id, and a retry can tell which bubbles are real.
 */
export function useSendMessage(conversationId: string | undefined) {
  const { messages, scopeKey } = useRepositories();
  const client = useQueryClient();
  const [outbox, setOutbox] = useState<Message[]>([]);

  const threadKey = key.thread(scopeKey, conversationId ?? 'none');

  const deliver = useCallback(
    async (draft: Message) => {
      try {
        await messages.send({
          conversationId: draft.conversationId,
          body: draft.body,
          sharedRecipeId: draft.sharedRecipeId,
        });
        // The server now has it, so the placeholder is redundant: drop it in
        // the same tick as the refetch that replaces it, or the thread shows
        // the message twice.
        setOutbox((current) => current.filter((entry) => entry.id !== draft.id));
        await client.invalidateQueries({ queryKey: threadKey });
        await client.invalidateQueries({ queryKey: key.conversations(scopeKey) });
      } catch (error) {
        setOutbox((current) =>
          current.map((entry) =>
            entry.id === draft.id ? { ...entry, delivery: 'failed' as const } : entry,
          ),
        );
        throw toAppError(error, 'database');
      }
    },
    [messages, client, threadKey, scopeKey],
  );

  const send = useCallback(
    (body: string, sharedRecipeId?: string | null, senderId = 'me') => {
      if (!conversationId) return;
      const draft: Message = {
        id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conversationId,
        senderId,
        body,
        sharedRecipeId: sharedRecipeId ?? null,
        createdAt: new Date().toISOString(),
        editedAt: null,
        delivery: 'sending',
      };
      setOutbox((current) => [...current, draft]);
      void deliver(draft).catch(() => {
        // Already reflected in the outbox as 'failed'. Swallowed here so an
        // unhandled rejection does not surface as a crash on top of a thread
        // that is already showing the user what went wrong.
      });
    },
    [conversationId, deliver],
  );

  const retry = useCallback(
    (messageId: string) => {
      setOutbox((current) =>
        current.map((entry) =>
          entry.id === messageId ? { ...entry, delivery: 'sending' as const } : entry,
        ),
      );
      const draft = outbox.find((entry) => entry.id === messageId);
      if (draft) void deliver({ ...draft, delivery: 'sending' }).catch(() => {});
    },
    [outbox, deliver],
  );

  const isSending = outbox.some((entry) => entry.delivery === 'sending');

  return { send, retry, outbox, isSending };
}

/**
 * Clears the viewer's unread count.
 *
 * Fires when a thread is opened. Failure is deliberately silent: not clearing
 * a badge is a cosmetic problem, and an error toast over a conversation the
 * user is trying to read is a worse one.
 */
export function useMarkRead() {
  const { messages, scopeKey } = useRepositories();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) => messages.markRead(conversationId),
    onSuccess: () => client.invalidateQueries({ queryKey: key.conversations(scopeKey) }),
  });
}

/** Finds or creates the thread with someone, then hands back its id. */
export function useStartConversation() {
  const { messages, scopeKey } = useRepositories();
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      try {
        return await messages.startWith(userId);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key.conversations(scopeKey) }),
  });
}

/** True when messages actually reach a server rather than this device. */
export function useMessagingIsLive(): boolean {
  const { messages } = useRepositories();
  return messages.isLive;
}

/**
 * Who "me" is in a thread.
 *
 * Asked of the repository rather than of the auth session, because in demo
 * mode there is no session and the viewer is still somebody — and a bubble on
 * the wrong side of the thread is not a cosmetic bug.
 */
export function useMessagingViewerId(): string | null {
  const { messages } = useRepositories();
  return messages.viewerId;
}

export type { Message };
