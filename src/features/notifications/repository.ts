import { DEMO_LAYLA, DEMO_NOUR, demoPerson } from '@/features/demo/people';
import { getItem, setItem, StorageKeys } from '@/lib/storage';
import type { AppNotification } from '@/types/domain';

/**
 * Notifications.
 *
 * Read and mark-read only. There is no `create`, and that absence is the
 * design: every row is written by a database trigger on the table where the
 * event actually happened, and the table has no insert policy at all. A
 * repository method for creating one would be a method that always fails —
 * and an interface with one invites a caller to try.
 */

export interface NotificationsRepository {
  list(): Promise<AppNotification[]>;
  unreadCount(): Promise<number>;
  markAllRead(): Promise<void>;
  markRead(id: string): Promise<void>;
  readonly isLive: boolean;
}

/** A guest has no feed: nothing has happened to an account that does not exist. */
export class LocalNotificationsRepository implements NotificationsRepository {
  readonly isLive = false;

  async list(): Promise<AppNotification[]> {
    return [];
  }
  async unreadCount(): Promise<number> {
    return 0;
  }
  async markAllRead(): Promise<void> {}
  async markRead(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// Demo mode
// ---------------------------------------------------------------------------

function seedNotifications(): AppNotification[] {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

  return [
    {
      id: 'demo-n1',
      kind: 'recipe_shared',
      actor: DEMO_NOUR,
      subjectId: 'demo-c2',
      readAt: null,
      createdAt: at(30),
    },
    {
      id: 'demo-n2',
      kind: 'friend_request',
      actor: DEMO_LAYLA,
      subjectId: 'demo-req-in-1',
      readAt: null,
      createdAt: at(180),
    },
    {
      id: 'demo-n3',
      kind: 'submission_changes_requested',
      actor: null,
      subjectId: 'demo-sub-2',
      readAt: at(120),
      createdAt: at(2400),
    },
  ];
}

/**
 * Notifications against this device, for previewing the feed without a
 * backend.
 *
 * Reads and read-state are real; the rows are seeded rather than produced by
 * anything that happened, which is the one thing the banner on the screen has
 * to make unmistakable.
 */
export class DemoNotificationsRepository implements NotificationsRepository {
  readonly isLive = false;

  /**
   * The rows, seeded exactly once.
   *
   * THE BUG THIS FIXES: the seed's timestamps are relative to `Date.now()`,
   * and this used to return a FRESH seed on every call until something was
   * written. Two reads a millisecond apart therefore disagreed — the same
   * notification carried a different `createdAt` and `readAt` each time it was
   * looked at, so the feed's times shifted under the reader, and
   * `markAllRead` re-seeded before saving and stamped rows that were already
   * read with a new time.
   *
   * It surfaced as a test that failed roughly one run in six, which is the
   * tell: a time-dependent seed is not a flaky test, it is non-deterministic
   * data. Persisting on first read makes the first read the only one that
   * invents anything.
   */
  private async state(): Promise<AppNotification[]> {
    const stored = await getItem<AppNotification[]>(StorageKeys.demoNotifications);
    if (stored) return stored;
    const seeded = seedNotifications();
    await this.save(seeded);
    return seeded;
  }

  private async save(next: AppNotification[]): Promise<void> {
    await setItem(StorageKeys.demoNotifications, next);
  }

  async list(): Promise<AppNotification[]> {
    const rows = await this.state();
    return [...rows]
      .map((row) => ({ ...row, actor: row.actor ? (demoPerson(row.actor.id) ?? row.actor) : null }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async unreadCount(): Promise<number> {
    return (await this.state()).filter((row) => row.readAt === null).length;
  }

  async markAllRead(): Promise<void> {
    const now = new Date().toISOString();
    await this.save((await this.state()).map((row) => ({ ...row, readAt: row.readAt ?? now })));
  }

  async markRead(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.save(
      (await this.state()).map((row) =>
        row.id === id ? { ...row, readAt: row.readAt ?? now } : row,
      ),
    );
  }
}
