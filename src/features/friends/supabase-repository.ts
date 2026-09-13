import type { SupabaseClient } from '@supabase/supabase-js';

import { toAppError } from '@/lib/errors';
import type { Database, PublicProfileRow } from '@/lib/supabase/database.types';
import type {
  CountryCode,
  Friend,
  FriendRequest,
  FriendRequestStatus,
  PublicProfile,
} from '@/types/domain';

import { friendshipKey } from './pair';
import type { FriendsRepository } from './repository';

/**
 * Friends, against the database.
 *
 * Two shapes recur and both are deliberate.
 *
 * **Profiles come from `public_profiles`, never from `profiles`.** A friend
 * list renders people, and rendering a person must not be a route to their
 * private data. The view is the only place the app reads somebody else from.
 *
 * **Two queries, not a join.** PostgREST can embed a related row, but only
 * across a declared foreign key — and `friend_requests.sender_id` points at
 * `profiles`, not at the view. Resolving ids and then fetching the profiles is
 * one extra round trip for a page of at most a few dozen rows, and it keeps
 * every profile read going through the view.
 */

/** A page of friends or requests. Friend lists are small, but not unbounded. */
export const FRIENDS_PAGE_SIZE = 100;

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

export class SupabaseFriendsRepository implements FriendsRepository {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  /**
   * Resolves ids to public profiles, in the order asked for.
   *
   * A profile can be missing — the other party may have gone private, blocked
   * the viewer, or deleted their account between the two queries. Those rows
   * are dropped rather than rendered as a blank card: a friend list with a
   * nameless entry looks broken, and there is nothing useful to show.
   */
  private async profilesFor(ids: readonly string[]): Promise<Map<string, PublicProfile>> {
    if (ids.length === 0) return new Map();

    const { data, error } = await this.client
      .from('public_profiles')
      .select('*')
      .in('id', [...new Set(ids)]);

    if (error) throw toAppError(error, 'database');
    return new Map((data ?? []).map((row) => [row.id, toPublic(row)]));
  }

  async list(): Promise<Friend[]> {
    const { data, error } = await this.client
      .from('friendships')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(FRIENDS_PAGE_SIZE);

    if (error) throw toAppError(error, 'database');

    const rows = data ?? [];
    // The row stores the pair ordered low-high, so which column holds the
    // friend depends on where the viewer's own id sorts.
    const otherId = (row: { user_low_id: string; user_high_id: string }) =>
      row.user_low_id === this.userId ? row.user_high_id : row.user_low_id;

    const profiles = await this.profilesFor(rows.map(otherId));

    return rows
      .map((row) => {
        const person = profiles.get(otherId(row));
        return person ? { person, friendsSince: row.created_at } : null;
      })
      .filter((entry): entry is Friend => entry !== null);
  }

  private async requests(direction: 'incoming' | 'outgoing'): Promise<FriendRequest[]> {
    const column = direction === 'incoming' ? 'recipient_id' : 'sender_id';
    const otherColumn = direction === 'incoming' ? 'sender_id' : 'recipient_id';

    const { data, error } = await this.client
      .from('friend_requests')
      .select('*')
      .eq(column, this.userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(FRIENDS_PAGE_SIZE);

    if (error) throw toAppError(error, 'database');

    const rows = data ?? [];
    const profiles = await this.profilesFor(rows.map((row) => row[otherColumn]));

    return rows
      .map((row) => {
        const person = profiles.get(row[otherColumn]);
        if (!person) return null;
        return {
          id: row.id,
          direction,
          person,
          status: row.status as FriendRequestStatus,
          createdAt: row.created_at,
          respondedAt: row.responded_at,
        } satisfies FriendRequest;
      })
      .filter((entry): entry is FriendRequest => entry !== null);
  }

  async incoming(): Promise<FriendRequest[]> {
    return this.requests('incoming');
  }

  async outgoing(): Promise<FriendRequest[]> {
    return this.requests('outgoing');
  }

  async send(userId: string): Promise<void> {
    const { error } = await this.client
      .from('friend_requests')
      .insert({ sender_id: this.userId, recipient_id: userId });

    // Every refusal here is a policy doing its job — blocked, already friends,
    // already asked — and the policy does not say which. Reporting a generic
    // conflict is honest; guessing would leak whether a block exists.
    if (error) throw toAppError(error, 'conflict');
  }

  async accept(requestId: string): Promise<void> {
    // The function, not an update: the status change and the friendship row
    // are one transaction, and a client cannot do that in two calls.
    const { error } = await this.client.rpc('accept_friend_request', {
      request_id: requestId,
    });
    if (error) throw toAppError(error, 'conflict');
  }

  private async respond(requestId: string, status: 'declined' | 'cancelled'): Promise<void> {
    const { error } = await this.client
      .from('friend_requests')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('status', 'pending');

    if (error) throw toAppError(error, 'conflict');
  }

  async decline(requestId: string): Promise<void> {
    await this.respond(requestId, 'declined');
  }

  async cancel(requestId: string): Promise<void> {
    await this.respond(requestId, 'cancelled');
  }

  async unfriend(userId: string): Promise<void> {
    // The ordering has to match how the row was written. A DELETE that matches
    // nothing does not fail, so getting this wrong makes "Remove friend"
    // appear to work and change nothing.
    const { low, high } = friendshipKey(this.userId, userId);

    const { error } = await this.client
      .from('friendships')
      .delete()
      .eq('user_low_id', low)
      .eq('user_high_id', high);

    if (error) throw toAppError(error, 'database');
  }

  async block(userId: string): Promise<void> {
    // Also removes the friendship and withdraws any request in flight. A block
    // that leaves those in place is not a block.
    const { error } = await this.client.rpc('block_user', { target: userId });
    if (error) throw toAppError(error, 'database');
  }

  async unblock(userId: string): Promise<void> {
    const { error } = await this.client
      .from('blocks')
      .delete()
      .eq('blocker_id', this.userId)
      .eq('blocked_id', userId);

    if (error) throw toAppError(error, 'database');
  }

  async blocked(): Promise<PublicProfile[]> {
    // Not `public_profiles`: that view hides a blocked person from the blocker
    // too, so reading the block list through it returns nothing and there is
    // no way to unblock anybody by name. `blocked_profiles()` is the narrow
    // definer exception — same columns, and it takes no argument, so it cannot
    // be pointed at somebody else's block list.
    const { data, error } = await this.client.rpc('blocked_profiles');
    if (error) throw toAppError(error, 'database');
    return (data ?? []).map(toPublic);
  }
}
