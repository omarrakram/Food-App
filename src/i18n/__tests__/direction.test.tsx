import { act, screen } from '@testing-library/react-native';
import { I18nManager } from 'react-native';

import { DemoBanner } from '@/components/messages/demo-banner';
import { useI18n } from '@/i18n';
import {
  applyPlatformDirection,
  isDirectionRestartPending,
  platformHasDirectionFlag,
  platformMirrorsLayout,
  resolveGlyph,
  resolveRowDirection,
  resolveSide,
} from '@/i18n/direction';
import { getItem, setItem, StorageKeys } from '@/lib/storage';
import { render } from '@/test-utils/render';

/**
 * Direction is decided in exactly one place, and it is right in all four
 * states the app can be in.
 *
 * THE BUG THESE PIN. Layout direction used to be decided two ways at once:
 * `I18nManager.forceRTL`, which makes React Native mirror every row and swap
 * every left/right itself, and roughly a dozen hand-written
 * `isRTL ? 'row-reverse' : 'row'` sites. Where both applied, rows flipped
 * twice and landed back in English layout — while reading Arabic. Which of
 * the two you got depended on how you ARRIVED: the provider's hydration path
 * restored a stored language without touching `I18nManager`, so being
 * launched into Arabic and choosing Arabic produced different screens.
 *
 * The four states are the product of two independent facts: whether the
 * language is Arabic, and whether the PLATFORM is mirroring for us. The
 * second cannot be assumed — `I18nManager.isRTL` is a snapshot taken when the
 * JS loaded, `forceRTL` only affects the next launch, and on web
 * `I18nManager` is a stub with no flag at all.
 */

/** Stands in for whichever platform state a test is about. */
function setPlatformFlag(value: boolean | undefined) {
  // Cast: RN types `isRTL` as a boolean, but on react-native-web the property
  // genuinely does not exist, and `undefined` is the state this app has to
  // survive in the build it actually ships to users.
  (I18nManager as unknown as { isRTL: boolean | undefined }).isRTL = value;
}

const WEB = undefined; // react-native-web: `I18nManager` is a stub, no flag
const NATIVE_LTR = false;
const NATIVE_RTL = true; // native, relaunched after forceRTL(true)

let originalFlag: boolean | undefined;

beforeAll(() => {
  originalFlag = I18nManager.isRTL;
});

afterEach(() => {
  setPlatformFlag(originalFlag);
  jest.restoreAllMocks();
});

describe('the platform predicate', () => {
  it('knows the web platform has no direction flag at all', () => {
    setPlatformFlag(WEB);
    expect(platformHasDirectionFlag()).toBe(false);
    expect(platformMirrorsLayout()).toBe(false);
  });

  it('knows a native platform has one, set or not', () => {
    setPlatformFlag(NATIVE_LTR);
    expect(platformHasDirectionFlag()).toBe(true);
    expect(platformMirrorsLayout()).toBe(false);

    setPlatformFlag(NATIVE_RTL);
    expect(platformHasDirectionFlag()).toBe(true);
    expect(platformMirrorsLayout()).toBe(true);
  });
});

describe('row direction', () => {
  it('mirrors in JS when nothing else will', () => {
    for (const flag of [WEB, NATIVE_LTR]) {
      setPlatformFlag(flag);
      expect(resolveRowDirection(true)).toBe('row-reverse');
      expect(resolveRowDirection(false)).toBe('row');
    }
  });

  it('does NOT mirror when the platform already is — the double-flip', () => {
    setPlatformFlag(NATIVE_RTL);
    // The whole bug in one assertion: asking for `row-reverse` here would be
    // asking React Native to reverse it a second time.
    expect(resolveRowDirection(true)).toBe('row');
  });
});

describe('physical sides', () => {
  it('sends the leading edge to the reading edge when we mirror', () => {
    for (const flag of [WEB, NATIVE_LTR]) {
      setPlatformFlag(flag);
      expect(resolveSide(true, 'leading')).toBe('right');
      expect(resolveSide(true, 'trailing')).toBe('left');
      expect(resolveSide(false, 'leading')).toBe('left');
      expect(resolveSide(false, 'trailing')).toBe('right');
    }
  });

  it('writes the left-to-right answer when the platform swaps sides itself', () => {
    setPlatformFlag(NATIVE_RTL);
    // RN's `doLeftAndRightSwapInRTL` turns every `left` into `right` in a
    // style. Naming `right` here would land back on the left.
    expect(resolveSide(true, 'leading')).toBe('left');
    expect(resolveSide(true, 'trailing')).toBe('right');
  });
});

describe('applying a language to the platform', () => {
  it('does nothing on a platform with no flag', () => {
    setPlatformFlag(WEB);
    const force = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
    applyPlatformDirection('ar');
    expect(force).not.toHaveBeenCalled();
  });

  it('sets the flag on native when the language disagrees with it', () => {
    setPlatformFlag(NATIVE_LTR);
    const allow = jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => {});
    const force = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
    applyPlatformDirection('ar');
    expect(allow).toHaveBeenCalledWith(true);
    expect(force).toHaveBeenCalledWith(true);
  });

  it('leaves the flag alone when it already agrees', () => {
    setPlatformFlag(NATIVE_RTL);
    const force = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
    applyPlatformDirection('ar');
    expect(force).not.toHaveBeenCalled();
  });
});

