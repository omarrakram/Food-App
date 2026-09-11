import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui/toast';
import { I18nProvider } from '@/i18n';
import { ThemeProvider } from '@/theme';

/**
 * Renders a component inside the providers it actually needs.
 *
 * Mirrors the real provider order from `AppProviders`, so a component that
 * works here works in the app. Auth and repositories are deliberately absent:
 * a component that needs them should take its data as props.
 */

/** Fresh client per test, with retries off so failures surface immediately. */
function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <QueryClientProvider client={testQueryClient()}>
        <ThemeProvider>
          <I18nProvider>
            <ToastProvider>{children}</ToastProvider>
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/**
 * NOTE: `render` is asynchronous in React Native Testing Library v14 — it
 * returns a promise that resolves once the tree has settled. Callers must
 * await it, and `screen` is only populated afterwards.
 */
export async function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return rtlRender(ui, { wrapper: Providers, ...options });
}

export * from '@testing-library/react-native';
