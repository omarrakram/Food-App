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
