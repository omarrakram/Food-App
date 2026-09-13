import AsyncStorage from '@react-native-async-storage/async-storage';

import { chooseGuest, clearGuestChoice, readGuestChoice } from '../guest-mode';

/**
 * Guest mode as a decision.
 *
 * The property under test is not "does a boolean round-trip" — it is that
 * "signed out" and "chose to stay signed out" stay distinguishable across a
 * relaunch. Conflating them is what made the old welcome screen a silent
 * bypass: nobody chose anything, so we could neither respect the choice nor
 * ask again without nagging.
 */

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('reports no choice before one is made', async () => {
  expect(await readGuestChoice()).toBeNull();
});

it('remembers the choice across a relaunch', async () => {
  await chooseGuest(new Date('2026-09-13T10:00:00.000Z'));

  // A fresh read is what the next cold start does.
  const restored = await readGuestChoice();
  expect(restored?.chosenAt).toBe('2026-09-13T10:00:00.000Z');
});

it('forgets the choice when asked', async () => {
  await chooseGuest();
  await clearGuestChoice();
  expect(await readGuestChoice()).toBeNull();
});

it('treats a corrupt stored value as no choice rather than throwing', async () => {
  // Reading it as a choice would let a truncated write wedge the welcome
  // screen off for good, with no way for the user to reach an account.
  await AsyncStorage.setItem('akla.auth.guestChoice', '{"chosenAt":42}');
  expect(await readGuestChoice()).toBeNull();

  await AsyncStorage.setItem('akla.auth.guestChoice', 'not json at all');
  expect(await readGuestChoice()).toBeNull();
});
