import type { SupabaseClient } from '@supabase/supabase-js';

import { toAppError } from '@/lib/errors';
import type { Database, PublicProfileRow } from '@/lib/supabase/database.types';
import type {
  Conversation,
  CountryCode,
  Message,
  MessagePage,
  PublicProfile,
} from '@/types/domain';

import type { MessagesRepository, SendMessageInput } from './repository';

/**
 * Messaging, against the database.
 *
 * Three shapes carried over from `SupabaseFriendsRepository`, for the same
 * reasons.
 *
 * **Profiles come from `public_profiles`, never from `profiles`.** Rendering a
 * person must not be a route to their private columns, and a chat header is
 * rendering a person.
 *
 * **The server-side functions are used rather than reimplemented.**
 * `start_conversation()` is the only way a thread is created: it refuses a
 * self-conversation, refuses a blocked pair, and does the find-or-create
 * atomically. `unread_counts()` derives each member's unread from their own
 * `last_read_at`, so the number cannot drift out of step with the messages.
 * Doing either client-side would be a second implementation to keep in step
 * and a policy to get wrong.
 *
 * **Paging is keyset, not offset.** A thread grows at the end while you scroll
 * back through it, and `range()` would show a message twice or skip one.
 */

/** One screenful of history. The thread index is ordered to match. */
export const MESSAGE_PAGE_SIZE = 30;

type MessageRow = Database['public']['Tables']['messages']['Row'];

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

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    sharedRecipeId: row.shared_recipe_id,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    delivery: 'sent',
  };
}

/**
 * The cursor is the row's own ordering key.
 *
 * `messages_thread_idx` is `(conversation_id, created_at desc, id desc)`, so
 * `created_at|id` is exactly what the index can seek to. Encoded rather than
 * exposed so a caller cannot hand-build one that skips the filter.
 */
export function encodeCursor(message: Pick<Message, 'createdAt' | 'id'>): string {
  return `${message.createdAt}|${message.id}`;
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  const separator = cursor.lastIndexOf('|');
  if (separator <= 0) return null;
  const createdAt = cursor.slice(0, separator);
  const id = cursor.slice(separator + 1);
  return createdAt && id ? { createdAt, id } : null;
}

/**
 * "Strictly older than this row", as PostgREST expresses it.
 *
 * The tiebreak on `id` is what makes the page boundary total: two messages can
 * share a `created_at` to the microsecond, and without it one of them is
 * skipped or repeated at every page edge. The shape matches
 * `messages_thread_idx` exactly, so this seeks rather than scans.
 */
export function keysetFilter(cursor: { createdAt: string; id: string }): string {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

export class SupabaseMessagesRepository implements MessagesRepository {
  readonly isLive = true;

  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  get viewerId(): string {
    return this.userId;
  }

  async conversations(): Promise<Conversation[]> {
    try {
      // Every conversation the viewer is in. RLS already restricts this to
      // their own; the filter is belt and braces, not the security boundary.
      const { data: memberships, error: membershipError } = await this.client
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', this.userId);
      if (membershipError) throw membershipError;

      const ids = (memberships ?? []).map((row) => row.conversation_id);
      if (ids.length === 0) return [];

      const [conversations, partners, unread] = await Promise.all([
        this.client
          .from('conversations')
          .select('id, last_message_at, last_message_body')
          .in('id', ids)
          .order('last_message_at', { ascending: false, nullsFirst: false }),
        this.client
          .from('conversation_members')
          .select('conversation_id, user_id')
          .in('conversation_id', ids)
          .neq('user_id', this.userId),
        this.client.rpc('unread_counts'),
      ]);

      if (conversations.error) throw conversations.error;
      if (partners.error) throw partners.error;
      if (unread.error) throw unread.error;

      const partnerIdByConversation = new Map(
        (partners.data ?? []).map((row) => [row.conversation_id, row.user_id]),
      );
      const unreadByConversation = new Map(
        (unread.data ?? []).map((row) => [row.conversation_id, row.unread]),
      );

      const profiles = await this.profilesById([...new Set(partnerIdByConversation.values())]);

      return (conversations.data ?? []).flatMap((row) => {
        const partnerId = partnerIdByConversation.get(row.id);
        const partner = partnerId ? profiles.get(partnerId) : undefined;
        // The other party may have deleted their account or blocked the
        // viewer between queries. A thread with nobody in it is dropped
        // rather than rendered as a nameless row.
        if (!partner) return [];
        return [
          {
            id: row.id,
            partner,
            lastMessageAt: row.last_message_at,
            lastMessagePreview: row.last_message_body,
            unread: unreadByConversation.get(row.id) ?? 0,
          },
        ];
      });
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  async messages(conversationId: string, cursor?: string | null): Promise<MessagePage> {
    try {
      let query = this.client
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE + 1);

      const decoded = cursor ? decodeCursor(cursor) : null;
      if (decoded) query = query.or(keysetFilter(decoded));

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []).map(toMessage);
      const hasMore = rows.length > MESSAGE_PAGE_SIZE;
      const page = hasMore ? rows.slice(0, MESSAGE_PAGE_SIZE) : rows;
      const last = page[page.length - 1];
      return { messages: page, nextCursor: hasMore && last ? encodeCursor(last) : null };
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  async send(input: SendMessageInput): Promise<Message> {
    try {
      const { data, error } = await this.client
        .from('messages')
        .insert({
          conversation_id: input.conversationId,
          // Set explicitly AND checked by policy. The policy is what makes it
          // true; this is what makes the insert valid.
          sender_id: this.userId,
          body: input.body,
          shared_recipe_id: input.sharedRecipeId ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return toMessage(data);
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  async markRead(conversationId: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('conversation_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', this.userId);
      if (error) throw error;
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  async startWith(userId: string): Promise<string> {
    try {
      const { data, error } = await this.client.rpc('start_conversation', { partner: userId });
      if (error) throw error;
      if (!data) throw new Error('cannot start that conversation');
      return data;
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  private async profilesById(ids: string[]): Promise<Map<string, PublicProfile>> {
    if (ids.length === 0) return new Map();
    const { data, error } = await this.client.from('public_profiles').select('*').in('id', ids);
    if (error) throw error;
    return new Map((data ?? []).map((row) => [row.id, toPublic(row as PublicProfileRow)]));
  }
}
