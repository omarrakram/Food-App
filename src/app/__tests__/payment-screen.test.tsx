import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui/toast';
import { LocalAddressRepository } from '@/features/commerce/address-repository';
import { LocalCartRepository } from '@/features/commerce/cart-repository';
import {
  PaymentRefused,
  type BeginPaymentRequest,
  type BeginPaymentResult,
  type OrderDraftRepository,
  type OrderSummary,
} from '@/features/commerce/order-draft';
import type { PaymentAttempt } from '@/features/commerce/payment-intent';
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

import PaymentScreen from '../payment/[orderId]';

/**
 * THE PAYMENT SCREEN, in every state it can be in.
 *
 * The browser walk cannot reach any of this: it runs as a guest, and a payment
 * belongs to an account. So the screen is driven here instead, against a
 * repository that answers exactly what the server would — and the four
 * assertions that matter are about WORDS, because the words are the product:
 *
 *   NOTHING SAYS PAID until the order says captured.
 *   NOTHING SAYS THE SHOP HAS IT until fulfilment says so — a separate fact.
 *   CONFIRMING IS NEVER RENDERED AS FAILURE, and offers no way to pay again.
 *   A FAILED ATTEMPT SAYS NOTHING WAS CHARGED, and offers a retry.
 *
 * WHAT IS DELIBERATELY NOT HERE: pressing the button and following the
 * mutation through to the provider. That crosses into `Linking.openURL` and
 * a chain of invalidations, and driving it from a renderer left work running
 * past the end of the test — the run passed and the process never exited,
 * which is the worst of both. The thing worth asserting about that press is
 * WHAT CROSSES THE BOUNDARY, and that is asserted at the boundary itself, in
 * `order-draft.test.ts`.
 */

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// `mock`-prefixed so the jest.mock factory may close over it: the factory is
// hoisted above every declaration in the file and everything else is dead.
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({ orderId: 'order-1' }),
}));

const ORDER: OrderSummary = {
  id: 'order-1',
  reference: 'AKL-7KQ4-M2XR',
  currency: 'EGP',
  itemsSubtotal: { amountMinor: 11_000, currency: 'EGP' },
  deliveryFee: { amountMinor: 2_000, currency: 'EGP' },
  total: { amountMinor: 13_000, currency: 'EGP' },
  payment: 'unpaid',
  fulfilment: 'draft',
  paymentMethod: null,
  draftExpiresAt: '2999-01-01T00:00:00.000Z',
  paidAt: null,
  createdAt: '2026-09-26T11:00:00.000Z',
};

function attempt(over: Partial<PaymentAttempt> = {}): PaymentAttempt {
  return {
    id: 'intent-1',
    orderId: 'order-1',
    provider: 'paymob',
    method: 'card',
    amountMinor: 13_000,
    currency: 'EGP',
    state: 'requires_action',
    checkoutUrl: 'https://accept.paymob.com/unifiedcheckout/?publicKey=pk&clientSecret=cs',
    failureCode: null,
    failureMessage: null,
    createdAt: '2026-09-26T11:10:00.000Z',
    settledAt: null,
    ...over,
  };
}

/** The server, as this test needs it to answer. Nothing else is faked. */
function orderRepository(
  order: OrderSummary,
  attempts: readonly PaymentAttempt[],
  hooks: { begin?: (request: BeginPaymentRequest) => Promise<BeginPaymentResult> } = {},
): OrderDraftRepository {
  return {
    create: () => Promise.reject(new Error('not used')),
    get: () => Promise.resolve(order),
    attempts: () => Promise.resolve(attempts),
    attempt: (id) => Promise.resolve(attempts.find((entry) => entry.id === id) ?? null),
    beginPayment:
      hooks.begin ??
      (() => Promise.reject(new PaymentRefused('unknown'))),
    cancelPayment: () => Promise.resolve(),
    simulatePayment: () => Promise.resolve(),
    clearPaidCart: () => Promise.resolve(true),
  };
}

function repositories(
  orders: OrderDraftRepository,
): Omit<Repositories, 'scopeKey' | 'isRemote' | 'isSyncing' | 'demoMode'> {
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
    orders,
    submissions: new LocalSubmissionsRepository(),
    notifications: new LocalNotificationsRepository(),
  };
}

let client: QueryClient | null = null;


