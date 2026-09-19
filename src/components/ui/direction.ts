import { I18nManager } from 'react-native';
import type { FlexStyle } from 'react-native';

import { useI18n } from '@/i18n';

/**
 * The row direction to use, correct whichever RTL state the app is in.
 *
 * THE BUG THIS EXISTS FOR. This app decides layout direction two different
 * ways at once, and they can cancel out:
 *
 *   1. `I18nManager.forceRTL()` — which makes React Native itself flip every
 *      `flexDirection: 'row'`, automatically and invisibly.
 *   2. Hand-written `isRTL ? 'row-reverse' : 'row'` at roughly ten call sites.
 *
 * When only (2) is active, rows flip once and are correct. When (1) is also
 * active, they flip twice and land back in left-to-right — in Arabic.
 *
 * And which of those you get depends on HOW YOU ARRIVED. `I18nProvider`'s
 * hydration path restores a stored language with `setLanguageState`, which
 * never touches `I18nManager`; only the interactive `setLanguage` calls
 * `forceRTL`. So launching the app already set to Arabic and switching to
 * Arabic inside the app produce two different layouts from the same state.
 *
 * This asks the question that actually matters — "is something already
 * flipping rows for me?" — and only flips when nothing else will. Call sites
 * using it are correct before and after any fix to the provider, which is what
 * lets the provider be fixed separately without a flag day.
 */
export function useRowDirection(): FlexStyle['flexDirection'] {
  const { isRTL } = useI18n();
  return isRTL && !I18nManager.isRTL ? 'row-reverse' : 'row';
}

/**
 * `textAlign` for a value that should hug the reading edge — quantities in a
 * table, a trailing timestamp. Never used for prose, which aligns itself.
 */
export function useTrailingAlign(): 'left' | 'right' {
  const { isRTL } = useI18n();
  return isRTL ? 'left' : 'right';
}
