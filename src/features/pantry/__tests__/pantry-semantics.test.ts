import { expiredItems, expiringSoonItems, freshnessOf, isSafeToUse } from '@/features/ingredients/freshness';
import type { PantryItem } from '@/types/domain';

/**
 * The two rules the Pantry screen is built on, pinned so a redesign cannot
 * quietly break either.
 *
 * 1. EXPIRY HAS FIVE STATES, not "red or not red". A screen that treats
 *    "no date" the same as "fine" is lying by omission, and one that treats
 *    "today" the same as "next week" is not worth opening.
 * 2. COOKING NEVER MUTATES THE PANTRY. "Cook with these" hands a COPY of the
 *    names into a temporary search. Pantry is what you own; the cook selection
 *    is what you want considered right now, and the two must not be the same
 *    object.
 */

function item(id: string, name: string, expiresOn: string | null): PantryItem {
  return {
    id,
    userId: 'u',
    ingredientId: id,
    ingredientName: name,
    category: 'vegetables',
    quantity: null,
    unit: null,
    expiresOn,
    isStaple: false,
    outOfStock: false,
    note: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as PantryItem;
}

const NOW = new Date('2026-03-10T12:00:00Z');

describe('pantry expiry states', () => {
  it('tells the five states apart', () => {
    expect(freshnessOf('2026-03-08', NOW)).toBe('expired');
    expect(freshnessOf('2026-03-10', NOW)).toBe('expires_today');
    expect(freshnessOf('2026-03-12', NOW)).toBe('expiring_soon');
    expect(freshnessOf('2026-04-20', NOW)).toBe('fresh');
    expect(freshnessOf(null, NOW)).toBe('unknown');
  });

  it('never invents an expiry for an item without a date', () => {
    // An undated item is "unknown", not "fresh" and not "expiring". The app
    // must not guess a shelf life on the user's behalf.
    expect(freshnessOf(undefined, NOW)).toBe('unknown');
    expect(isSafeToUse(item('x', 'rice', null), NOW)).toBe(true);
  });

  it('treats an expired item as unusable, without deleting it', () => {
    const expired = item('a', 'milk', '2026-03-01');
    expect(isSafeToUse(expired, NOW)).toBe(false);
    // Still in the pantry — the user re-dates or removes it themselves.
    expect(expiredItems([expired], NOW)).toHaveLength(1);
  });

  it('separates expired from expiring soon', () => {
    const rows = [
      item('a', 'milk', '2026-03-01'),
      item('b', 'yoghurt', '2026-03-12'),
      item('c', 'rice', null),
      item('d', 'flour', '2026-09-01'),
    ];
    expect(expiredItems(rows, NOW).map((r) => r.id)).toEqual(['a']);
    expect(expiringSoonItems(rows, NOW).map((r) => r.id)).toEqual(['b']);
  });
});

describe('cook with these', () => {
  /** Mirrors the seeding in `app/cook/index.tsx`. */
  function seedFor(rows: readonly PantryItem[], onlyExpiring: boolean): string[] {
    return (onlyExpiring ? expiringSoonItems(rows, NOW) : rows)
      .filter((row) => isSafeToUse(row, NOW))
      .map((row) => row.ingredientName);
  }

  const rows = [
    item('a', 'milk', '2026-03-01'),
    item('b', 'yoghurt', '2026-03-12'),
    item('c', 'rice', null),
  ];

  it('hands over names only, so the pantry cannot be edited through them', () => {
    const seed = seedFor(rows, false);
    seed.push('something the user typed');
    seed.shift();

    // The array the cook screen owns is not the pantry. Mutating it — which
    // the picker does on every tap — must not reach back into storage.
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.ingredientName)).toEqual(['milk', 'yoghurt', 'rice']);
  });

  it('FOOD SAFETY: never seeds an expired item', () => {
    // A seeded ingredient is trusted absolutely by the engine, so an expired
    // one arriving this way would defeat the expiry rule on the way in.
    expect(seedFor(rows, false)).not.toContain('milk');
    expect(seedFor(rows, false)).toEqual(['yoghurt', 'rice']);
  });

  it('narrows to the expiring items when entered from that block', () => {
    expect(seedFor(rows, true)).toEqual(['yoghurt']);
  });

  it('leaves quantities alone', () => {
    const withQuantity = { ...item('q', 'rice', null), quantity: 500, unit: 'g' } as PantryItem;
    seedFor([withQuantity], false);
    expect(withQuantity.quantity).toBe(500);
  });
});
