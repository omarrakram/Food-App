import type { OrderRefundStatus } from '@/types/commerce';

/**
 * What the customer is told about money coming back.
 *
 * THE DISTINCTION THAT MATTERS is between "we owe you" and "we have paid you".
 * Commerce-6 could only ever say the first, because nothing executed a refund;
 * showing "refunded" off a calculated debt would have been a lie told by a
 * screen. So `refunded` here is only ever derived from `refundedMinor`, which
 * only `apply_refund_success` moves, which only a confirmed provider result
 * reaches.
 *
 * SIX STATES, and none of them is optimistic:
 *
 *   none         nothing is owed and nothing went back. The ordinary case.
 *   due          owed, and nobody has started. Honest about the wait.
 *   processing   an attempt is with the provider.
 *   partial      some has gone back, some is still owed. Both numbers shown.
 *   completed    the debt is zero and money did go back.
 *   failed       an attempt did not work. THE DEBT IS STILL THERE — this state
 *                exists so the screen can say both things at once, because a
 *                customer told only "refund failed" thinks their money is gone.
 */
export const REFUND_VIEWS = [
  'none',
  'due',
  'processing',
  'partial',
  'completed',
  'failed',
] as const;
export type RefundView = (typeof REFUND_VIEWS)[number];

/**
 * ORDER OF PRECEDENCE, and it is deliberate.
 *
 * A live attempt outranks everything: while money is moving, "processing" is
 * the truest thing we can say, even if an earlier tranche already went back.
 *
 * Failure outranks the remaining debt, because a debt with a failed attempt
 * behind it needs a different sentence from a debt nobody has tried yet — the
 * first needs "we are looking at it", the second needs "this is queued".
 */
export function refundView(status: OrderRefundStatus | null | undefined): RefundView {
  if (!status) return 'none';

  const owed = Math.max(0, status.refundRequiredMinor);
  const back = Math.max(0, status.refundedMinor);

  if (status.attemptState === 'pending' || status.attemptState === 'processing') {
    return 'processing';
  }

  if (owed > 0) {
    if (status.attemptState === 'failed' || status.attemptState === 'abandoned') return 'failed';
    return back > 0 ? 'partial' : 'due';
  }

  return back > 0 ? 'completed' : 'none';
}

/** Is there anything at all to say about refunds on this order? */
export function hasRefundActivity(status: OrderRefundStatus | null | undefined): boolean {
  return refundView(status) !== 'none';
}

/**
 * Does a human at AKALT need to do something?
 *
 * `needsReview` means the provider's answer did not tell us whether the money
 * moved, so nothing will retry on its own. Surfacing it to the CUSTOMER as a
 * different message would be noise — they cannot act on it — but the operations
 * view needs it, and so does anything that counts open work.
 */
export function needsOperatorAttention(status: OrderRefundStatus | null | undefined): boolean {
  if (!status) return false;
  if (status.needsReview) return true;
  return status.refundRequiredMinor > 0 && status.attemptState === 'abandoned';
}

/**
 * The amount worth putting on the screen for a given view.
 *
 * Not one number for all six: "processing" is about the attempt in flight,
 * "completed" is about what went back, and everything else is about what is
 * still owed. Picking the wrong one is how a customer reads 45.00 and expects
 * a different 45.00.
 */
export function refundAmountMinor(
  status: OrderRefundStatus | null | undefined,
  view: RefundView = refundView(status),
): number {
  if (!status) return 0;
  switch (view) {
    case 'processing':
      return status.attemptAmountMinor ?? status.refundRequiredMinor;
    case 'completed':
      return status.refundedMinor;
    case 'none':
      return 0;
    default:
      return status.refundRequiredMinor;
  }
}
