/**
 * The ordered key for a friendship.
 *
 * A friendship is stored ONCE, with the two ids sorted, and Postgres enforces
 * that with `friendships_ordered`. Every client-side read or delete has to
 * produce the same ordering or it addresses a row that does not exist — and a
 * DELETE that matches nothing does not fail, it silently succeeds, so
 * "Remove friend" would appear to work and change nothing.
 *
 * Kept as a named function rather than two inline ternaries so there is one
 * place to be right and one place to test.
 */
export function friendshipKey(a: string, b: string): { low: string; high: string } {
  return a < b ? { low: a, high: b } : { low: b, high: a };
}
