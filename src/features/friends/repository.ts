import {
  DEMO_HASSAN,
  DEMO_LAYLA,
  DEMO_NOUR,
  DEMO_OMAR,
  demoPerson,
} from '@/features/demo/people';
import { getItem, setItem, StorageKeys } from '@/lib/storage';
import type { Friend, FriendRequest, PublicProfile } from '@/types/domain';

/**
 * Friends.
 *
 * The interface is deliberately verb-shaped — `send`, `accept`, `decline`,
 * `cancel`, `unfriend`, `block` — rather than exposing rows to be edited. Every
 * one of those verbs is a rule the database enforces, and a `update(row)`
 * shaped API would invite a caller to try expressing "accept" as a status
 * write, which the policies refuse for good reason.
 *
 * There is no local implementation with real behaviour. Friendship is a
 * relationship between two accounts, and there is no honest offline version of
 * it: a guest has nobody to be friends with, and pretending otherwise would
 * mean a friend list that vanishes on sign-in.
 *
 * `DemoFriendsRepository` is the one exception, and it is not a local mode: it
 * exists so the hosted preview can SHOW the friends screens, it is reachable
 * only behind `EXPO_PUBLIC_DEMO_MODE`, and every screen it feeds says so.
 */

export interface FriendsRepository {
  /** Accepted friends. */
  list(): Promise<Friend[]>;
  /** Requests waiting on the viewer. */
  incoming(): Promise<FriendRequest[]>;
  /** Requests the viewer has sent and nobody has answered. */
  outgoing(): Promise<FriendRequest[]>;
  send(userId: string): Promise<void>;
  accept(requestId: string): Promise<void>;
  decline(requestId: string): Promise<void>;
  cancel(requestId: string): Promise<void>;
  unfriend(userId: string): Promise<void>;
  block(userId: string): Promise<void>;
  unblock(userId: string): Promise<void>;
  /** Profiles the viewer has blocked. */
  blocked(): Promise<PublicProfile[]>;
}

/**
 * The signed-out implementation: nothing, honestly.
 *
 * Every read is empty and every write refuses. A guest tapping "Add friend"
 * gets an error that says they need an account, which is true, rather than a
 * request that appears to send and reaches nobody.
 */
export class LocalFriendsRepository implements FriendsRepository {
  async list(): Promise<Friend[]> {
    return [];
  }
  async incoming(): Promise<FriendRequest[]> {
    return [];
  }
  async outgoing(): Promise<FriendRequest[]> {
    return [];
  }
  async blocked(): Promise<PublicProfile[]> {
    return [];
  }
  async send(): Promise<void> {
    throw new Error('friends need an account');
  }
  async accept(): Promise<void> {
    throw new Error('friends need an account');
  }
  async decline(): Promise<void> {
    throw new Error('friends need an account');
  }
  async cancel(): Promise<void> {
    throw new Error('friends need an account');
  }
  async unfriend(): Promise<void> {
    throw new Error('friends need an account');
  }
  async block(): Promise<void> {
    throw new Error('friends need an account');
  }
  async unblock(): Promise<void> {
    throw new Error('friends need an account');
  }
}

// ---------------------------------------------------------------------------
// Demo mode
// ---------------------------------------------------------------------------

type DemoFriendsState = {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  blocked: PublicProfile[];
};

function seedFriends(): DemoFriendsState {
  return {
    friends: [
      { person: DEMO_NOUR, friendsSince: '2026-04-18T09:00:00.000Z' },
      { person: DEMO_HASSAN, friendsSince: '2026-06-02T09:00:00.000Z' },
    ],
    // One waiting on the viewer and one waiting on somebody else, so both
    // tabs have something to look at and the buttons differ between them.
    incoming: [
      {
        id: 'demo-req-in-1',
        direction: 'incoming',
        person: DEMO_LAYLA,
        status: 'pending',
        createdAt: '2026-09-10T18:20:00.000Z',
        respondedAt: null,
      },
    ],
    outgoing: [
      {
        id: 'demo-req-out-1',
        direction: 'outgoing',
        person: DEMO_OMAR,
        status: 'pending',
        createdAt: '2026-09-12T11:05:00.000Z',
        respondedAt: null,
      },
    ],
    blocked: [],
  };
}

