import { DEMO_HASSAN, DEMO_NOUR, DEMO_VIEWER_ID, demoPerson } from '@/features/demo/people';
import { RECIPE_CATALOGUE } from '@/features/recipes/catalogue.generated';
import { getItem, setItem, StorageKeys } from '@/lib/storage';
import type { Conversation, Message, MessagePage } from '@/types/domain';

/**
 * Messaging.
 *
 * Verb-shaped like `FriendsRepository`, and for the same reason: every verb
 * here is a rule the database enforces. `start` is `start_conversation()`,
 * which refuses a pair where either has blocked the other; `markRead` writes
 * only the caller's own membership row. A `update(row)` API would invite a
 * caller to express those as column writes, which the policies refuse.
 *
 * THREE IMPLEMENTATIONS, AND THE DIFFERENCE MATTERS.
 *
 * `SupabaseMessagesRepository` is the real one.
 *
 * `LocalMessagesRepository` is what a signed-out user gets: empty reads, and
 * every write throws. A guest has nobody to message, and a send that appears
 * to succeed and reaches nobody is worse than an error saying they need an
 * account.
 *
 * `DemoMessagesRepository` exists so the hosted preview can be walked through
 * without a backend. It is real local storage with real behaviour, wired in
 * ONLY when `EXPO_PUBLIC_DEMO_MODE` is set, and every screen it feeds carries
 * a DEMO badge. It must never be reachable in production, and it must never
 * look like a successful server write.
 */

export type SendMessageInput = {
  conversationId: string;
  body: string;
  /** Sharing a recipe: the reference, never a copy of the content. */
  sharedRecipeId?: string | null;
};

export interface MessagesRepository {
  /** Threads the viewer is in, most recent first. */
  conversations(): Promise<Conversation[]>;
  /** One page of a thread, newest first. */
  messages(conversationId: string, cursor?: string | null): Promise<MessagePage>;
  send(input: SendMessageInput): Promise<Message>;
  /** Clears the viewer's own unread count. Never touches the other member's. */
  markRead(conversationId: string): Promise<void>;
  /** Finds or creates the thread with someone. Returns its id. */
  startWith(userId: string): Promise<string>;
  /** True when this implementation talks to a real backend. */
  readonly isLive: boolean;
  /**
   * Whose point of view the thread is rendered from.
   *
   * Lives here rather than being read from the auth session because demo mode
   * has a viewer and no session, and a screen that guessed would draw every
   * bubble on the wrong side.
   */
  readonly viewerId: string | null;
}

const NEEDS_ACCOUNT = 'messages need an account';

export class LocalMessagesRepository implements MessagesRepository {
  readonly isLive = false;
  readonly viewerId = null;

  async conversations(): Promise<Conversation[]> {
    return [];
  }
  async messages(_conversationId?: string, _cursor?: string | null): Promise<MessagePage> {
    return { messages: [], nextCursor: null };
  }
  async send(_input?: SendMessageInput): Promise<Message> {
    throw new Error(NEEDS_ACCOUNT);
  }
  async markRead(_conversationId?: string): Promise<void> {
    throw new Error(NEEDS_ACCOUNT);
  }
  async startWith(_userId?: string): Promise<string> {
    throw new Error(NEEDS_ACCOUNT);
  }
}

// ---------------------------------------------------------------------------
// Demo mode
// ---------------------------------------------------------------------------

const DEMO_KEY = StorageKeys.demoMessages;
const DEMO_PAGE = 20;

type DemoState = { conversations: Conversation[]; messages: Message[] };

/** The two people the viewer already has threads with. */
const DEMO_PARTNERS = [DEMO_NOUR, DEMO_HASSAN];

/**
 * A real recipe id for the seeded share, looked up rather than pasted.
 *
 * A hard-coded UUID here would silently rot the moment the catalogue was
 * regenerated, and the demo would show "this recipe is no longer available" as
 * its one example of recipe sharing.
 */
const DEMO_SHARED_RECIPE_ID =
  RECIPE_CATALOGUE.find((recipe) => recipe.slug === 'koshari')?.id ?? null;

