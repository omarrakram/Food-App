import { getItem, removeItem, setItem, StorageKeys } from '@/lib/storage';

/**
 * "Continue as guest" as a decision, not an absence.
 *
 * Being signed out is not the same as choosing to stay signed out, and the
 * difference is the whole reason this file exists. Before it, a signed-out
 * launch fell through the routing gate into the app, which meant:
 *
 *   - a user who had never seen the welcome screen and a user who had
 *     deliberately declined an account were indistinguishable, so we could
 *     never re-offer an account without nagging the second one;
 *   - a session that EXPIRED looked identical to a guest, and the app quietly
 *     carried on with local data instead of saying anything.
 *
 * The choice is stored rather than held in memory because it has to survive a
 * relaunch: asking again every cold start is the nagging we are avoiding.
 */

export type GuestChoice = {
  /** When the user chose to continue without an account. */
  chosenAt: string;
};

export async function readGuestChoice(): Promise<GuestChoice | null> {
  const stored = await getItem<GuestChoice>(StorageKeys.guestChoice);
  if (!stored || typeof stored.chosenAt !== 'string') return null;
  return stored;
}

export async function chooseGuest(now: Date = new Date()): Promise<GuestChoice> {
  const choice: GuestChoice = { chosenAt: now.toISOString() };
  await setItem(StorageKeys.guestChoice, choice);
  return choice;
}

/**
 * Forgets the choice.
 *
 * Called when the user signs in — their guest period is over and their data
 * has been migrated — and when they explicitly ask to create an account, so
 * the gate stops treating them as a guest and lets the auth screens through.
 */
export async function clearGuestChoice(): Promise<void> {
  await removeItem(StorageKeys.guestChoice);
}
