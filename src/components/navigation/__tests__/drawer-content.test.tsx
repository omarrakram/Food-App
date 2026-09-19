import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppDrawerContent } from '@/components/navigation/drawer-content';
import { AuthProvider } from '@/features/auth/auth-provider';
import { RepositoryProvider } from '@/features/data/repositories';
import { PreferencesProvider } from '@/features/preferences/preferences-provider';
import { LocalSubmissionsRepository } from '@/features/submissions/repository';
import { I18nProvider } from '@/i18n';
import { ThemeProvider } from '@/theme';

/**
 * WHICH ROWS THE DRAWER RENDERS, and for whom.
 *
 * The review queue is the one that matters. `moderate_submission` already
 * refuses a caller without the role — that is the boundary, it is asserted in
 * `supabase/tests/07_moderation_test.sql`, and no UI change can weaken it.
 * This is the SECOND line: an ordinary user must not be told the screen
 * exists. A visible row they cannot use teaches them the product has a staff
 * area and invites them to go looking for the way in.
 *
 * So the test is about rendering, and it is deliberately rendered rather than
 * asserted against a predicate: the bug this prevents is a row wired to the
 * wrong flag, and a predicate test passes happily while the row reads a
 * different one.
 */

// The drawer asks React Navigation whether it is open, to hide itself from
// assistive technology when it is not. There is no navigator here, and the
// answer is not what this file is about.
jest.mock('expo-router/build/react-navigation/drawer', () => ({
  useDrawerStatus: () => 'open',
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), canGoBack: () => false }),
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

/** A submissions repository that answers the role question however we say. */
class Submissions extends LocalSubmissionsRepository {
  constructor(private readonly allowed: boolean) {
    super();
  }
  override async canModerate(): Promise<boolean> {
    return this.allowed;
  }
}

function renderDrawer(canModerate: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  const navigation = { closeDrawer: jest.fn() } as never;

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
            <AuthProvider>
              <PreferencesProvider>
                <RepositoryProvider
                  userId="someone"
                  remote={{ submissions: new Submissions(canModerate) } as never}
                >
                  <AppDrawerContent navigation={navigation} state={{} as never} descriptors={{}} />
                </RepositoryProvider>
              </PreferencesProvider>
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );

  return render(tree);
}

describe('the drawer', () => {
  it('renders at all', async () => {
    // Guards the rest: every "is absent" assertion below would pass on an
    // empty tree, which is the failure mode a negative test invites.
    await renderDrawer(false);
    expect(screen.getByTestId('app-drawer')).toBeTruthy();
    expect(screen.getByTestId('drawer-row-friends')).toBeTruthy();
    expect(screen.getByTestId('drawer-row-messages')).toBeTruthy();
  });

  it('does NOT show the review queue to an ordinary user', async () => {
    await renderDrawer(false);
    expect(screen.queryByTestId('drawer-row-moderate')).toBeNull();
  });

  it('shows it to somebody the server says holds the role', async () => {
    await renderDrawer(true);
    expect(await screen.findByTestId('drawer-row-moderate')).toBeTruthy();
  });

  it('offers Submit a recipe to everybody — that is not a staff screen', async () => {
    await renderDrawer(false);
    expect(screen.getByTestId('drawer-row-submit')).toBeTruthy();
    expect(screen.getByTestId('drawer-row-submissions')).toBeTruthy();
  });

  it('names the gear row Settings, not Profile', async () => {
    // Two rows named after the same noun, two lines apart, one of which
    // edits an identity and the other of which does not.
    await renderDrawer(false);
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Edit profile')).toBeTruthy();
  });

  it('never puts instructional copy where a name belongs', async () => {
    // The identity block showed "Your username, name and how visible you
    // are" when there was no handle, truncated mid-word.
    await renderDrawer(false);
    expect(screen.queryByText(/Your username, name and how/)).toBeNull();
    expect(screen.getByTestId('drawer-identity')).toBeTruthy();
  });
});
