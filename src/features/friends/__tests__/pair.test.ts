import { friendshipKey } from '../pair';

/**
 * The friendship key.
 *
 * Small, and the reason it is tested at all is the failure mode: a DELETE that
 * addresses the wrong ordering matches no rows, which Postgres reports as
 * success. "Remove friend" would appear to work every time and never remove
 * anybody.
 */

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

it('orders the pair the same way whichever side asks', () => {
  expect(friendshipKey(A, B)).toEqual(friendshipKey(B, A));
});

it('puts the lower id first, matching the database check', () => {
  const { low, high } = friendshipKey(B, A);
  expect(low).toBe(A);
  expect(high).toBe(B);
  expect(low < high).toBe(true);
});

it('compares as text, exactly as Postgres does for uuids in this schema', () => {
  // A numeric or locale-aware comparison would disagree with `least`/
  // `greatest` on some pairs, and the disagreement would be invisible until a
  // specific pair of users could not unfriend each other.
  const pairs: [string, string][] = [
    ['0a000000-0000-4000-8000-000000000000', '0b000000-0000-4000-8000-000000000000'],
    ['9f000000-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000000'],
    ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010'],
  ];
  for (const [x, y] of pairs) {
    const { low, high } = friendshipKey(y, x);
    expect([low, high]).toEqual([x, y].sort());
  }
});
