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
 * Three states decide where a user belongs:
 *
 *   no session + auth enabled       -> (auth), unless they chose to browse
 *   session (or auth disabled)      -> (onboarding) until it is finished
 *   onboarded                       -> the tabs
 *
 * Guests are deliberately allowed everywhere except (auth): the product works
 * signed out, and forcing an account before someone has seen a single recipe
 * would be the wrong trade.
 */
function useRouteGate(isReady: boolean) {
  const router = useRouter();
  const segments = useSegments();
  const { hasCompletedOnboarding } = usePreferences();
  const { status } = useAuth();

  useEffect(() => {
    if (!isReady || status === 'loading') return;

    const group = segments[0];
    const inAuth = group === '(auth)';
    const inOnboarding = group === '(onboarding)';

    if (!hasCompletedOnboarding) {
      // Onboarding collects the constraints every screen depends on, so it
      // comes first for guests and signed-in users alike.
      if (!inOnboarding && !inAuth) router.replace('/(onboarding)');
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
  }, [isReady, status, hasCompletedOnboarding, segments, router]);
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
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(onboarding)" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="cook" />
        <Stack.Screen name="budget" />
        <Stack.Screen name="recipe" />
        <Stack.Screen name="search" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="shopping-list" />
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