describe('the restart notice', () => {
  it('is never pending on web, in either language', () => {
    setPlatformFlag(WEB);
    // The old predicate was `isRTL !== I18nManager.isRTL`, which on web
    // compares a boolean against `undefined` and is therefore true in BOTH
    // languages. The notice was showing permanently on the shipped web build.
    expect(isDirectionRestartPending('ar')).toBe(false);
    expect(isDirectionRestartPending('en')).toBe(false);
  });

  it('is pending on native only while the flag disagrees', () => {
    setPlatformFlag(NATIVE_LTR);
    expect(isDirectionRestartPending('ar')).toBe(true);
    expect(isDirectionRestartPending('en')).toBe(false);

    setPlatformFlag(NATIVE_RTL);
    expect(isDirectionRestartPending('ar')).toBe(false);
    expect(isDirectionRestartPending('en')).toBe(true);
  });
});

/**
 * Finds the first `flexDirection` in a rendered tree.
 *
 * A row is a style on a nested View, not something a query can reach, so the
 * test walks the JSON the way a layout engine walks the tree.
 */
function firstRowDirection(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const element = node as { props?: Record<string, unknown>; children?: unknown[] };
  const style = element.props?.style;
  const styles: unknown[] = Array.isArray(style) ? style.flat(4) : [style];
  for (const entry of styles) {
    const direction = (entry as { flexDirection?: string } | null | undefined)?.flexDirection;
    if (direction === 'row' || direction === 'row-reverse') return direction;
  }
  for (const child of element.children ?? []) {
    const found = firstRowDirection(child);
    if (found) return found;
  }
  return undefined;
}

describe('a real row, in the four states', () => {
  beforeEach(async () => {
    await setItem(StorageKeys.languagePreference, 'en');
  });

  it('renders a persisted English launch left to right', async () => {
    setPlatformFlag(WEB);
    await setItem(StorageKeys.languagePreference, 'en');
    const view = await render(<DemoBanner />);
    expect(await screen.findByTestId('demo-banner')).toBeTruthy();
    expect(firstRowDirection(view.toJSON())).toBe('row');
  });

  it('renders a persisted Arabic launch right to left, with no reload', async () => {
    setPlatformFlag(WEB);
    await setItem(StorageKeys.languagePreference, 'ar');
    const view = await render(<DemoBanner />);
    await screen.findByTestId('demo-banner');
    // The state that used to depend on how you arrived: launched straight
    // into Arabic, nothing had called `forceRTL`, so nothing mirrored.
    expect(firstRowDirection(view.toJSON())).toBe('row-reverse');
  });

  it('renders a persisted Arabic launch UNreversed where the platform mirrors', async () => {
    setPlatformFlag(NATIVE_RTL);
    await setItem(StorageKeys.languagePreference, 'ar');
    const view = await render(<DemoBanner />);
    await screen.findByTestId('demo-banner');
    expect(firstRowDirection(view.toJSON())).toBe('row');
  });
});

describe('switching language inside a session', () => {
  it('flips rows on the very next frame, English to Arabic and back', async () => {
    setPlatformFlag(WEB);
    await setItem(StorageKeys.languagePreference, 'en');

    let setLanguage: ((next: 'en' | 'ar') => void) | null = null;
    function Capture() {
      setLanguage = useI18n().setLanguage;
      return <DemoBanner />;
    }

    const view = await render(<Capture />);
    await screen.findByTestId('demo-banner');
    expect(firstRowDirection(view.toJSON())).toBe('row');

    await act(async () => setLanguage?.('ar'));
    expect(firstRowDirection(view.toJSON())).toBe('row-reverse');
    expect(await getItem(StorageKeys.languagePreference)).toBe('ar');

    await act(async () => setLanguage?.('en'));
    expect(firstRowDirection(view.toJSON())).toBe('row');
    expect(await getItem(StorageKeys.languagePreference)).toBe('en');
  });
});

describe('directional glyphs', () => {
  it('follow the language and ignore the platform, unlike every other rule here', () => {
    // A chevron is a picture. No platform mirrors it, so a back button that
    // consulted the platform flag would point the wrong way in Arabic on
    // native — which is exactly the mistake `resolveSide` is shaped to avoid
    // for styles, and exactly the wrong fix for an icon.
    for (const flag of [WEB, NATIVE_LTR, NATIVE_RTL]) {
      setPlatformFlag(flag);
      expect(resolveGlyph(false, 'chevron-back', 'chevron-forward')).toBe('chevron-back');
      expect(resolveGlyph(true, 'chevron-back', 'chevron-forward')).toBe('chevron-forward');
    }
  });

  it('leaves a non-directional glyph alone — the play button problem', () => {
    // Passing the same glyph for both readings is how a caller says "this one
    // does not mirror". A play triangle, a flask, a flame: reversing any of
    // them would be nonsense, and nothing here does it by default.
    for (const language of [false, true]) {
      expect(resolveGlyph(language, 'play', 'play')).toBe('play');
      expect(resolveGlyph(language, 'flask-outline', 'flask-outline')).toBe('flask-outline');
    }
  });
});
