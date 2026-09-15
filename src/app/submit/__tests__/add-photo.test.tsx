import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider } from '@/features/auth/auth-provider';
import { RepositoryProvider } from '@/features/data/repositories';
import { PreferencesProvider } from '@/features/preferences/preferences-provider';
import { I18nProvider } from '@/i18n';
import { ThemeProvider } from '@/theme';

import SubmitRecipeScreen from '../index';

/**
 * PRESSING "ADD A PHOTO" WITH NO BACKEND.
 *
 * THE BUG THIS EXISTS FOR: on the hosted preview — a build with no Supabase
 * project, which is every preview build — pressing Add a photo produced
 * "Something went wrong". `useImageUpload` opened with
 *
 *     if (!supabase || !user) throw new Error('uploads need an account');
 *
 * so the mutation threw before the picker was ever opened. Nothing had gone
 * wrong: there was nowhere to PUT a file, which says nothing about whether the
 * user may CHOOSE one.
 *
 * Every test here presses the real button on the real screen. The only thing
 * faked is the operating system's picker, because there is no file dialog in
 * this environment — and the asset it returns is shaped exactly like the one
 * `expo-image-picker` hands back on web, blob URI included.
 */

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
  useLocalSearchParams: () => ({}),
}));

// No project configured, and demo mode on: precisely the preview build, which
// is where the bug was reported. `env.demoMode` is what puts the form on
// screen at all — without it the screen says "you need an account" and there
// is no button to press.
jest.mock('@/lib/supabase/client', () => ({
  getSupabase: () => null,
  isSupabaseConfigured: () => false,
}));

jest.mock('@/lib/config/env', () => {
  const actual = jest.requireActual('@/lib/config/env') as { env: Record<string, unknown> };
  return { ...actual, env: { ...actual.env, demoMode: true } };
});

/** The picker, answering however the test in hand needs it to. */
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

type Asset = {
  uri: string;
  width: number;
  height: number;
  mimeType: string;
  fileSize: number;
  fileName: string;
};

const VALID: Asset = {
  uri: 'blob:http://localhost/9a5c-chosen-photo',
  width: 1200,
  height: 900,
  mimeType: 'image/jpeg',
  fileSize: 405_421,
  fileName: 'dinner.jpg',
};

function picker() {
  // Read back through requireMock: a jest.mock factory cannot close over a
  // variable declared in the test file.
  return jest.requireMock('expo-image-picker') as {
    launchImageLibraryAsync: jest.Mock;
    requestMediaLibraryPermissionsAsync: jest.Mock;
  };
}

function answers(result: { canceled: boolean; assets: Asset[] | null }) {
  picker().launchImageLibraryAsync.mockResolvedValueOnce(result);
}

/**
 * The client of the test in hand.
 *
 * Kept so `afterEach` can shut it down. TanStack Query batches its state
 * notifications behind a `setTimeout`, and a mutation that settles at the very
 * end of a test leaves that timer pending — which Jest reports as a worker
 * that "failed to exit gracefully".
 */
let client: QueryClient | null = null;

function renderScreen() {
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
              <AuthProvider>
                <PreferencesProvider>
                  <RepositoryProvider userId={null}>
                    <SubmitRecipeScreen />
                  </RepositoryProvider>
                </PreferencesProvider>
              </AuthProvider>
            </ToastProvider>
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );

  return render(tree);
}

/** Presses Add a photo. One press per test — Reanimated's press wrapper. */
async function pressAddPhoto() {
  fireEvent.press(await screen.findByTestId('submit-photo'));
}

afterEach(async () => {
  // Let the notify batcher's timer fire, then drop everything it might
  // schedule again.
  await new Promise((resolve) => setTimeout(resolve, 0));
  client?.clear();
  client = null;
});

beforeEach(() => {
  picker().launchImageLibraryAsync.mockReset();
  picker().launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
  picker().requestMediaLibraryPermissionsAsync.mockResolvedValue({
    granted: true,
    status: 'granted',
  });
});

describe('Add a photo without a backend', () => {
  it('opens the picker instead of reporting a failure', async () => {
    await renderScreen();
    answers({ canceled: false, assets: [VALID] });
    await pressAddPhoto();

    expect(await screen.findByTestId('submit-photo-attached')).toBeTruthy();
    expect(picker().launchImageLibraryAsync).toHaveBeenCalled();
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
    expect(screen.queryByText(/We have logged it/i)).toBeNull();
  });

  it('shows the photo it was given', async () => {
    await renderScreen();
    answers({ canceled: false, assets: [VALID] });
    await pressAddPhoto();

    const preview = await screen.findByTestId('submit-photo-preview');
    expect(preview.props.source).toEqual({ uri: VALID.uri });
  });

  it('says the photo stayed on the device rather than implying an upload', async () => {
    await renderScreen();
    answers({ canceled: false, assets: [VALID] });
    await pressAddPhoto();

    expect(await screen.findByText(/On this device only/i)).toBeTruthy();
    expect(screen.queryByText('Photo attached')).toBeNull();
  });

  it('treats cancelling as the ordinary thing it is', async () => {
    await renderScreen();
    answers({ canceled: true, assets: null });
    await pressAddPhoto();

    expect(screen.queryByTestId('submit-photo-attached')).toBeNull();
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
    expect(screen.queryByText(/could not add that photo/i)).toBeNull();
  });

  it('names an unsupported file type', async () => {
    await renderScreen();
    answers({ canceled: false, assets: [{ ...VALID, mimeType: 'image/gif' }] });
    await pressAddPhoto();

    expect(await screen.findByText(/file type is not supported/i)).toBeTruthy();
    expect(screen.queryByTestId('submit-photo-attached')).toBeNull();
  });

  it('names an oversize photo, with the limit', async () => {
    await renderScreen();
    answers({ canceled: false, assets: [{ ...VALID, fileSize: 15_616_472 }] });
    await pressAddPhoto();

    expect(await screen.findByText(/too large/i)).toBeTruthy();
    expect(screen.queryByTestId('submit-photo-attached')).toBeNull();
  });

  it('names a photo that is too small to be worth showing', async () => {
    await renderScreen();
    answers({ canceled: false, assets: [{ ...VALID, width: 400, height: 200 }] });
    await pressAddPhoto();

    expect(await screen.findByText(/too small/i)).toBeTruthy();
  });

  it('says something specific when the file cannot be read as an image', async () => {
    await renderScreen();
    answers({ canceled: false, assets: [{ ...VALID, width: 0, height: 0 }] });
    await pressAddPhoto();

    expect(await screen.findByText(/could not be read as an image/i)).toBeTruthy();
  });
});
