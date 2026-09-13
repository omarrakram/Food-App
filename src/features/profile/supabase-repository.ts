import type { SupabaseClient } from '@supabase/supabase-js';

import { toAppError } from '@/lib/errors';
import type { Database, ProfileRow, PublicProfileRow } from '@/lib/supabase/database.types';
import type { CountryCode, OwnProfile, ProfileEdit, PublicProfile } from '@/types/domain';

import { handleKey, validateHandle } from './handle';
import {
  PROFILE_SEARCH_LIMIT,
  type HandleAvailability,
  type ProfileRepository,
} from './repository';

/** Postgres unique-violation. The one error here that is not really an error. */
const UNIQUE_VIOLATION = '23505';

function toPublic(row: PublicProfileRow): PublicProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    country: row.country as CountryCode,
    city: row.city,
    joinedAt: row.joined_at,
  };
}

function toOwn(row: ProfileRow): OwnProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    country: row.country as CountryCode,
    city: row.city,
    joinedAt: row.created_at,
    visibility: row.visibility,
    showCity: row.show_city,
  };
}

export class SupabaseProfileRepository implements ProfileRepository {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async own(): Promise<OwnProfile | null> {
    // Reads the TABLE, not the view: this is the one profile whose settings
    // the caller is allowed to see, and RLS is what guarantees that.
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', this.userId)
      .maybeSingle();

    if (error) throw toAppError(error, 'database');
    return data ? toOwn(data) : null;
  }

  async update(edit: ProfileEdit): Promise<OwnProfile> {
    const patch: Partial<Omit<ProfileRow, 'username_key'>> = {};

    if (edit.username !== undefined) {
      const handle = edit.username?.trim() ?? null;
      // Checked here as well as by the database because a rejected UPDATE is a
      // wasted round trip and an ugly error; the constraint is still what
      // actually decides.
      if (handle !== null && validateHandle(handle) !== null) {
        throw toAppError(new Error('invalid handle'), 'validation');
      }
      patch.username = handle;
    }
    if (edit.displayName !== undefined) patch.display_name = edit.displayName?.trim() || null;
    if (edit.bio !== undefined) patch.bio = edit.bio?.trim() || null;
    if (edit.avatarUrl !== undefined) patch.avatar_url = edit.avatarUrl;
    if (edit.country !== undefined) patch.country = edit.country;
    if (edit.city !== undefined) patch.city = edit.city?.trim() || null;
    if (edit.visibility !== undefined) patch.visibility = edit.visibility;
    if (edit.showCity !== undefined) patch.show_city = edit.showCity;

    const { data, error } = await this.client
      .from('profiles')
      .update(patch)
      .eq('id', this.userId)
      .select('*')
      .single();

    if (error) {
      // Someone claimed the handle between the availability check and this
      // write. That is a race we cannot close from the client, only report.
      if (error.code === UNIQUE_VIOLATION) {
        throw toAppError(new Error('handle taken'), 'conflict');
      }
      throw toAppError(error, 'database');
    }

    return toOwn(data);
  }

  async byUsername(username: string): Promise<PublicProfile | null> {
    // The view applies the owner's visibility rule, so a hidden profile comes
    // back as no row — indistinguishable from one that does not exist, which
    // is the correct answer to give a stranger.
    const { data, error } = await this.client
      .from('public_profiles')
      .select('*')
      .eq('username', username.trim().toLowerCase())
      .maybeSingle();

    if (error) throw toAppError(error, 'database');
    return data ? toPublic(data) : null;
  }

  async search(query: string, limit = PROFILE_SEARCH_LIMIT): Promise<PublicProfile[]> {
    const key = handleKey(query);
    if (key.length < 2) return [];

    // Prefix match, so it rides `profiles_username_key_prefix_idx` rather than
    // scanning. `%` and `_` are stripped by handleKey, so the pattern cannot
    // be widened by what the user types.
    const { data, error } = await this.client
      .from('public_profiles')
      .select('*')
      .ilike('username', `${key}%`)
      .order('username', { ascending: true })
      .limit(Math.min(limit, PROFILE_SEARCH_LIMIT));

    if (error) throw toAppError(error, 'database');
    return (data ?? []).map(toPublic);
  }

  async checkHandle(candidate: string): Promise<HandleAvailability> {
    if (validateHandle(candidate) !== null) return 'invalid';

    const { data, error } = await this.client.rpc('username_available', {
      candidate: candidate.trim().toLowerCase(),
    });

    // Fail closed. Reporting "available" because the network hiccuped invites
    // the user to submit a handle that is about to be rejected.
    if (error) return 'invalid';
    return data ? 'available' : 'taken';
  }
}
