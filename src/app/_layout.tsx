import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { ErrorBoundary } from '@/components/error-boundary';
import { AppProviders } from '@/components/providers';
import { RepositoryProvider } from '@/features/data/repositories';
import { PreferencesProvider, usePreferences } from '@/features/preferences/preferences-provider';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

// Keep the splash up until preferences, theme and language have hydrated, so
// the first frame the user sees is already in the right theme and direction.
void SplashScreen.preventAutoHideAsync();

/**
 * Routing gate.
 *
 * A user who has not finished onboarding is sent there and cannot navigate out
 * of it; everyone else is kept out of it. Runs as an effect on the segment
 * array so it re-evaluates on every navigation, including deep links.
 */
function useOnboardingGate(isReady: boolean) {
  const router = useRouter();
  const segments = useSegments();
  const { hasCompletedOnboarding } = usePreferences();

  useEffect(() => {
    if (!isReady) return;
    const inOnboarding = segments[0] === '(onboarding)';

    if (!hasCompletedOnboarding && !inOnboarding) {
      router.replace('/(onboarding)');
    } else if (hasCompletedOnboarding && inOnboarding) {
      router.replace('/');
    }
  }, [isReady, hasCompletedOnboarding, segments, router]);
}

function RootNavigator() {
  const theme = useTheme();
  const { isHydrated: prefsReady } = usePreferences();
  const { isHydrated: i18nReady } = useI18n();

  const isReady = prefsReady && i18nReady;
  useOnboardingGate(isReady);

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
        <Stack.Screen name="cook" options={{ presentation: 'card' }} />
        <Stack.Screen name="budget" options={{ presentation: 'card' }} />
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
      <PreferencesProvider>
        <RepositoryProvider>
          <ErrorBoundary>
            <RootNavigator />
          </ErrorBoundary>
        </RepositoryProvider>
      </PreferencesProvider>
    </AppProviders>
  );
}
