/**
 * The language set, and which of them read right to left.
 *
 * Split out of `index.tsx` so that `direction.ts` can ask "does this language
 * read right to left?" without importing the provider that itself needs
 * `direction.ts`. Everything here is re-exported from `@/i18n`, so no call
 * site outside this folder has to know the file exists.
 */
export type Language = 'en' | 'ar';

export const SUPPORTED_LANGUAGES: readonly Language[] = ['en', 'ar'] as const;

/** Languages that render right-to-left. */
const RTL_LANGUAGES: readonly Language[] = ['ar'] as const;

export function isRTLLanguage(language: Language): boolean {
  return RTL_LANGUAGES.includes(language);
}
