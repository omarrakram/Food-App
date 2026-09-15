import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SharedRecipeCard } from '@/components/messages/shared-recipe-card';
import { RepositoryProvider } from '@/features/data/repositories';
import { LocalRecipeRepository } from '@/features/recipes/repository';
import { I18nProvider } from '@/i18n';
import { makeRecipe } from '@/test-utils/factories';
import { ThemeProvider } from '@/theme';
import type { Recipe } from '@/types/domain';

/**
 * A recipe inside a message, in both of the states that matter.
 *
 * PRESENT: the card opens the recipe. A share nobody can act on is a picture
 * of a share.
 *
 * GONE: the card says so, deliberately, and is not pressable. This is the case
 * the reference-not-a-copy design exists for — a recipe unpublished for unsafe
 * instructions has to stop being served from every chat log that carried it,
 * and "stop being served" must look like a decision rather than a failure.
 */

// `jest.mock` factories cannot close over test-file variables, so the spy
// lives on the mock module and is read back out below.
jest.mock('expo-router', () => {
  const push = jest.fn();
  return { useRouter: () => ({ push }), __push: push };
});

const { __push: push } = jest.requireMock('expo-router') as { __push: jest.Mock };
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

/** Answers `byId` with whatever the test wants, including nothing. */
class Recipes extends LocalRecipeRepository {
  constructor(private readonly recipe: Recipe | null) {
    super();
  }
  override async byId(): Promise<Recipe | null> {
    return this.recipe;
  }
}

function renderCard(recipe: Recipe | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  const tree: ReactNode = (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <I18nProvider>
            <RepositoryProvider userId="me" remote={{ recipes: new Recipes(recipe) } as never}>
              <SharedRecipeCard recipeId="shared-1" testID="card" />
            </RepositoryProvider>
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );

  return render(tree);
}

beforeEach(() => push.mockClear());

describe('a shared recipe', () => {
  it('renders the recipe it points at', async () => {
    await renderCard(makeRecipe({ id: 'r-1', title: 'Koshari' }));
    expect(await screen.findByText('Koshari')).toBeTruthy();
  });

  it('opens Recipe Detail when tapped', async () => {
    await renderCard(makeRecipe({ id: 'r-1', title: 'Koshari' }));
    await screen.findByText('Koshari');

    fireEvent.press(screen.getByTestId('card'));
    expect(push).toHaveBeenCalledWith('/recipe/r-1');
  });

  it('says so, deliberately, when the recipe is gone', async () => {
    await renderCard(null);
    expect(await screen.findByTestId('card-missing')).toBeTruthy();
    expect(screen.getByText('Recipe unavailable')).toBeTruthy();
  });

  it('does not offer to open a recipe that is not there', async () => {
    await renderCard(null);
    await screen.findByTestId('card-missing');

    // No pressable card at all — `card` is the id the present state uses.
    expect(screen.queryByTestId('card')).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it('carries no copy of the recipe — only the reference', async () => {
    // The whole point: the card looked the recipe up. If it had been handed a
    // copy it would still be rendering a title here.
    await renderCard(null);
    expect(screen.queryByText('Koshari')).toBeNull();
  });
});
