import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { ErrorBoundary } from '@/components/error-boundary';
import { AppProviders } from '@/components/providers';
import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { SupabaseBridge } from '@/features/data/supabase-bridge';
import { PreferencesProvider, usePreferences } from '@/features/preferences/preferences-provider';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

// Keep the splash up until preferences, language and the session have resolved,
// so the first frame is already in the right theme, direction and signed-in
// state rather than flashing through them.
void SplashScreen.preventAutoHideAsync();

/**
 * Routing gate.
 *
 * NOTE on paths: the onboarding screen is `(onboarding)/onboarding.tsx`, not
 * `index.tsx`. A group's `index` resolves to `/` — the same path as
 * `(drawer)/(tabs)/index` — and Expo Router then serves one of them for `/`,
 * which made finishing onboarding navigate straight back into it. Route groups
 * may not both contain an `index`.
 *
 * The tab group lives under `(drawer)` so the drawer wraps it. Both are route
 * GROUPS, so every URL is unchanged: `/`, `/discover`, `/pantry` and the rest
 * resolve exactly as before, and so do the deep links.
 *
 * Four states decide where a user belongs:
 *
 *   no session, never asked         -> (auth)/welcome, to make the choice
 *   no session, chose guest         -> the app, on local data
 *   session (or auth disabled)      -> (onboarding) until it is finished
 *   onboarded                       -> the tabs
 *
 * The first two used to be one state, and that was the "silent bypass": a
 * signed-out launch fell straight into onboarding, so nobody ever chose
 * anything and we could not tell a deliberate guest from someone who had never
 * been asked. Now the welcome screen is shown once, and a guest is a guest
 * until they sign in — never asked again on relaunch.
 *
 * Guests are still allowed everywhere except (auth): the product works signed
 * out, and forcing an account before someone has seen a single recipe would be
 * the wrong trade. The choice is about being asked, not about being blocked.
 */
function useRouteGate(isReady: boolean) {
  const router = useRouter();
  const segments = useSegments();
  const { hasCompletedOnboarding } = usePreferences();
  const { status, isEnabled, signedOutReason } = useAuth();

  useEffect(() => {
    if (!isReady || status === 'loading') return;

    const group = segments[0];
    const inAuth = group === '(auth)';
    const inOnboarding = group === '(onboarding)';

    // Ask once. `never` means the welcome screen has not been answered; every
    // other reason — guest, signed out, expired — means it has, and the user
    // is free to browse. An expired session shows its notice on the profile
    // screen rather than a wall, because the app still works on local data.
    if (isEnabled && status === 'signed_out' && signedOutReason === 'never') {
      if (!inAuth) router.replace('/(auth)/welcome');
      return;
    }

    if (!hasCompletedOnboarding) {
      // Onboarding collects the constraints every screen depends on, so it
      // comes first for guests and signed-in users alike.
      if (!inOnboarding && !inAuth) router.replace('/onboarding');
      return;
    }

    if (inOnboarding) {
      router.replace('/');
      return;
    }

    // A signed-in user has no business on the sign-in screens.
    if (inAuth && status === 'signed_in') {
      router.replace('/');
    }
  }, [isReady, status, isEnabled, signedOutReason, hasCompletedOnboarding, segments, router]);
}

function RootNavigator() {
  const theme = useTheme();
  const { isHydrated: prefsReady } = usePreferences();
  const { isHydrated: i18nReady } = useI18n();
  const { status } = useAuth();

  const isReady = prefsReady && i18nReady && status !== 'loading';
  useRouteGate(isReady);

  useEffect(() => {
    if (isReady) void SplashScreen.hideAsync();
  }, [isReady]);

  if (!isReady) return null;

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(drawer)" />
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(onboarding)" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="cook" />
        <Stack.Screen name="budget" />
        <Stack.Screen name="recipe" />
        <Stack.Screen name="search" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="shopping-list" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="messages" />
        <Stack.Screen name="submit" />
        <Stack.Screen name="moderate" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="u" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <AuthProvider>
        <PreferencesProvider>
          <SupabaseBridge>
            <ErrorBoundary>
              <RootNavigator />
            </ErrorBoundary>
          </SupabaseBridge>
        </PreferencesProvider>
      </AuthProvider>
    </AppProviders>
  );
}
