import { getItem, setItem, StorageKeys } from '@/lib/storage';
import type { CountryCode, OwnProfile, ProfileEdit, PublicProfile } from '@/types/domain';

/**
 * Profile access.
 *
 * Two implementations, as everywhere else in the app: a local one so a guest
 * can set a display name and see it back, and a Supabase one that is the real
 * thing. The interface is what keeps every screen from having to know which.
 *
 * The asymmetry between `own` and `byUsername` is the important part of this
 * file's shape. `own` returns an `OwnProfile` — the public half plus the
 * settings that control it. `byUsername` returns a `PublicProfile` and cannot
 * return anything else, because it reads the hand-enumerated database view
 * rather than the profiles table. A screen physically cannot render someone
 * else's visibility setting, let alone their allergens.
 */

export type HandleAvailability = 'available' | 'taken' | 'invalid';

export interface ProfileRepository {
  /** The signed-in user's own profile, or null for a guest. */
  own(): Promise<OwnProfile | null>;
  update(edit: ProfileEdit): Promise<OwnProfile>;
  /** Another user's public profile. Null when it does not exist or is hidden. */
  byUsername(username: string): Promise<PublicProfile | null>;
  /** Handle search for the friend flow. Paginated; never returns everyone. */
  search(query: string, limit?: number): Promise<PublicProfile[]>;
  checkHandle(candidate: string): Promise<HandleAvailability>;
}

/** Search results per page. Small on purpose: this runs per keystroke. */
export const PROFILE_SEARCH_LIMIT = 20;

/**
 * A guest's profile.
 *
 * There is no handle, because a handle is a claim on a shared namespace and a
 * guest has nothing to claim it with — the field is null and the UI asks them
 * to sign in rather than letting them pick one that may be gone by the time
 * they do. Everything else round-trips so the profile screen is not a
 * different screen for guests.
 */
export class LocalProfileRepository implements ProfileRepository {
  async own(): Promise<OwnProfile | null> {
    const stored = await getItem<OwnProfile>(StorageKeys.guestProfile);
    if (stored) return stored;
    return {
      id: 'local',
      username: null,
      displayName: null,
      avatarUrl: null,
      bio: null,
      country: 'EG',
      city: null,
      joinedAt: new Date().toISOString(),
      visibility: 'private',
      showCity: false,
    };
  }

  async update(edit: ProfileEdit): Promise<OwnProfile> {
    const current = (await this.own())!;
    // A guest cannot claim a handle, so one is never written even if a caller
    // passes it. Silently dropping it beats storing a claim we cannot honour.
    const { username: _ignored, ...allowed } = edit;
    const next: OwnProfile = { ...current, ...allowed, username: null };
    await setItem(StorageKeys.guestProfile, next);
    return next;
  }

  async byUsername(): Promise<PublicProfile | null> {
    // There is no directory offline. Returning null rather than throwing keeps
    // a shared profile link degrading into "not found" instead of an error.
    return null;
  }

  async search(): Promise<PublicProfile[]> {
    return [];
  }

  async checkHandle(): Promise<HandleAvailability> {
    // Never "available": a guest promised an unclaimed handle would find it
    // gone by the time they had an account to claim it with.
    return 'invalid';
  }
}

/** Rebuilds an `OwnProfile` from whatever a caller stored. */
export function toCountry(value: string | undefined): CountryCode {
  return (value ?? 'EG') as CountryCode;
}
