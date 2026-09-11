import type { Insets } from 'react-native';

import { hitSize } from '@/theme/tokens';

/**
 * Expands a control's touchable area to the minimum without changing its looks.
 *
 * A 32px chip is a deliberate visual choice — a row of 44px pills is a wall of
 * buttons — but the *touch* target has no business being 32px. `hitSlop`
 * separates the two: the pill still looks small and still catches a thumb.
 *
 * The minimum comes from `hitSize.min`, the same token `IconButton` already
 * used, so there is one definition of "big enough".
 */
export function hitSlopFor(visualSize: number, minimum = hitSize.min): Insets | undefined {
  const missing = minimum - visualSize;
  if (missing <= 0) return undefined;

  const half = Math.ceil(missing / 2);
  return { top: half, bottom: half, left: half, right: half };
}