async function renderPayment(orders: OrderDraftRepository) {
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
                <RepositoryProvider remote={repositories(orders)} userId="user-1">
                  <PaymentScreen />
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

beforeEach(async () => {
  /*
    THE ONE THING THAT MUST NOT REALLY HAPPEN.

    On success the screen sends the customer to the provider, which on native
    is `Linking.openURL`. Left real, it hands jest a promise the environment
    never settles and the run never exits — the test passes and the process
    hangs, which is the worst of both. Stubbed here so the navigation is
    observable instead of attempted.
  */
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await AsyncStorage.clear();
  await setItem(StorageKeys.languagePreference, 'en');
  mockReplace.mockClear();
});

afterEach(async () => {
  /*
    TEARDOWN, IN THE ORDER THAT ACTUALLY STOPS THINGS.

    This screen polls while a payment is confirming, and the poll is a
    `refetchInterval` owned by the query. `clear()` alone empties the cache but
    leaves the client's focus and online subscriptions attached, so the run
    finished and the process did not exit. `unmount()` detaches them; the tick
    after lets the notify batcher drain what it already scheduled.
  */
  client?.unmount();
  await new Promise((resolve) => setTimeout(resolve, 0));
  client?.clear();
  client = null;
});

describe('nothing has been tried yet', () => {
  it('offers a way to pay and says nothing has been charged', async () => {
    await renderPayment(orderRepository(ORDER, []));

    expect(await screen.findByTestId('payment-continue')).toBeTruthy();
    expect(screen.getByTestId('payment-method-card')).toBeTruthy();
    expect(screen.getByTestId('payment-method-wallet')).toBeTruthy();
    expect(screen.queryByTestId('payment-confirmed')).toBeNull();
    expect(screen.queryByText(/Order placed|Order confirmed/i)).toBeNull();
  });

});

describe('while the provider is deciding', () => {
  it('says it is confirming, and never that it failed', async () => {
    await renderPayment(
      orderRepository({ ...ORDER, payment: 'authorising', fulfilment: 'pending' }, [
        attempt({ state: 'processing' }),
      ]),
    );

    expect(await screen.findByTestId('payment-confirming')).toBeTruthy();
    expect(screen.queryByTestId('payment-failed')).toBeNull();
    expect(screen.getByText(/Do not pay again/i)).toBeTruthy();
  });

  // THE DOUBLE-CHARGE GUARD, on the screen. Whatever the domain says, this is
  // the button that would take the second payment.
  it('offers no way to start another payment', async () => {
    await renderPayment(
      orderRepository({ ...ORDER, payment: 'authorising', fulfilment: 'pending' }, [
        attempt({ state: 'processing' }),
      ]),
    );

    await screen.findByTestId('payment-confirming');
    expect(screen.queryByTestId('payment-continue')).toBeNull();
    expect(screen.queryByTestId('payment-method-card')).toBeNull();
  });

  it('lets somebody who closed the page open it again, but only before the provider has it', async () => {
    await renderPayment(
      orderRepository({ ...ORDER, payment: 'authorising', fulfilment: 'pending' }, [
        attempt({ state: 'requires_action' }),
      ]),
    );

    expect(await screen.findByTestId('payment-resume')).toBeTruthy();
    expect(screen.getByTestId('payment-cancel-attempt')).toBeTruthy();
  });
});

describe('when the payment went through', () => {
  it('says the shop has it only once fulfilment says so', async () => {
    // Captured, but the order has not reached the queue in this render. The
    // money is ours; the shop does not have it yet, and the copy must not
    // claim otherwise.
    await renderPayment(
      orderRepository(
        { ...ORDER, payment: 'captured', fulfilment: 'pending', paidAt: '2026-09-26T11:20:00.000Z' },
        [attempt({ state: 'succeeded', settledAt: '2026-09-26T11:20:00.000Z' })],
      ),
    );

    expect(await screen.findByTestId('payment-confirmed')).toBeTruthy();
    expect(screen.getByText(/being sent to the shop/i)).toBeTruthy();
    expect(screen.queryByText(/order is with the shop/i)).toBeNull();
  });

  it('says the shop has it once the order is placed', async () => {
    await renderPayment(
      orderRepository(
        { ...ORDER, payment: 'captured', fulfilment: 'placed', paidAt: '2026-09-26T11:20:00.000Z' },
        [attempt({ state: 'succeeded', settledAt: '2026-09-26T11:20:00.000Z' })],
      ),
    );

    expect(await screen.findByTestId('payment-confirmed')).toBeTruthy();
    expect(screen.getByText(/order is with the shop/i)).toBeTruthy();
    expect(screen.queryByTestId('payment-continue')).toBeNull();
  });

  // A SUCCEEDED ATTEMPT IS NOT A RECEIPT. Only the order is.
  it('does not claim payment from an attempt the order has not caught up with', async () => {
    await renderPayment(
      orderRepository({ ...ORDER, payment: 'authorising', fulfilment: 'pending' }, [
        attempt({ state: 'succeeded', settledAt: '2026-09-26T11:20:00.000Z' }),
      ]),
    );

    await screen.findByTestId('payment-continue');
    expect(screen.queryByTestId('payment-confirmed')).toBeNull();
  });
});

describe('when it failed', () => {
  it('says nothing was charged and offers a retry', async () => {
    await renderPayment(
      orderRepository({ ...ORDER, payment: 'failed', fulfilment: 'pending' }, [
        attempt({ state: 'failed', failureCode: 'insufficient_funds' }),
      ]),
    );

    expect(await screen.findByTestId('payment-failed')).toBeTruthy();
    expect(screen.getByText(/not enough funds/i)).toBeTruthy();
    expect(screen.getByText(/Nothing was charged/i)).toBeTruthy();
    expect(screen.getByTestId('payment-continue')).toBeTruthy();
  });

});

describe('when the draft ran out of time', () => {
  it('will not take a payment and sends the customer back to their basket', async () => {
    await renderPayment(
      orderRepository({ ...ORDER, draftExpiresAt: '2020-01-01T00:00:00.000Z' }, [
        attempt({ state: 'cancelled' }),
      ]),
    );

    expect(await screen.findByTestId('payment-expired')).toBeTruthy();
    expect(screen.queryByTestId('payment-continue')).toBeNull();
    expect(screen.getByTestId('payment-back-to-cart')).toBeTruthy();
  });

  // AN EXPIRY THAT HAS PASSED MUST NOT MAKE A PAID ORDER LOOK UNPAYABLE.
  it('still shows a paid order as paid', async () => {
    await renderPayment(
      orderRepository(
        {
          ...ORDER,
          payment: 'captured',
          fulfilment: 'placed',
          draftExpiresAt: '2020-01-01T00:00:00.000Z',
        },
        [attempt({ state: 'succeeded' })],
      ),
    );

    expect(await screen.findByTestId('payment-confirmed')).toBeTruthy();
    expect(screen.queryByTestId('payment-expired')).toBeNull();
  });
});
