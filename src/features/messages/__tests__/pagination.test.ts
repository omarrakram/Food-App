import {
  MESSAGE_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetFilter,
} from '@/features/messages/supabase-repository';

/**
 * Keyset paging through a thread.
 *
 * THE BUG THIS PREVENTS is specific and easy to reintroduce: a thread grows at
 * the newest end while you are scrolling back through the oldest, so an
 * offset-based `range(30, 59)` shifts under you — page two either repeats the
 * last message of page one or skips the first message it should have had.
 * Seeking from the row you last saw cannot do that.
 *
 * Two messages can also share a `created_at` to the microsecond, which is why
 * the cursor carries the id and the filter breaks the tie on it. Without that,
 * a page boundary landing between two same-instant messages loses one.
 */

describe('the message cursor', () => {
  it('round-trips', () => {
    const message = { createdAt: '2026-09-14T10:11:12.345678+00:00', id: 'abc-123' };
    expect(decodeCursor(encodeCursor(message))).toEqual(message);
  });

  it('splits on the LAST separator, so a timestamp containing one survives', () => {
    // Defensive: the id is a UUID today, but the split must not depend on
    // there being exactly one '|' in the string.
    const decoded = decodeCursor('2026-09-14T10:11:12+00:00|weird|id');
    expect(decoded).toEqual({ createdAt: '2026-09-14T10:11:12+00:00|weird', id: 'id' });
  });

  it('rejects a malformed cursor rather than paging from nowhere', () => {
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor('no-separator')).toBeNull();
    expect(decodeCursor('|missing-timestamp')).toBeNull();
  });
});

describe('the keyset filter', () => {
  const cursor = { createdAt: '2026-09-14T10:00:00+00:00', id: 'm-2' };

  it('asks for strictly older rows, with the id as the tiebreak', () => {
    expect(keysetFilter(cursor)).toBe(
      'created_at.lt.2026-09-14T10:00:00+00:00,' +
        'and(created_at.eq.2026-09-14T10:00:00+00:00,id.lt.m-2)',
    );
  });

  it('never uses an offset', () => {
    expect(keysetFilter(cursor)).not.toMatch(/offset|range|limit/i);
  });
});

describe('the page size', () => {
  it('is a screenful, not a thread', () => {
    // Small enough that opening a five-year-old conversation is one query,
    // large enough that a phone screen is never half-empty on arrival.
    expect(MESSAGE_PAGE_SIZE).toBeGreaterThanOrEqual(20);
    expect(MESSAGE_PAGE_SIZE).toBeLessThanOrEqual(50);
  });
});
