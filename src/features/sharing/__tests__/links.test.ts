/**
 * Share links.
 *
 * THE FAILURE THIS GUARDS AGAINST: a link that only opens for people who
 * already have the app. `Linking.createURL` produces `akla://recipe/x` on
 * native, which is a dead string to anybody else — so when a web origin is
 * configured it wins, and the app scheme is the fallback rather than the
 * default.
 *
 * The base path matters too. The hosted preview is served from `/Food-App/`,
 * not from the root, and a hand-built `${origin}/recipe/${id}` would 404 there
 * — which is why the origin is configured whole rather than assembled.
 */

jest.mock('expo-linking', () => ({
  createURL: (path: string) => `akla:///${path}`,
}));

const ID = 'f4006404-ffca-56e7-8916-e180f5615378';

/**
 * Reloads the module against a given configuration.
 *
 * The origin is read at import time — it is a build-time constant in the real
 * app — so each case needs a fresh module registry rather than a mutated
 * object. `jest.requireActual` after `resetModules` is what re-runs it.
 */
function loadWith(origin: string | null): typeof import('@/features/sharing/links') {
  jest.resetModules();
  jest.doMock('@/lib/config/env', () => ({ env: { webOrigin: origin } }));
  return jest.requireActual('@/features/sharing/links');
}

describe('recipePath', () => {
  it('is the app route, so an in-app link and a web link agree', () => {
    const { recipePath } = loadWith(null);
    expect(recipePath(ID)).toBe(`/recipe/${ID}`);
  });
});

describe('recipeShareUrl', () => {
  it('prefers the web origin, because that opens for everyone', () => {
    const { recipeShareUrl } = loadWith('https://omarrakram.github.io/Food-App');
    expect(recipeShareUrl(ID)).toBe(`https://omarrakram.github.io/Food-App/recipe/${ID}`);
  });

  it('does not double the slash when the origin carries one', () => {
    const { recipeShareUrl } = loadWith('https://example.com/');
    expect(recipeShareUrl(ID)).toBe(`https://example.com/recipe/${ID}`);
  });

  it('falls back to the app scheme when no web build is configured', () => {
    const { recipeShareUrl } = loadWith(null);
    expect(recipeShareUrl(ID)).toBe(`akla:///recipe/${ID}`);
  });
});

describe('recipeShareText', () => {
  it('leads with the title, because most share surfaces show one line', () => {
    const { recipeShareText } = loadWith('https://example.com');
    expect(recipeShareText('Koshari', ID)).toBe(
      `Koshari\nhttps://example.com/recipe/${ID}`,
    );
  });
});
