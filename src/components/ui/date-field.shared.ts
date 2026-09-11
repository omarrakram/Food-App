/**
 * Date helpers and the shared prop contract for `DateField`.
 *
 * This file deliberately carries NO platform suffix.
 *
 * `DateField` has two implementations — `date-field.tsx` for native and
 * `date-field.web.tsx` for the browser — and both need these helpers. The web
 * file originally imported them from `'./date-field'`, which looks like the
 * native file but is not: Metro resolves a bare specifier using the current
 * platform's extensions first, so on web `'./date-field'` resolves back to
 * `date-field.web.tsx` — itself. The re-export then became a getter returning
 * itself, and the first call to `toISODate` recursed until the stack blew,
 * taking the whole pantry add screen into the error boundary.
 *
 * A module with no platform suffix cannot be resolved to a platform variant, so
 * the ambiguity cannot come back.
 */

export type DateFieldProps = {
  label?: string;
  /** ISO `YYYY-MM-DD`, or null for "no date". */
  value: string | null;
  onChange: (next: string | null) => void;
  /** Earliest date the user may pick. Defaults to today. */
  minimumDate?: Date;
  clearLabel?: string;
  testID?: string;
};

/** `YYYY-MM-DD` in local time. `toISOString` would shift across midnight. */
export function toISODate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Parses an ISO date STRICTLY.
 *
 * `new Date('2026-02-31')` happily returns 3 March, so a typo silently becomes
 * a real but wrong date. This rejects anything that does not round-trip, which
 * is the only way to catch a day that does not exist in that month.
 */
export function parseISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** Renders an ISO date in the viewer's locale, falling back to the raw value. */
export function formatDateForDisplay(iso: string, locale: string): string {
  const parsed = parseISODate(iso);
  if (!parsed) return iso;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parsed);
  } catch {
    return iso;
  }
}
