import { I18nManager } from 'react-native';

import { isRTLLanguage, type Language } from './language';

/**
 * Who mirrors the interface for Arabic — the platform, or this code.
 *
 * THE ARCHITECTURE, stated once so no screen has to guess.
 *
 * React Native mirrors a right-to-left interface itself, but only when the
 * NATIVE direction flag is set. When it is, RN does two things automatically
 * and invisibly to every style in the app:
 *
 *   • `flexDirection: 'row'` is rendered as `row-reverse`;
 *   • `left` and `right` are swapped wherever they appear in a style —
 *     `textAlign`, border widths, margins, absolute offsets. That is the
 *     `doLeftAndRightSwapInRTL` constant, which is true on both platforms.
 *
 * So on a mirroring platform the correct thing to write is the LEFT-TO-RIGHT
 * style, unconditionally, and let RN turn it round. Writing `row-reverse` or
 * `right` yourself flips it a second time and lands you back in English
 * layout — while reading Arabic. That is the double-flip this module exists
 * to end.
 *
 * Three facts make "is the platform mirroring?" a question that must be asked
 * at runtime rather than assumed:
 *
 *   1. `I18nManager.forceRTL()` writes the NATIVE flag for the next launch.
 *      `I18nManager.isRTL` is a snapshot taken when the JS module loaded, so
 *      it does not change during a session. A user who switches to Arabic is
 *      therefore on a NON-mirroring platform until they restart, even though
 *      every string around them is already Arabic.
 *   2. On react-native-web `I18nManager` is a stub: `forceRTL` is a no-op,
 *      `getConstants().isRTL` is hard-coded `false`, and the object carries no
 *      `isRTL` property at all. The web platform does not have a direction
 *      flag — which is a different thing from having one set to false, and is
 *      why `platformHasDirectionFlag` exists.
 *   3. A cold launch with Arabic already stored can therefore be either: the
 *      flag persisted from the last run and RN mirrors, or it did not and
 *      nothing does.
 *
 * Every direction-sensitive style in the app goes through the resolvers below,
 * which mirror in JS exactly when the platform will not. The result is one
 * correct layout in all four states — persisted Arabic, persisted English, a
 * switch to Arabic, a switch back — with no reload needed for anything this
 * code controls, and no double-flip when a reload does happen.
 */

/** A logical edge: the side a reader starts from, or the side they end at. */
export type Edge = 'leading' | 'trailing';

/**
 * Whether this platform has a native direction flag at all.
 *
 * False on web, where `I18nManager` is a stub and `isRTL` is `undefined`.
 * Read live rather than captured at module load so that a test can set the
 * flag and exercise the mirroring branch; in a real session it is constant.
 */
export function platformHasDirectionFlag(): boolean {
  return typeof I18nManager.isRTL === 'boolean';
}

/** Whether the platform is currently mirroring layout for us. */
export function platformMirrorsLayout(): boolean {
  return I18nManager.isRTL === true;
}

/**
 * The `flexDirection` a horizontal row should use.
 *
 * `row` on a mirroring platform — RN reverses it — and on a non-mirroring
 * platform in English. `row-reverse` only where nothing else will flip it.
 */
export function resolveRowDirection(isRTL: boolean): 'row' | 'row-reverse' {
  return isRTL && !platformMirrorsLayout() ? 'row-reverse' : 'row';
}

/**
 * The physical side (`left` / `right`) that a logical edge lands on.
 *
 * Use for `textAlign`, for a border that belongs between two cells, for
 * anything that names a side. On a mirroring platform this returns the
 * left-to-right answer and lets RN swap it, which is the only way to avoid
 * swapping twice.
 */
export function resolveSide(isRTL: boolean, edge: Edge): 'left' | 'right' {
  const mirrored = isRTL && !platformMirrorsLayout();
  if (edge === 'leading') return mirrored ? 'right' : 'left';
  return mirrored ? 'left' : 'right';
}

/**
 * Applies a language's direction to the platform, where the platform has one.
 *
 * Called from BOTH paths that can change the language — the interactive
 * switch and the hydration that restores a stored one — because a difference
 * between those two was the original bug: a session that reached Arabic by
 * being restarted into it behaved differently from one that reached it by
 * tapping العربية.
 *
 * On native this writes the flag for the next launch; it cannot change the
 * current one, which is why `isDirectionRestartPending` exists. On web it
 * does nothing, deliberately: the resolvers above mirror in JS instead.
 */
export function applyPlatformDirection(language: Language): void {
  if (!platformHasDirectionFlag()) return;
  const shouldBeRTL = isRTLLanguage(language);
  if (I18nManager.isRTL === shouldBeRTL) return;
  I18nManager.allowRTL(shouldBeRTL);
  I18nManager.forceRTL(shouldBeRTL);
}

/**
 * Whether a restart is needed before the platform's own direction matches the
 * language.
 *
 * Only ever true on native, and only for what this code cannot mirror itself:
 * the drawer's side, gesture directions, native scroll anchoring. Screen
 * layout is already correct either way.
 *
 * On web this is always false. It used to be computed as
 * `isRTL !== I18nManager.isRTL`, which on web compares a boolean with
 * `undefined` and is therefore true in BOTH languages — the restart notice
 * was showing permanently on the web build, including in English.
 */
export function isDirectionRestartPending(language: Language): boolean {
  if (!platformHasDirectionFlag()) return false;
  return I18nManager.isRTL !== isRTLLanguage(language);
}

/**
 * Picks between the two glyphs of a directional icon pair.
 *
 * Deliberately the ONE thing here that ignores the platform flag. A chevron
 * is a picture, not a layout: no platform mirrors it, so it follows the
 * language and nothing else. Routing it through `resolveSide` — which on a
 * mirroring platform returns the left-to-right answer for RN to swap — would
 * leave every back button in Arabic pointing the wrong way.
 *
 * It exists so that asymmetry is named rather than rediscovered, and so a
 * later tidy-up cannot quietly fold these call sites into the others.
 */
export function resolveGlyph<T>(isRTL: boolean, ltr: T, rtl: T): T {
  return isRTL ? rtl : ltr;
}
