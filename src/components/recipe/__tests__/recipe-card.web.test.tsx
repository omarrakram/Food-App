import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RecipeCard } from '@/components/recipe/recipe-card';
import { RECIPE_CATALOGUE } from '@/features/recipes/catalogue.generated';
import { I18nProvider } from '@/i18n';
import { ThemeProvider } from '@/theme';
import type { RecipeMatch } from '@/types/domain';

/**
 * A CONTROL MUST NOT CONTAIN ANOTHER CONTROL.
 *
 * THE BUG THIS EXISTS FOR: the whole card was a `PressScale` with
 * `accessibilityRole="button"`, and the save button and the price tag — both
 * pressable — sat inside it. react-native-web renders that role as a real
 * `<button>`, so the browser got `<button>` inside `<button>`: invalid HTML,
 * which React reports, and genuinely broken for anyone on a screen reader or a
 * keyboard, for whom a control nested in a control is ambiguous at best.
 *
 * This runs under the `web` Jest project, mounted through react-dom, because
 * the nesting only exists once react-native-web has chosen DOM elements — the
 * native renderer has no such thing as a `<button>` and cannot show the fault.
 */

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));

function render(ui: ReactNode): HTMLElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <QueryClientProvider client={client}>
          <ThemeProvider>
            <I18nProvider>{ui}</I18nProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>,
    ),
  );
  return container;
}

const recipe = RECIPE_CATALOGUE[0]!;

const match: RecipeMatch = {
  recipe,
  matchPercent: 50,
  haveCount: 2,
  requiredCount: 4,
  missingIngredients: [],
  availableIngredients: [],
  // Priced, because an unpriced card renders no price control at all and the
  // inventory below would pass by having one fewer thing to nest.
  estimatedCost: { money: { amountMinor: 7200, currency: 'EGP' }, source: 'estimate' },
  estimatedSpend: { money: { amountMinor: 7200, currency: 'EGP' }, source: 'estimate' },
  usesExpiringItems: [],
  score: 1,
};

function buttonsIn(container: HTMLElement) {
  return [...container.querySelectorAll('button')];
}

describe('a recipe card in the DOM', () => {
  it('renders no button inside another button', () => {
    const container = render(
      <RecipeCard match={match} onPress={() => {}} onToggleSave={() => {}} testID="card" />,
    );
    expect(container.querySelectorAll('button button')).toHaveLength(0);
  });

  it('still offers the card, the save control and the price control', () => {
    // The point is not "fewer buttons" — it is the same three controls, as
    // siblings. Collapsing any of them would pass the test above and lose a
    // feature.
    const container = render(
      <RecipeCard match={match} onPress={() => {}} onToggleSave={() => {}} testID="card" />,
    );
    const labels = buttonsIn(container).map((b) => b.getAttribute('aria-label') ?? '');

    expect(buttonsIn(container).length).toBeGreaterThanOrEqual(3);
    expect(labels.some((l) => l.startsWith(recipe.title))).toBe(true);
    expect(labels.some((l) => /save/i.test(l))).toBe(true);
    expect(labels.some((l) => /price/i.test(l))).toBe(true);
  });

  it('keeps the save control reachable on its own', () => {
    const container = render(
      <RecipeCard match={match} onPress={() => {}} onToggleSave={() => {}} testID="card" />,
    );
    const save = buttonsIn(container).find((b) => /save/i.test(b.getAttribute('aria-label') ?? ''));
    expect(save).toBeTruthy();
    expect(save!.closest('button')).toBe(save);
  });

  it('nests nothing when there is no save control either', () => {
    const container = render(<RecipeCard match={match} onPress={() => {}} testID="card" />);
    expect(container.querySelectorAll('button button')).toHaveLength(0);
  });
});
