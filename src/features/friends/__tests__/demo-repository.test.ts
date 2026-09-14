import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEMO_LAYLA, DEMO_NOUR, DEMO_OMAR } from '@/features/demo/people';
import { DemoFriendsRepository, LocalFriendsRepository } from '@/features/friends/repository';

/**
 * The demo friends repository.
 *
 * Worth testing rather than waving through, for one reason: the preview is
 * currently the only place anybody can SEE these flows, so if blocking here
 * does something different from what the database does, the preview teaches
 * the wrong thing about the product. The block case below is the one that
 * matters — a block is not "remove from friends", it withdraws pending
 * requests in both directions too, exactly as `friends.sql` does.
 */

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('LocalFriendsRepository', () => {
  it('refuses every write, because a guest has nobody to befriend', async () => {
    const repository = new LocalFriendsRepository();
    await expect(repository.send()).rejects.toThrow(/account/);
    await expect(repository.accept()).rejects.toThrow(/account/);
    await expect(repository.block()).rejects.toThrow(/account/);
  });
});

describe('DemoFriendsRepository', () => {
  it('seeds both a request waiting on you and one waiting on them', async () => {
    const repository = new DemoFriendsRepository();
    expect((await repository.incoming()).map((r) => r.person.id)).toEqual([DEMO_LAYLA.id]);
    expect((await repository.outgoing()).map((r) => r.person.id)).toEqual([DEMO_OMAR.id]);
  });

  it('moves an accepted request into the friend list', async () => {
    const repository = new DemoFriendsRepository();
    await repository.accept('demo-req-in-1');

    expect(await repository.incoming()).toEqual([]);
    expect((await repository.list()).some((f) => f.person.id === DEMO_LAYLA.id)).toBe(true);
  });

  it('drops a declined request without befriending anybody', async () => {
    const repository = new DemoFriendsRepository();
    await repository.decline('demo-req-in-1');

    expect(await repository.incoming()).toEqual([]);
    expect((await repository.list()).some((f) => f.person.id === DEMO_LAYLA.id)).toBe(false);
  });

  it('withdraws a cancelled request', async () => {
    const repository = new DemoFriendsRepository();
    await repository.cancel('demo-req-out-1');
    expect(await repository.outgoing()).toEqual([]);
  });

  it('blocks in every direction at once, the way the database does', async () => {
    const repository = new DemoFriendsRepository();
    await repository.block(DEMO_NOUR.id);

    expect((await repository.list()).some((f) => f.person.id === DEMO_NOUR.id)).toBe(false);
    expect((await repository.blocked()).map((p) => p.id)).toEqual([DEMO_NOUR.id]);
  });

  it('refuses to send a request to somebody already blocked', async () => {
    const repository = new DemoFriendsRepository();
    await repository.block(DEMO_NOUR.id);
    await expect(repository.send(DEMO_NOUR.id)).rejects.toThrow();
  });

  it('unblocking restores nothing but the ability to ask again', async () => {
    const repository = new DemoFriendsRepository();
    await repository.block(DEMO_NOUR.id);
    await repository.unblock(DEMO_NOUR.id);

    expect(await repository.blocked()).toEqual([]);
    // Deliberately NOT re-friended: a block ends the friendship, and undoing
    // the block does not undo that.
    expect((await repository.list()).some((f) => f.person.id === DEMO_NOUR.id)).toBe(false);
  });

  it('does not open a second outgoing request to the same person', async () => {
    const repository = new DemoFriendsRepository();
    await repository.send(DEMO_LAYLA.id);
    await repository.send(DEMO_LAYLA.id);

    expect((await repository.outgoing()).filter((r) => r.person.id === DEMO_LAYLA.id)).toHaveLength(1);
  });
});
