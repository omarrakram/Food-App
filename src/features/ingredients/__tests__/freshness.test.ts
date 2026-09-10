import {
  daysUntil,
  expiredItems,
  expiringSoonItems,
  freshnessOf,
  isSafeToUse,
  todayISO,
} from '../freshness';
import type { PantryItem } from '@/types/domain';

/** Fixed "now" so these assertions never depend on the day they run. */
const NOW = new Date('2026-09-10T12:00:00');

function isoOffset(days: number): string {
  const date = new Date(NOW);
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

function item(expiresOn: string | null, id = 'i1'): PantryItem {
  return {
    id,
    userId: 'local',
    ingredientId: '',
    ingredientName: 'chicken breast',
    category: 'protein',
    quantity: 1,
    unit: 'kg',
    expiresOn,
    isStaple: false,
    note: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

describe('daysUntil', () => {
  it('counts calendar days, not elapsed hours', () => {
    // Same calendar day, later clock time, is still 0 — so "expires today"
    // stays stable for the whole day rather than flipping at noon.
    expect(daysUntil(isoOffset(0), NOW)).toBe(0);
    expect(daysUntil(isoOffset(1), NOW)).toBe(1);
    expect(daysUntil(isoOffset(-1), NOW)).toBe(-1);
  });

  it('returns null for an unparseable date', () => {
    expect(daysUntil('not-a-date', NOW)).toBeNull();
  });
});

describe('freshnessOf', () => {
  it('classifies each bucket', () => {
    expect(freshnessOf(isoOffset(-1), NOW)).toBe('expired');
    expect(freshnessOf(isoOffset(0), NOW)).toBe('expires_today');
    expect(freshnessOf(isoOffset(1), NOW)).toBe('expiring_soon');
    expect(freshnessOf(isoOffset(3), NOW)).toBe('expiring_soon');
    expect(freshnessOf(isoOffset(4), NOW)).toBe('fresh');
  });

  it('treats a missing date as unknown, never as expired', () => {
    expect(freshnessOf(null, NOW)).toBe('unknown');
    expect(freshnessOf(undefined, NOW)).toBe('unknown');
  });
});

describe('isSafeToUse', () => {
  it('refuses anything past the date the user entered', () => {
    // FOOD SAFETY: no "one day over is probably fine" reasoning anywhere.
    expect(isSafeToUse(item(isoOffset(-1)), NOW)).toBe(false);
    expect(isSafeToUse(item(isoOffset(-30)), NOW)).toBe(false);
  });

  it('allows an item expiring today', () => {
    expect(isSafeToUse(item(isoOffset(0)), NOW)).toBe(true);
  });

  it('allows an item with no date', () => {
    expect(isSafeToUse(item(null), NOW)).toBe(true);
  });
});

describe('expiringSoonItems', () => {
  it('returns urgent items ordered most urgent first', () => {
    const items = [
      item(isoOffset(3), 'in-three'),
      item(isoOffset(0), 'today'),
      item(isoOffset(1), 'tomorrow'),
      item(isoOffset(10), 'later'),
      item(isoOffset(-1), 'expired'),
      item(null, 'undated'),
    ];

    expect(expiringSoonItems(items, NOW).map((entry) => entry.id)).toEqual([
      'today',
      'tomorrow',
      'in-three',
    ]);
  });

  it('excludes expired items — they belong in their own section', () => {
    const items = [item(isoOffset(-1), 'expired')];
    expect(expiringSoonItems(items, NOW)).toHaveLength(0);
    expect(expiredItems(items, NOW).map((entry) => entry.id)).toEqual(['expired']);
  });
});