function seed(): DemoState {
  const now = Date.now();
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

  const messages: Message[] = [
    {
      id: 'demo-m1',
      conversationId: 'demo-c1',
      senderId: DEMO_PARTNERS[0]!.id,
      body: 'What are you making tonight?',
      sharedRecipeId: null,
      createdAt: at(90),
      editedAt: null,
    },
    {
      id: 'demo-m2',
      conversationId: 'demo-c1',
      senderId: DEMO_VIEWER_ID,
      body: 'Something with the tomatoes before they go.',
      sharedRecipeId: null,
      createdAt: at(88),
      editedAt: null,
    },
    {
      id: 'demo-m3',
      conversationId: 'demo-c2',
      senderId: DEMO_PARTNERS[1]!.id,
      body: 'Try this one, it is quick.',
      sharedRecipeId: null,
      createdAt: at(31),
      editedAt: null,
    },
    // The preview has to be able to SHOW a shared recipe, not just describe
    // one, so the seeded thread contains one.
    {
      id: 'demo-m4',
      conversationId: 'demo-c2',
      senderId: DEMO_PARTNERS[1]!.id,
      body: '',
      sharedRecipeId: DEMO_SHARED_RECIPE_ID,
      createdAt: at(30),
      editedAt: null,
    },
  ];

  return {
    conversations: [
      {
        id: 'demo-c2',
        partner: DEMO_PARTNERS[1]!,
        lastMessageAt: at(30),
        // Null on purpose: the newest message in this thread is a shared
        // recipe with no words, and the row renders that as such.
        lastMessagePreview: null,
        unread: 2,
      },
      {
        id: 'demo-c1',
        partner: DEMO_PARTNERS[0]!,
        lastMessageAt: at(88),
        lastMessagePreview: 'Something with the tomatoes before they go.',
        unread: 0,
      },
    ],
    messages,
  };
}

/**
 * Messaging against this device, for previewing the screens without a backend.
 *
 * Everything it does is real — messages persist, unread counts clear,
 * pagination pages — but none of it leaves the device, and `isLive` is false
 * so the UI can say so. The one thing it must never do is resemble a
 * successful server write.
 */
export class DemoMessagesRepository implements MessagesRepository {
  readonly isLive = false;
  readonly viewerId = DEMO_VIEWER_ID;

  private async state(): Promise<DemoState> {
    return (await getItem<DemoState>(DEMO_KEY)) ?? seed();
  }

  private async save(next: DemoState): Promise<void> {
    await setItem(DEMO_KEY, next);
  }

  async conversations(): Promise<Conversation[]> {
    const state = await this.state();
    return [...state.conversations].sort((a, b) =>
      (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''),
    );
  }

  async messages(conversationId: string, cursor?: string | null): Promise<MessagePage> {
    const state = await this.state();
    const thread = state.messages
      .filter((message) => message.conversationId === conversationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const start = cursor ? thread.findIndex((message) => message.id === cursor) + 1 : 0;
    const page = thread.slice(start, start + DEMO_PAGE);
    const more = thread.length > start + DEMO_PAGE;
    return { messages: page, nextCursor: more ? (page[page.length - 1]?.id ?? null) : null };
  }

  async send(input: SendMessageInput): Promise<Message> {
    const state = await this.state();
    const message: Message = {
      id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      conversationId: input.conversationId,
      senderId: DEMO_VIEWER_ID,
      body: input.body,
      sharedRecipeId: input.sharedRecipeId ?? null,
      createdAt: new Date().toISOString(),
      editedAt: null,
    };

    await this.save({
      conversations: state.conversations.map((conversation) =>
        conversation.id === input.conversationId
          ? {
              ...conversation,
              lastMessageAt: message.createdAt,
              lastMessagePreview: input.sharedRecipeId ? null : input.body,
            }
          : conversation,
      ),
      messages: [...state.messages, message],
    });
    return message;
  }

  async markRead(conversationId: string): Promise<void> {
    const state = await this.state();
    await this.save({
      ...state,
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, unread: 0 } : conversation,
      ),
    });
  }

  async startWith(userId: string): Promise<string> {
    const state = await this.state();
    const existing = state.conversations.find(
      (conversation) => conversation.partner.id === userId,
    );
    if (existing) return existing.id;

    const partner = demoPerson(userId);
    if (!partner) throw new Error('no such person in demo mode');

    const id = `demo-c-${userId}`;
    await this.save({
      ...state,
      conversations: [
        { id, partner, lastMessageAt: null, lastMessagePreview: null, unread: 0 },
        ...state.conversations,
      ],
    });
    return id;
  }
}
