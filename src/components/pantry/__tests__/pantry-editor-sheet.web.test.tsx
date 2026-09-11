/**
 * The pantry add sheet, resolved and rendered the way the browser does it.
 *
 * THE BUG THIS EXISTS FOR: tapping either "add ingredient" entry point dropped
 * straight into the global error boundary with
 * `RangeError: Maximum call stack size exceeded`. `date-field.web.tsx` did
 *
 *     export { toISODate } from './date-field';
 *
 * which reads as "re-export the native sibling" and is not: a bare specifier
 * resolves against the CURRENT platform's extensions first, so on web
 * `'./date-field'` resolves back to `date-field.web.tsx` — itself. The
 * re-export became a getter returning itself, and the first call recursed
 * until the stack blew.
 *
 * Nothing caught it. TypeScript resolves `./date-field` to the `.tsx` file;
 * Jest's default platform is native, so the whole component suite agreed with
 * TypeScript; and the route-level smoke test only visited `/pantry`, never
 * opened the sheet. The running app was the only thing that disagreed.
 *
 * This file runs under the `web` Jest project (`jest-expo/web`), where
 * `.web.tsx` wins resolution exactly as it does in Metro, and mounts the real
 * sheet through react-dom. A module that resolves to itself fails here.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PantryEditorSheet } from '@/components/pantry/pantry-editor-sheet';
import { ToastProvider } from '@/components/ui/toast';
import { I18nProvider } from '@/i18n';
import { ThemeProvider } from '@/theme';
import type { PantryItem } from '@/types/domain';

// Imported through the bare specifier ON PURPOSE: this is the resolution that
// went wrong, and under this project it picks the web implementation.
import { DateField, parseISODate, toISODate } from '@/components/ui/date-field';

// Icon fonts load from the asset registry, which only Metro populates. The
// glyphs are not what this file is about.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

/** Mounts through react-dom, which is what react-native-web actually runs on. */
function renderWeb(ui: ReactNode): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const tree = (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <I18nProvider>
            <ToastProvider>{ui}</ToastProvider>
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );

  // flushSync so the assertions read a fully committed tree rather than
  // whatever React had got around to. The sheet is a Modal, which
  // react-native-web portals out of the container, so the document is what
  // has to be read back.
  flushSync(() => root.render(tree));
  const html = document.body.innerHTML;
  root.unmount();
  container.remove();
  return html;
}

const EXISTING_ITEM: PantryItem = {
  id: 'item-1',
  userId: 'user-1',
  ingredientId: 'ingredient-1',
  ingredientName: 'milk',
  quantity: 500,
  unit: 'ml',
  category: 'dairy',
  expiresOn: '2026-12-01',
  isStaple: false,
  note: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('pantry editor on web', () => {
  it('loads the web implementation of DateField, not the native one', () => {
    // Proof by behaviour rather than by path: only the web file renders a real
    // `<input type="date">`. If Jest had picked the native sibling this suite
    // would be testing the wrong platform and proving nothing.
    const html = renderWeb(
      <DateField value={null} onChange={() => {}} minimumDate={new Date(2026, 0, 1)} testID="df" />,
    );

    expect(html).toContain('type="date"');
    expect(html).toContain('data-testid="df"');
  });

  it('exports date helpers that are real functions, not self-referencing getters', () => {
    // The recursion was invisible until called: `typeof` said "function" all
    // along. Only invoking them proves the re-export chain terminates.
    expect(toISODate(new Date(2026, 1, 14))).toBe('2026-02-14');
    expect(parseISODate('2026-02-14')?.getDate()).toBe(14);
    expect(parseISODate('2026-02-31')).toBeNull();
  });

  it('opens the add sheet without blowing the stack', () => {
    // Reaching an assertion at all is the point: the crash happened during
    // render, on DateField's first call to toISODate(minimumDate).
    const html = renderWeb(
      <PantryEditorSheet visible onClose={() => {}} item={null} onSubmit={() => {}} />,
    );

    expect(html).toContain('pantry-editor-name');
    expect(html).toContain('pantry-editor-expiry');
    expect(html).toContain('pantry-editor-submit');
  });

  it('opens the edit sheet for an existing item', () => {
    const html = renderWeb(
      <PantryEditorSheet visible onClose={() => {}} item={EXISTING_ITEM} onSubmit={() => {}} />,
    );

    expect(html).toContain('pantry-editor-expiry');
    // The stored expiry reaches the date input rather than being dropped.
    expect(html).toContain('2026-12-01');
  });
});
