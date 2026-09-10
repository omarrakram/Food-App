/**
 * Jest setup.
 *
 * Native modules are mocked here rather than in individual tests, so a suite
 * that only exercises pure logic never has to know they exist.
 */
// React Native Testing Library v14 registers its matchers automatically, so
// there is nothing to import for `toBeOnTheScreen` and friends.

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
