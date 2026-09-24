import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui/toast';
import { LocalAddressRepository } from '@/features/commerce/address-repository';
import { LocalCartRepository } from '@/features/commerce/cart-repository';
import { LocalOrderDraftRepository } from '@/features/commerce/order-draft';
import { parkPendingCart } from '@/features/commerce/pending-cart';
import { RepositoryProvider, type Repositories } from '@/features/data/repositories';
import { LocalFriendsRepository } from '@/features/friends/repository';
import { LocalMessagesRepository } from '@/features/messages/repository';
import { LocalNotificationsRepository } from '@/features/notifications/repository';
import { LocalPantryRepository } from '@/features/pantry/repository';
import { PreferencesProvider } from '@/features/preferences/preferences-provider';
import { LocalProfileRepository } from '@/features/profile/repository';
import { LocalRecipeRepository } from '@/features/recipes/repository';
import { LocalHistoryRepository, LocalSavedRepository } from '@/features/saved/repository';
import { LocalShoppingRepository } from '@/features/shopping/repository';
import { LocalSubmissionsRepository } from '@/features/submissions/repository';
import { I18nProvider } from '@/i18n';
import { setItem, StorageKeys } from '@/lib/storage';
import { ThemeProvider } from '@/theme';
import type { Cart } from '@/types/commerce';

import CartScreen from '../cart';

/**
 * THE TWO-BASKET QUESTION, ON THE SCREEN THAT ASKS IT.
 *
 * Signing in with a guest basket from a different branch parks the guest one
 * instead of discarding it. Which basket the customer meant is then open, and
 * `migrate-guest-cart.ts` is tested on its own — but the RESOLUTION is a
 * screen, and the rule that matters is a UI rule:
 *
 *   NOTHING DOWNSTREAM MAY RUN WHILE THE QUESTION IS OPEN. Validating one of
 *   two candidate baskets is meaningless, so the checkout CTA is dead until
 *   the customer has said which one they meant.
 *
 * This is also the one Commerce-4 surface the browser walk cannot reach: the
 * walk is a guest, and only signing in can park a cart.
 */

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
  useLocalSearchParams: () => ({}),
}));

const USER = 'user-1';

/**
 * A signed-in account, served by the LOCAL repositories.
 *
 * `isRemote` is what `usePendingCart` keys off — a parked cart belongs to an
 * account — and it is true whenever `RepositoryProvider` is given a `remote`
 * set and a user id. What those repositories are backed by is beside the
 * point here: the question being tested is a screen's, not a server's.
 */
function remoteRepositories(): Omit<
  Repositories,
  'scopeKey' | 'isRemote' | 'isSyncing' | 'demoMode'
> {
  return {
    pantry: new LocalPantryRepository(),
    profile: new LocalProfileRepository(),
    friends: new LocalFriendsRepository(),
    messages: new LocalMessagesRepository(),
    recipes: new LocalRecipeRepository(),
    saved: new LocalSavedRepository(),
    history: new LocalHistoryRepository(),
    shopping: new LocalShoppingRepository(),
    cart: new LocalCartRepository(),
    addresses: new LocalAddressRepository(),
    orders: new LocalOrderDraftRepository(),
    submissions: new LocalSubmissionsRepository(),
    notifications: new LocalNotificationsRepository(),
  };
}

let client: QueryClient | null = null;

function renderCart() {
  client = new QueryClient({
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
            <ToastProvider>
              <PreferencesProvider>
                <RepositoryProvider remote={remoteRepositories()} userId={USER}>
                  <CartScreen />
                </RepositoryProvider>
              </PreferencesProvider>
            </ToastProvider>
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );

  return render(tree);
}

/** The basket the guest left behind, at a different branch. */
const PARKED: Cart = {
  id: 'guest-cart',
  userId: null,
  merchantId: 'other-merchant',
  locationId: 'other-location',
  currency: 'EGP',
  revision: 1,
  deliveryFeeSnapshot: null,
  lines: [
    {
      id: 'line-1',
      merchantProductId: 'other-product',
      sourceIngredientSlug: 'rice',
      sourceRecipeId: null,
      quantity: 2,
      unitPriceSnapshot: { amountMinor: 3_000, currency: 'EGP' },
      addedAt: '2026-09-25T09:00:00.000Z',
    },
  ],
  createdAt: '2026-09-25T09:00:00.000Z',
  updatedAt: '2026-09-25T09:00:00.000Z',
};

async function seedCurrentCart() {
  await new LocalCartRepository().addLines([
    {
      merchantId: 'demo-merchant',
      locationId: 'demo-location',
      currency: 'EGP',
      merchantProductId: 'dm-rice-1kg',
      quantity: 1,
      unitPrice: { amountMinor: 5_500, currency: 'EGP' },
      sourceIngredientSlug: 'rice',
      sourceRecipeId: null,
    },
  ]);
}

const isDisabled = (node: { props: Record<string, unknown> }) =>
  node.props.accessibilityState !== undefined &&
  (node.props.accessibilityState as { disabled?: boolean }).disabled === true;

beforeEach(async () => {
  // Storage is shared across this file's tests: a parked cart from one of them
  // is a second basket the next one never asked for.
  await AsyncStorage.clear();
  await setItem(StorageKeys.languagePreference, 'en');
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  client?.clear();
  client = null;
});

describe('with a basket parked by signing in', () => {
  it('asks which basket the customer meant, on the cart', async () => {
    await seedCurrentCart();
    await parkPendingCart(USER, PARKED);

    await renderCart();

    expect(await screen.findByTestId('cart-conflict')).toBeTruthy();
    expect(screen.getByTestId('cart-conflict-keep')).toBeTruthy();
    expect(screen.getByTestId('cart-conflict-switch')).toBeTruthy();
  });

  // THE RULE. Not "the banner is visible" — the banner could be visible and
  // the CTA live, which is the failure worth catching.
  it('will not let checkout begin while the question is open', async () => {
    await seedCurrentCart();
    await parkPendingCart(USER, PARKED);

    await renderCart();
    await screen.findByTestId('cart-conflict');

    expect(isDisabled(screen.getByTestId('cart-checkout'))).toBe(true);
  });

  it('opens checkout again once the customer has kept the current basket', async () => {
    await seedCurrentCart();
    await parkPendingCart(USER, PARKED);

    await renderCart();
    fireEvent.press(await screen.findByTestId('cart-conflict-keep'));

    await waitFor(() => expect(screen.queryByTestId('cart-conflict')).toBeNull());
    expect(isDisabled(screen.getByTestId('cart-checkout'))).toBe(false);
  });

  // NOTHING IS DISCARDED SILENTLY. The parked basket only goes away because
  // somebody chose; with nothing parked there is no question to ask.
  it('asks nothing when there is only one basket', async () => {
    await seedCurrentCart();

    await renderCart();
    await screen.findByTestId('cart-lines');

    expect(screen.queryByTestId('cart-conflict')).toBeNull();
    expect(isDisabled(screen.getByTestId('cart-checkout'))).toBe(false);
  });
});
