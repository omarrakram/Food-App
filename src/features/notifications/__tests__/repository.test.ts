import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DemoNotificationsRepository,
  LocalNotificationsRepository,
} from '@/features/notifications/repository';

/**
 * The feed, on this device.
 *
 * There is no `create` on either implementation, and the tests below check
 * that the interface itself has no way in: every row in production comes from
 * a database trigger, and `notifications` has no insert policy. A repository
 * method for writing one would be a method that always fails — and an
 * interface with one invites a caller to try, then a mock to make it work.
 */

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('LocalNotificationsRepository', () => {
  it('has an empty feed, because nothing has happened to an account that does not exist', async () => {
    const repository = new LocalNotificationsRepository();
    expect(await repository.list()).toEqual([]);
    expect(await repository.unreadCount()).toBe(0);
  });

  it('offers no way to write one', () => {
    const repository = new LocalNotificationsRepository();
    expect('create' in repository).toBe(false);
    expect('notify' in repository).toBe(false);
  });
});

describe('DemoNotificationsRepository', () => {
  it('is never live', () => {
    expect(new DemoNotificationsRepository().isLive).toBe(false);
  });

  it('lists newest first', async () => {
    const rows = await new DemoNotificationsRepository().list();
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]!.createdAt.localeCompare(rows[1]!.createdAt)).toBe(1);
  });

  it('counts only the unread ones', async () => {
    const repository = new DemoNotificationsRepository();
    const rows = await repository.list();
    const unread = rows.filter((row) => row.readAt === null).length;
    expect(await repository.unreadCount()).toBe(unread);
    expect(unread).toBeGreaterThan(0);
  });

  it('marking one read leaves the others alone', async () => {
    const repository = new DemoNotificationsRepository();
    const before = await repository.unreadCount();
    const first = (await repository.list()).find((row) => row.readAt === null)!;

    await repository.markRead(first.id);
    expect(await repository.unreadCount()).toBe(before - 1);
  });

  it('marking all read clears the badge', async () => {
    const repository = new DemoNotificationsRepository();
    await repository.markAllRead();
    expect(await repository.unreadCount()).toBe(0);
  });

  it('does not re-stamp something already read', async () => {
    const repository = new DemoNotificationsRepository();
    const read = (await repository.list()).find((row) => row.readAt !== null)!;
    const stamp = read.readAt;

    await repository.markAllRead();
    const after = (await repository.list()).find((row) => row.id === read.id);
    expect(after?.readAt).toBe(stamp);
  });

  it('carries a subject id rather than a copy of what happened', async () => {
    // The whole design: a notification points at a conversation or a
    // submission, and the row looks it up. A copied message body would
    // outlive the message being deleted.
    const rows = await new DemoNotificationsRepository().list();
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        'actor',
        'createdAt',
        'id',
        'kind',
        'readAt',
        'subjectId',
      ]);
    }
  });

  it('allows an actor-less notification, for things nobody did', async () => {
    const rows = await new DemoNotificationsRepository().list();
    expect(rows.some((row) => row.actor === null)).toBe(true);
  });
});
