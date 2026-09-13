import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { currencyForCountry } from '@/lib/format/money';
import { getItem, removeItem, resetStorageIfStale, setItem, StorageKeys } from '@/lib/storage';
import {
  DEFAULT_PREFERENCES,
  toDietFlags,
  toEatingStyle,
  type MealRequest,
  type UserPreferences,
} from '@/types/domain';

/**
 * User preferences, local-first.
 *
 * The local copy is always authoritative for rendering: it is available
 * instantly at launch and keeps the app working offline and signed-out. When a
 * Supabase session exists, `syncPreferences` mirrors changes to
 * `user_preferences` and remote values are merged in on sign-in
 * (`hydrateFromRemote`). Screens only ever touch this context.
 */

export type PreferencesContextValue = {
  preferences: UserPreferences;
  /** False until the persisted copy has been read from disk. */
  isHydrated: boolean;
  hasCompletedOnboarding: boolean;
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
  completeOnboarding: (patch: Partial<UserPreferences>) => Promise<void>;
  /** Replaces local state with server values, e.g. right after sign-in. */
  hydrateFromRemote: (remote: Partial<UserPreferences>, onboarded: boolean) => Promise<void>;
  /** Clears everything. Used on sign-out and account deletion. */
  resetPreferences: () => Promise<void>;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/** Registered by the auth layer so preference writes reach the database. */
type RemoteSync = (preferences: UserPreferences) => Promise<void>;
let remoteSync: RemoteSync | null = null;

/**
 * Installs the Supabase write-through. Called once from the auth provider so
 * this module never has to import the Supabase client (and stays trivially
 * testable).
 */
export function registerPreferenceSync(sync: RemoteSync | null): void {
  remoteSync = sync;
}

/** Merges a partial into a full preferences object, keeping derived fields consistent. */
export function mergePreferences(
  base: UserPreferences,
  patch: Partial<UserPreferences>,
): UserPreferences {
  const next = { ...base, ...patch };
  // Currency always follows country unless a caller set it explicitly.
  if (patch.country && !patch.currency) {
    next.currency = currencyForCountry(patch.country);
  }
  // Household size must stay sane; the UI clamps too, but this is the guard.
  next.householdSize = Math.min(20, Math.max(1, next.householdSize));

  // Diet migration. Earlier builds stored one value for both the eating style
  // and the halal/keto flags, so someone who picked "halal" had their
  // vegetarian answer overwritten. Recover what we can: a stored flag becomes a
  // flag, anything that is not a style becomes "none", and nothing already
  // migrated is touched twice.
  const rawDiet: string = next.dietaryPreference;
  next.dietaryPreference = toEatingStyle(rawDiet);
  next.dietFlags = Array.from(new Set([...(next.dietFlags ?? []), ...toDietFlags(rawDiet)]));

  return next;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Before anything is read: state written by an older schema is dropped.
      // Hydrating it and then discovering it is incompatible is how a tester
      // ends up debugging their own browser rather than the app.
      await resetStorageIfStale();

      const [stored, onboarded] = await Promise.all([
        getItem<Partial<UserPreferences>>(StorageKeys.guestPreferences),
        getItem<boolean>(StorageKeys.onboardingCompleted),
      ]);
      if (cancelled) return;
      if (stored) setPreferences(mergePreferences(DEFAULT_PREFERENCES, stored));
      setHasCompletedOnboarding(onboarded === true);
      setIsHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: UserPreferences) => {
    setPreferences(next);
    await setItem(StorageKeys.guestPreferences, next);
    if (remoteSync) {
      try {
        await remoteSync(next);
      } catch {
        // A failed sync must not lose the user's choice. The local copy stands
        // and the next successful write reconciles it.
      }
    }
  }, []);

  const updatePreferences = useCallback(
    async (patch: Partial<UserPreferences>) => {
      await persist(mergePreferences(preferences, patch));
    },
    [persist, preferences],
  );

  const completeOnboarding = useCallback(
    async (patch: Partial<UserPreferences>) => {
      await persist(mergePreferences(preferences, patch));
      setHasCompletedOnboarding(true);
      await setItem(StorageKeys.onboardingCompleted, true);
      await removeItem(StorageKeys.onboardingDraft);
    },
    [persist, preferences],
  );

  const hydrateFromRemote = useCallback(
    async (remote: Partial<UserPreferences>, onboarded: boolean) => {
      const next = mergePreferences(DEFAULT_PREFERENCES, remote);
      setPreferences(next);
      setHasCompletedOnboarding(onboarded);
      await setItem(StorageKeys.guestPreferences, next);
      await setItem(StorageKeys.onboardingCompleted, onboarded);
    },
    [],
  );

  const resetPreferences = useCallback(async () => {
    setPreferences(DEFAULT_PREFERENCES);
    setHasCompletedOnboarding(false);
    await removeItem(StorageKeys.guestPreferences);
    await removeItem(StorageKeys.onboardingCompleted);
    await removeItem(StorageKeys.onboardingDraft);
  }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      preferences,
      isHydrated,
      hasCompletedOnboarding,
      updatePreferences,
      completeOnboarding,
      hydrateFromRemote,
      resetPreferences,
    }),
    [
      preferences,
      isHydrated,
      hasCompletedOnboarding,
      updatePreferences,
      completeOnboarding,
      hydrateFromRemote,
      resetPreferences,
    ],
  );

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = use(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used inside <PreferencesProvider>');
  }
  return ctx;
}

/**
 * Builds the request envelope every recipe search uses, seeded from the user's
 * saved preferences. Screens override only the fields they collect.
 */
export function requestDefaultsFrom(preferences: UserPreferences) {
  return {
    currency: preferences.currency,
    country: preferences.country,
    servings: preferences.householdSize,
    dietaryPreference: preferences.dietaryPreference,
    dietFlags: preferences.dietFlags,
    allergens: preferences.allergens,
    dislikedIngredients: preferences.dislikedIngredients,
    appliances: preferences.appliances,
    skillLevel: preferences.skillLevel,
    // Defaults for the constraint fields no screen has set yet. A request
    // built from preferences alone requires nothing and excludes nothing
    // beyond the allergens and dislikes already above.
    requiredIngredients: [] as string[],
    excludedIngredients: [] as MealRequest['excludedIngredients'],
    pantryMode: 'off' as const,
    maxMissingIngredients: null,
    allowDislikedIngredients: false,
  } as const;
}
