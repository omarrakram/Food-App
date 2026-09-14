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
  /** A guest's display name, bio and country, before there is an account. */
  guestProfile: 'akla.guest.profile',
  /** The schema version the stored data was written by. See `SCHEMA_VERSION`. */
  schemaVersion: 'akla.schema.version',
  /** Demo-mode friends, requests and blocks. Only written when `demoMode` is on. */
  demoFriends: 'akla.demo.friends',
  /** Demo-mode message store. Only ever written when `demoMode` is on. */
  demoMessages: 'akla.demo.messages',
  /** Demo-mode community submissions and their moderation history. */
  demoSubmissions: 'akla.demo.submissions',
  /** Demo-mode notification feed. */
  demoNotifications: 'akla.demo.notifications',
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

/**
 * Bump this when a stored shape changes incompatibly.
 *
 * 2: the matching engine's semantics changed. `recentIngredients` seeds the
 *    Cook screen, and a preview tester carrying a selection from before the
 *    fix would submit it, get the new behaviour, and have no way to tell
 *    whether they were seeing a stale client or a real result. Clearing is
 *    cheaper than explaining.
 */
export const SCHEMA_VERSION = 2;

/**
 * Drops persisted state written by an older schema.
 *
 * Deliberately blunt: everything here is a cache or a convenience — a recent
 * search, a draft, a colour scheme — and none of it is worth a migration path.
 * Real user data lives on the server or in the pantry repository, neither of
 * which this touches.
 *
 * Returns true when something was actually cleared, so a preview build can say
 * so rather than leaving the tester wondering why their selections vanished.
 */
export async function resetStorageIfStale(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(StorageKeys.schemaVersion);
    const stored = raw === null ? 0 : Number.parseInt(raw, 10);
    if (Number.isFinite(stored) && stored >= SCHEMA_VERSION) return false;

    // A first run has nothing to clear; only say we reset when we did.
    const hadData = (await AsyncStorage.getItem(StorageKeys.onboardingCompleted)) !== null;
    await clearAppStorage();
    await AsyncStorage.setItem(StorageKeys.schemaVersion, String(SCHEMA_VERSION));
    return hadData;
  } catch {
    // Storage being unavailable is not a reason to refuse to start.
    return false;
  }
}
