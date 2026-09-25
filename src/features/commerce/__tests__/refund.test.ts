import {
  hasRefundActivity,
  needsOperatorAttention,
  refundAmountMinor,
  refundView,
} from '../refund';
import type { OrderRefundStatus } from '@/types/commerce';

function status(overrides: Partial<OrderRefundStatus> = {}): OrderRefundStatus {
  return {
    currency: 'EGP',
    capturedMinor: 10000,
    refundedMinor: 0,
    refundRequiredMinor: 0,
    attemptState: null,
    attemptAmountMinor: null,
    needsReview: false,
    lastErrorCode: null,
    requestedAt: null,
    settledAt: null,
    ...overrides,
  };
}

describe('refundView', () => {
  it('says nothing when there is nothing to say', () => {
    expect(refundView(status())).toBe('none');
    expect(refundView(null)).toBe('none');
    expect(hasRefundActivity(status())).toBe(false);
  });

  it('separates money that is OWED from money that has gone back', () => {
    // The distinction Commerce-6 could not make: a calculated debt is not a
    // refund, and a screen that conflated them would tell a customer their
    // money had been returned when nothing had been sent.
    expect(refundView(status({ refundRequiredMinor: 4000 }))).toBe('due');
    expect(refundView(status({ refundedMinor: 4000 }))).toBe('completed');
  });

  it('shows a live attempt ahead of everything else', () => {
    expect(refundView(status({ refundRequiredMinor: 4000, attemptState: 'pending' }))).toBe(
      'processing',
    );
    expect(refundView(status({ refundRequiredMinor: 4000, attemptState: 'processing' }))).toBe(
      'processing',
    );
    // Even when an earlier tranche already went back.
    expect(
      refundView(
        status({ refundRequiredMinor: 1500, refundedMinor: 4000, attemptState: 'processing' }),
      ),
    ).toBe('processing');
  });

  it('reads a part-paid refund as partial, not as complete', () => {
    expect(refundView(status({ refundedMinor: 4000, refundRequiredMinor: 1500 }))).toBe('partial');
  });

  it('KEEPS THE DEBT VISIBLE when an attempt failed', () => {
    // The rule this whole vocabulary exists for. A customer told only "refund
    // failed" believes their money is gone; the view has to carry both facts
    // so the screen can say both.
    const failed = status({ refundRequiredMinor: 4000, attemptState: 'failed' });
    expect(refundView(failed)).toBe('failed');
    expect(refundAmountMinor(failed)).toBe(4000);

    const abandoned = status({ refundRequiredMinor: 4000, attemptState: 'abandoned' });
    expect(refundView(abandoned)).toBe('failed');
    expect(refundAmountMinor(abandoned)).toBe(4000);
  });

  it('does not call a settled order failed just because an old attempt failed', () => {
    // The retry worked. Nothing is owed. The history is not the state.
    expect(refundView(status({ refundedMinor: 4000, attemptState: 'failed' }))).toBe('completed');
  });
});

describe('refundAmountMinor', () => {
  it('shows the attempt while it is in flight and the settled total afterwards', () => {
    expect(
      refundAmountMinor(
        status({ refundRequiredMinor: 1500, attemptState: 'processing', attemptAmountMinor: 1500 }),
      ),
    ).toBe(1500);
    expect(refundAmountMinor(status({ refundedMinor: 5500 }))).toBe(5500);
    expect(refundAmountMinor(status())).toBe(0);
  });

  it('falls back to the debt when an in-flight attempt has no amount', () => {
    expect(
      refundAmountMinor(status({ refundRequiredMinor: 900, attemptState: 'pending' })),
    ).toBe(900);
  });
});

describe('needsOperatorAttention', () => {
  it('is true only when automatic retry has stopped', () => {
    expect(needsOperatorAttention(status({ refundRequiredMinor: 4000 }))).toBe(false);
    // A failed attempt still has retries left. Nobody has to do anything.
    expect(
      needsOperatorAttention(status({ refundRequiredMinor: 4000, attemptState: 'failed' })),
    ).toBe(false);
    // An ambiguous one does not, and the money may or may not have moved.
    expect(
      needsOperatorAttention(
        status({ refundRequiredMinor: 4000, attemptState: 'abandoned', needsReview: true }),
      ),
    ).toBe(true);
  });

  it('flags an abandoned attempt even without the review flag', () => {
    expect(
      needsOperatorAttention(status({ refundRequiredMinor: 4000, attemptState: 'abandoned' })),
    ).toBe(true);
  });
});
