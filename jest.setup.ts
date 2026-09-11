/**
 * Jest setup.
 *
 * Native modules are mocked here rather than in individual tests, so a suite
 * that only exercises pure logic never has to know they exist.
 */
import { cleanup, configure } from '@testing-library/react-native';

// React Native Testing Library v14 registers its matchers automatically, so
// there is nothing to import for `toBeOnTheScreen` and friends.
//
// `defaultIncludeHiddenElements` matters for this app: several components wrap
// their contents in an `accessible` container so a screen reader announces the
// group as one element (the Stepper, the pantry row, the state views). That
// correctly hides the descendants from the accessibility tree — and, by
// default, from RNTL's queries too. Including them lets tests assert on the
// inner structure while the components keep the grouping that makes them
// usable with a screen reader.
// Applied per test, not once: the library's automatic cleanup resets its
// configuration between tests, so a single call at setup time would silently
// stop applying after the first test in every file.
beforeEach(() => {
  configure({ defaultIncludeHiddenElements: true });
});

// `render` and `cleanup` are both asynchronous in v14, and the automatic
// cleanup does not await. Awaiting it here means each test starts from a
// genuinely empty tree.
afterEach(async () => {
  await cleanup();
});

// expo-localization reads device settings that do not exist under Jest.
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en', regionCode: 'EG', languageTag: 'en-EG' }],
  getCalendars: () => [],
}));

// Local row ids come from Crypto.randomUUID, which needs native code. A
// counter is enough and makes ids deterministic in assertions.
let uuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `test-uuid-${(uuidCounter += 1)}`,
  digestStringAsync: async (_algorithm: string, value: string) => value,
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
}));

jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn(),
  activateKeepAwakeAsync: jest.fn(),
  deactivateKeepAwake: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
