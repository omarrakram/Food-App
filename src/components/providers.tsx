import { QueryClientProvider } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { I18nProvider } from '@/i18n';
import { createQueryClient } from '@/lib/query/client';
import { ThemeProvider } from '@/theme';

import { ToastProvider } from './ui/toast';

/**
 * Composes every app-wide provider in dependency order.
 *
 *   GestureHandler -> SafeArea -> Query -> Theme -> I18n -> Toast
 *
 * Theme sits above I18n because the toast host needs theme tokens, and both sit
 * above Toast for the same reason. Auth and preference providers are inserted
 * by the root layout, which needs them nested inside these.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // One client for the lifetime of the app; recreating it would drop the cache.
  const queryClient = useMemo(() => createQueryClient(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <I18nProvider>
              <ToastProvider>{children}</ToastProvider>
            </I18nProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
