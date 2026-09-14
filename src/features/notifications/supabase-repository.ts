import type { SupabaseClient } from '@supabase/supabase-js';

import { toAppError } from '@/lib/errors';
import type { Database, PublicProfileRow } from '@/lib/supabase/database.types';
import type { AppNotification, CountryCode, PublicProfile } from '@/types/domain';

import type { NotificationsRepository } from './repository';

/**
 * Notifications, against the database.
 *
 * Actors are resolved through `public_profiles`, never `profiles` — rendering
 * a person must not be a route to their private columns, and a notification
 * row renders a person.
 *
 * There is no `create`. Rows are written by triggers running as definer on the
 * tables where the events happen, and `notifications` has no insert policy, so
 * a client cannot put anything in anybody's feed — including its own.
 */

/** One screenful and then some. The feed is not a place people scroll far. */
const PAGE = 50;

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

export class SupabaseNotificationsRepository implements NotificationsRepository {
  readonly isLive = true;

  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async list(): Promise<AppNotification[]> {
    try {
      const { data, error } = await this.client
        .from('notifications')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(PAGE);
      if (error) throw error;

      const rows = data ?? [];
      const actorIds = [...new Set(rows.map((row) => row.actor_id).filter(Boolean))] as string[];

      const actors = new Map<string, PublicProfile>();
      if (actorIds.length > 0) {
        const { data: profiles, error: profileError } = await this.client
          .from('public_profiles')
          .select('*')
          .in('id', actorIds);
        if (profileError) throw profileError;
        for (const profile of profiles ?? []) {
          actors.set(profile.id, toPublic(profile as PublicProfileRow));
        }
      }

      return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        // Null when the actor has deleted their account or hidden their
        // profile. The row still renders — "a recipe was shared with you" is
        // useful without a name attached.
        actor: row.actor_id ? (actors.get(row.actor_id) ?? null) : null,
        subjectId: row.subject_id,
        readAt: row.read_at,
        createdAt: row.created_at,
      }));
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  async unreadCount(): Promise<number> {
    try {
      const { data, error } = await this.client.rpc('unread_notification_count');
      if (error) throw error;
      return data ?? 0;
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  async markAllRead(): Promise<void> {
    try {
      const { error } = await this.client.rpc('mark_all_notifications_read');
      if (error) throw error;
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  async markRead(id: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        // Redundant with the policy, and kept anyway: the policy is the
        // boundary, this is what makes the statement mean what it says.
        .eq('user_id', this.userId);
      if (error) throw error;
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }
}
