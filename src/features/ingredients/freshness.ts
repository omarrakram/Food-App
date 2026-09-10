import type { FreshnessStatus, PantryItem } from '@/types/domain';

/** Items within this many days of their date are surfaced as "use soon". */
export const EXPIRING_SOON_DAYS = 3;

/** Returns today as YYYY-MM-DD in the device's local timezone. */
export function todayISO(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Whole days from today to `isoDate`. Negative when the date has passed.
 * Compares calendar dates, not instants, so "expires today" is stable all day.
 */
export function daysUntil(isoDate: string, now: Date = new Date()): number | null {
  const target = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(`${todayISO(now)}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function freshnessOf(
  expiresOn: string | null | undefined,
  now: Date = new Date(),
): FreshnessStatus {
  if (!expiresOn) return 'unknown';
  const days = daysUntil(expiresOn, now);
  if (days === null) return 'unknown';
  if (days < 0) return 'expired';
  if (days === 0) return 'expires_today';
  if (days <= EXPIRING_SOON_DAYS) return 'expiring_soon';
  return 'fresh';
}

/**
 * FOOD SAFETY: an item past the date the user entered is never treated as
 * available for cooking. We do not guess that "one day over is probably fine" —
 * the user re-dates it or removes it themselves.
 */
export function isSafeToUse(item: Pick<PantryItem, 'expiresOn'>, now: Date = new Date()): boolean {
  return freshnessOf(item.expiresOn, now) !== 'expired';
}

/** Items to surface in "use these soon", most urgent first. */
export function expiringSoonItems(items: readonly PantryItem[], now: Date = new Date()) {
  return items
    .filter((item) => {
      const status = freshnessOf(item.expiresOn, now);
      return status === 'expiring_soon' || status === 'expires_today';
    })
    .sort((a, b) => (a.expiresOn ?? '').localeCompare(b.expiresOn ?? ''));
}

export function expiredItems(items: readonly PantryItem[], now: Date = new Date()) {
  return items.filter((item) => freshnessOf(item.expiresOn, now) === 'expired');
}
