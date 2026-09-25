import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

import { useRepositories } from '@/features/data/repositories';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError } from '@/lib/errors';
import { queryKeys } from '@/lib/query/client';
import type { OrderFulfilmentState } from '@/types/commerce';

import { statesInView, type QueueView } from './queue';

/**
 * The dashboard's data.
 *
 * NEW ORDERS ARRIVE WITHOUT A REFRESH. A shop that has to remember to reload
 * is a shop that finds a paid order forty minutes late, so the queue listens
 * to the database and re-reads when something changes.
 *
 * BUT THE DATABASE STAYS AUTHORITATIVE. The subscription carries no payload
 * into the UI — it only says "something moved", and the query re-reads through
 * RLS. A realtime message is not a permission check, and treating one as data
 * would be a way to show a merchant a row they cannot select.
 */

/** Slow fallback, for a dropped socket. Realtime is the primary signal. */
const QUEUE_FALLBACK_POLL_MS = 60_000;

export function useMerchantMemberships() {
  const { merchant, scopeKey, isRemote } = useRepositories();

  return useQuery({
    queryKey: queryKeys.merchantMemberships(scopeKey),
    enabled: isRemote,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        return await merchant.memberships();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

/** True when this account has any merchant to act for. Gates the whole surface. */
export function useIsMerchantStaff(): { isStaff: boolean; isLoading: boolean } {
  const memberships = useMerchantMemberships();
  return {
    isStaff: (memberships.data ?? []).length > 0,
    isLoading: memberships.isLoading,
  };
}

export function useMerchantQueue(view: QueueView) {
  const { merchant, scopeKey, isRemote } = useRepositories();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.merchantQueue(scopeKey, view),
    enabled: isRemote,
    refetchInterval: QUEUE_FALLBACK_POLL_MS,
    queryFn: async () => {
      try {
        return await merchant.queue(statesInView(view));
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['akla', 'merchant'] });
  }, [queryClient]);

  /*
    THE SIGNAL, not the data.

    A postgres_changes subscription on `orders` tells us an order moved; the
    query then re-reads it through RLS. Passing the payload straight to the
    screen would show a merchant whatever the socket sent, which is not the
    same set of rows their policy allows.
  */
  useEffect(() => {
    if (!isRemote) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel(`merchant-queue-${scopeKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, invalidate)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_substitutions' },
        invalidate,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isRemote, scopeKey, invalidate]);

  return query;
}

export function useMerchantOrder(orderId: string | null) {
  const { merchant, scopeKey, isRemote } = useRepositories();

  return useQuery({
    queryKey: queryKeys.merchantOrder(scopeKey, orderId ?? 'none'),
    enabled: isRemote && orderId !== null,
    queryFn: async () => {
      if (!orderId) return null;
      try {
        return await merchant.order(orderId);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

export function useReplacementOptions(orderItemId: string | null) {
  const { merchant, scopeKey } = useRepositories();

  return useQuery({
    queryKey: ['akla', 'merchant', 'replacements', scopeKey, orderItemId ?? 'none'] as const,
    enabled: orderItemId !== null,
    queryFn: async () => {
      if (!orderItemId) return [];
      try {
        return await merchant.replacementsFor(orderItemId);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

export function useMerchantActions(orderId: string | null) {
  const { merchant } = useRepositories();
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['akla', 'merchant'] });
  }, [queryClient]);

  const advance = useMutation({
    mutationFn: (input: {
      to: OrderFulfilmentState;
      reason?: string | null;
      riderName?: string | null;
      riderPhone?: string | null;
    }) => {
      if (!orderId) throw new Error('no order');
      return merchant.advance({ orderId, ...input });
    },
    onSuccess: invalidate,
  });

  const reportUnavailable = useMutation({
    mutationFn: (input: { orderItemId: string; replacementProductId?: string | null; reason?: string | null }) =>
      merchant.reportUnavailable(input),
    onSuccess: invalidate,
  });

  return { advance, reportUnavailable };
}
