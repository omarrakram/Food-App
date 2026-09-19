import type { FlexStyle, TextStyle } from 'react-native';

import { useI18n } from '@/i18n';
import { resolveGlyph, resolveRowDirection, resolveSide, type Edge } from '@/i18n/direction';

/**
 * React bindings for `@/i18n/direction`, which is where the reasoning lives.
 *
 * Nothing in the app should write `isRTL ? 'row-reverse' : 'row'` or
 * `isRTL ? 'right' : 'left'` by hand again. Both are wrong on a platform that
 * is already mirroring — see the header of `@/i18n/direction` — and getting
 * them right at each call site means getting them right roughly twenty times
 * and then again for every screen added afterwards.
 */

/** The `flexDirection` a horizontal row should use. */
export function useRowDirection(): FlexStyle['flexDirection'] {
  return resolveRowDirection(useI18n().isRTL);
}

/** The physical side a logical edge lands on. */
export function useSide(edge: Edge): 'left' | 'right' {
  return resolveSide(useI18n().isRTL, edge);
}

/**
 * `textAlign` for text that should hug one edge.
 *
 * `leading` is the edge a reader starts from — use it for a label or a field
 * whose content must start where the eye does. `trailing` is for a value that
 * belongs at the far end of a row: a quantity, a timestamp. Prose needs
 * neither; it aligns itself.
 */
export function useTextAlign(edge: Edge): TextStyle['textAlign'] {
  return resolveSide(useI18n().isRTL, edge);
}

/**
 * Picks the glyph of a directional icon pair — `ltr` for a reader going left
 * to right, `rtl` for one going right to left.
 *
 * Follows the language only. See `resolveGlyph` for why that is correct, and
 * why it is the one thing on this page that does not consult the platform.
 */
export function useGlyph<T>(ltr: T, rtl: T): T {
  return resolveGlyph(useI18n().isRTL, ltr, rtl);
}

export type { Edge };
