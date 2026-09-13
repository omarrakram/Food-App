import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Namespaced keys for non-sensitive local state.
 *
 * Anything secret (tokens, credentials) must go through
 * `src/lib/supabase/secure-storage.ts` instead — AsyncStorage is plain text on
 * disk.
 */
export const StorageKeys = {
  colorSchemePreference: 'akla.pref.colorScheme',
  languagePreference: 'akla.pref.language',
  onboardingCompleted: 'akla.onboarding.completed',
  onboardingDraft: 'akla.onboarding.draft',
  guestPreferences: 'akla.guest.preferences',
  recentIngredients: 'akla.recent.ingredients',
  recentSearches: 'akla.recent.searches',
  lastBudget: 'akla.recent.budget',
  /** User ids whose guest data has already been copied to the server. */
  migratedUsers: 'akla.migration.users',
  /** Set when the user explicitly chose to continue without an account. */
  guestChoice: 'akla.auth.guestChoice',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];

/** Reads and JSON-parses a key. Returns `null` on miss or malformed value. */
export async function getItem<T>(key: StorageKey): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    // A malformed value is indistinguishable from a miss for callers, and
    // throwing here would break app start. Drop it and move on.
    return null;
  }
}

export async function setItem<T>(key: StorageKey, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage being full or unavailable must never crash a user flow.
  }
}

export async function removeItem(key: StorageKey): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Clears every Akla-owned key. Used on sign-out and account deletion. */
export async function clearAppStorage(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(StorageKeys));
  } catch {
    // ignore
  }
}
