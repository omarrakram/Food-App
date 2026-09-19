import { getLocales } from 'expo-localization';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { I18nManager } from 'react-native';

import { getItem, setItem, StorageKeys } from '@/lib/storage';

import { ar } from './locales/ar';
import { en, type RawTranslationKey, type TranslationKey } from './locales/en';

export type Language = 'en' | 'ar';

export const SUPPORTED_LANGUAGES: readonly Language[] = ['en', 'ar'] as const;

const DICTIONARIES: Record<Language, Partial<Record<RawTranslationKey, string>>> = { en, ar };

/** Languages that render right-to-left. */
const RTL_LANGUAGES: readonly Language[] = ['ar'] as const;

export type TranslateValues = Record<string, string | number>;

export type Translate = (key: TranslationKey, values?: TranslateValues) => string;

type I18nContextValue = {
  language: Language;
  /** BCP 47 tag for `Intl` and for anything that formats money or dates. */
  locale: string;
  isRTL: boolean;
  setLanguage: (next: Language) => void;
  t: Translate;
  /** Formats a number using the active locale's digits and grouping. */
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** Formats an ISO date string; returns '' for a missing/invalid date. */
  formatDate: (iso: string | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
  isHydrated: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Maps a base key to its `_one` / `_other` variant when a `count` is supplied.
 * Falls through to the literal key when no plural variant exists.
 */
function resolveKey(key: TranslationKey, values: TranslateValues | undefined): RawTranslationKey {
  if (values && typeof values.count === 'number') {
    const suffix = values.count === 1 ? '_one' : '_other';
    const pluralKey = `${key}${suffix}`;
    if (pluralKey in en) return pluralKey as RawTranslationKey;
  }
  return key as RawTranslationKey;
}

function interpolate(template: string, values: TranslateValues | undefined): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

export function createTranslator(language: Language): Translate {
  const dictionary = DICTIONARIES[language];
  return (key, values) => {
    const resolved = resolveKey(key, values);
    // Fall back to English so a partially translated locale never leaks a raw
    // key into the UI.
    const template = dictionary[resolved] ?? en[resolved] ?? key;
    return interpolate(template, values);
  };
}

function detectDeviceLanguage(): Language {
  try {
    const locales = getLocales();
    const first = locales[0];
    const code = first?.languageCode?.toLowerCase();
    if (code && (SUPPORTED_LANGUAGES as readonly string[]).includes(code)) {
      return code as Language;
    }
  } catch {
    // expo-localization can throw in restricted environments (e.g. tests).
  }
  return 'en';
}

export function isRTLLanguage(language: Language): boolean {
  return RTL_LANGUAGES.includes(language);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getItem<Language>(StorageKeys.languagePreference);
      if (cancelled) return;
      const next =
        stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)
          ? stored
          : detectDeviceLanguage();
      setLanguageState(next);
      setIsHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    void setItem(StorageKeys.languagePreference, next);
    // `forceRTL` only takes effect after a full reload of the native app, so we
    // set it here and surface `language.restartNotice` at the call site.
    const shouldBeRTL = isRTLLanguage(next);
    if (I18nManager.isRTL !== shouldBeRTL) {
      I18nManager.allowRTL(shouldBeRTL);
      I18nManager.forceRTL(shouldBeRTL);
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    /*
      WESTERN NUMERALS IN BOTH LANGUAGES, decided app-wide.

      `ar-EG` alone makes every Intl formatter emit Arabic-Indic digits
      (٠١٢٣…), which left the product speaking two numeral systems at once:
      interpolated counts came out Latin because `t()` does plain string
      substitution, while anything through `formatNumber`, `formatMoney` or
      `formatDate` came out Arabic-Indic — and a handful of Arabic strings had
      Arabic-Indic digits typed into them by hand. A price could disagree with
      the count beside it on the same row.

      The `-u-nu-latn` Unicode extension pins the numbering system to Latin
      while leaving everything else about the locale alone: grouping,
      currency placement, date order and month names stay Egyptian, and text
      direction is unaffected because that comes from `isRTL`, not from here.
      `formatMoney` keys its Arabic currency symbol off `startsWith('ar')`,
      which the extension preserves.
    */
    const locale = language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US';
    return {
      language,
      locale,
      isRTL: isRTLLanguage(language),
      setLanguage,
      t: createTranslator(language),
      formatNumber: (input, options) => {
        try {
          return new Intl.NumberFormat(locale, options).format(input);
        } catch {
          return String(input);
        }
      },
      formatDate: (iso, options) => {
        if (!iso) return '';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '';
        try {
          return new Intl.DateTimeFormat(
            locale,
            options ?? { day: 'numeric', month: 'short', year: 'numeric' },
          ).format(date);
        } catch {
          return date.toISOString().slice(0, 10);
        }
      },
      isHydrated,
    };
  }, [language, setLanguage, isHydrated]);

  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18nContextValue {
  const ctx = use(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return ctx;
}

/** Convenience hook for the common case of only needing `t`. */
export function useTranslation(): Translate {
  return useI18n().t;
}

export type { RawTranslationKey, TranslationKey };