/**
 * Friends against this device, for previewing the screens without a backend.
 *
 * The verbs do what they say — accepting moves a request into the friend list,
 * blocking removes the friendship AND stops a conversation being started — so
 * the preview demonstrates the real behaviour rather than a mock of it. What
 * it does not do is talk to anybody: `isLive` is false wherever it is wired
 * in, and the screens badge themselves accordingly.
 */
export class DemoFriendsRepository implements FriendsRepository {
  private async state(): Promise<DemoFriendsState> {
    return (await getItem<DemoFriendsState>(StorageKeys.demoFriends)) ?? seedFriends();
  }

  private async save(next: DemoFriendsState): Promise<void> {
    await setItem(StorageKeys.demoFriends, next);
  }

  async list(): Promise<Friend[]> {
    return (await this.state()).friends;
  }

  async incoming(): Promise<FriendRequest[]> {
    return (await this.state()).incoming;
  }

  async outgoing(): Promise<FriendRequest[]> {
    return (await this.state()).outgoing;
  }

  async blocked(): Promise<PublicProfile[]> {
    return (await this.state()).blocked;
  }

  async send(userId: string): Promise<void> {
    const person = demoPerson(userId);
    if (!person) throw new Error('no such person in demo mode');
    const state = await this.state();
    if (state.blocked.some((entry) => entry.id === userId)) {
      throw new Error('cannot send that request');
    }
    if (state.outgoing.some((entry) => entry.person.id === userId)) return;
    await this.save({
      ...state,
      outgoing: [
        ...state.outgoing,
        {
          id: `demo-req-out-${userId}`,
          direction: 'outgoing',
          person,
          status: 'pending',
          createdAt: new Date().toISOString(),
          respondedAt: null,
        },
      ],
    });
  }

  async accept(requestId: string): Promise<void> {
    const state = await this.state();
    const request = state.incoming.find((entry) => entry.id === requestId);
    if (!request) return;
    await this.save({
      ...state,
      incoming: state.incoming.filter((entry) => entry.id !== requestId),
      friends: [...state.friends, { person: request.person, friendsSince: new Date().toISOString() }],
    });
  }

  async decline(requestId: string): Promise<void> {
    const state = await this.state();
    await this.save({
      ...state,
      incoming: state.incoming.filter((entry) => entry.id !== requestId),
    });
  }

  async cancel(requestId: string): Promise<void> {
    const state = await this.state();
    await this.save({
      ...state,
      outgoing: state.outgoing.filter((entry) => entry.id !== requestId),
    });
  }

  async unfriend(userId: string): Promise<void> {
    const state = await this.state();
    await this.save({
      ...state,
      friends: state.friends.filter((entry) => entry.person.id !== userId),
    });
  }

  async block(userId: string): Promise<void> {
    const person = demoPerson(userId);
    if (!person) return;
    const state = await this.state();
    // Blocking is not just "remove from friends": it also withdraws requests
    // in both directions, which is what the database does and what makes the
    // preview an honest demonstration of it.
    await this.save({
      friends: state.friends.filter((entry) => entry.person.id !== userId),
      incoming: state.incoming.filter((entry) => entry.person.id !== userId),
      outgoing: state.outgoing.filter((entry) => entry.person.id !== userId),
      blocked: [...state.blocked, person],
    });
  }

  async unblock(userId: string): Promise<void> {
    const state = await this.state();
    await this.save({
      ...state,
      blocked: state.blocked.filter((entry) => entry.id !== userId),
    });
  }
}
