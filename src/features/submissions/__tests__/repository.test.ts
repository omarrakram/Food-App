import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DemoSubmissionsRepository,
  LocalSubmissionsRepository,
} from '@/features/submissions/repository';
import { emptyDraft } from '@/features/submissions/validate';

/**
 * The two non-Supabase implementations.
 *
 * The local one is tested for what it REFUSES. A submission is a request to
 * publish to every user of the product; there is no offline version of that,
 * and a draft that looked saved and could never be sent would be worse than
 * being told to sign in.
 *
 * The demo one is tested as a state machine, because that is what the preview
 * is demonstrating. The assertions that matter are the ones where it refuses:
 * a refusal without feedback, and a decision on something not pending. If the
 * preview let either through it would be teaching the wrong thing about a
 * feature nobody can otherwise inspect.
 */

beforeEach(async () => {
  await AsyncStorage.clear();
});

function draft(title: string) {
  return { ...emptyDraft(), title };
}

describe('LocalSubmissionsRepository', () => {
  it('has nothing to show', async () => {
    const repository = new LocalSubmissionsRepository();
    expect(await repository.mine()).toEqual([]);
    expect(await repository.queue()).toEqual([]);
  });

  it('never claims the viewer can moderate', async () => {
    expect(await new LocalSubmissionsRepository().canModerate()).toBe(false);
  });

  it('refuses every write', async () => {
    const repository = new LocalSubmissionsRepository();
    await expect(repository.createDraft()).rejects.toThrow(/account/);
    await expect(repository.submit()).rejects.toThrow(/account/);
    await expect(repository.decide()).rejects.toThrow(/account/);
  });
});

describe('DemoSubmissionsRepository', () => {
  it('is never live', () => {
    expect(new DemoSubmissionsRepository().isLive).toBe(false);
  });

  it('shows the viewer their own submissions and nobody else’s', async () => {
    const repository = new DemoSubmissionsRepository();
    const mine = await repository.mine();

    // The seed contains one from another author, which belongs in the queue
    // and not in this list.
    expect(mine.every((entry) => entry.title !== 'Nour’s lemon roast chicken')).toBe(true);
    expect(mine.some((entry) => entry.title === 'Weeknight lentil soup')).toBe(true);
  });

  it('creates a draft that is not in the queue', async () => {
    const repository = new DemoSubmissionsRepository();
    const id = await repository.createDraft(draft('Test dish'));

    const mine = await repository.mine();
    expect(mine.find((entry) => entry.id === id)?.status).toBe('draft');

    const queued = await repository.queue();
    expect(queued.some((entry) => entry.submissionId === id)).toBe(false);
  });

  it('submitting is what puts it in front of somebody', async () => {
    const repository = new DemoSubmissionsRepository();
    const id = await repository.createDraft(draft('Test dish'));
    await repository.submit(id);

    const queued = await repository.queue();
    expect(queued.some((entry) => entry.submissionId === id)).toBe(true);
  });

  it('refuses to submit something already in the queue', async () => {
    const repository = new DemoSubmissionsRepository();
    const id = await repository.createDraft(draft('Test dish'));
    await repository.submit(id);
    await expect(repository.submit(id)).rejects.toThrow();
  });

  it('withdrawing takes it back out', async () => {
    const repository = new DemoSubmissionsRepository();
    const id = await repository.createDraft(draft('Test dish'));
    await repository.submit(id);
    await repository.withdraw(id);

    expect((await repository.queue()).some((entry) => entry.submissionId === id)).toBe(false);
    expect((await repository.mine()).find((entry) => entry.id === id)?.status).toBe('draft');
  });

  it('refuses a rejection with no reason', async () => {
    const repository = new DemoSubmissionsRepository();
    const id = await repository.createDraft(draft('Test dish'));
    await repository.submit(id);

    await expect(repository.decide(id, 'reject', null)).rejects.toThrow(/feedback/);
    await expect(repository.decide(id, 'request_changes', '   ')).rejects.toThrow(/feedback/);
  });

  it('approval needs no feedback, because there is nothing to act on', async () => {
    const repository = new DemoSubmissionsRepository();
    const id = await repository.createDraft(draft('Test dish'));
    await repository.submit(id);
    await repository.decide(id, 'approve', null);

    expect((await repository.mine()).find((entry) => entry.id === id)?.status).toBe('approved');
  });

  it('asking for changes sends the feedback back to the author', async () => {
    const repository = new DemoSubmissionsRepository();
    const id = await repository.createDraft(draft('Test dish'));
    await repository.submit(id);
    await repository.decide(id, 'request_changes', 'Add quantities.');

    const entry = (await repository.mine()).find((row) => row.id === id);
    expect(entry?.status).toBe('changes_requested');
    expect(entry?.authorNote).toBe('Add quantities.');
  });

  it('a resubmission after feedback is a new revision', async () => {
    const repository = new DemoSubmissionsRepository();
    const id = await repository.createDraft(draft('Test dish'));
    await repository.submit(id);
    await repository.decide(id, 'request_changes', 'Add quantities.');
    await repository.submit(id);

    const entry = (await repository.mine()).find((row) => row.id === id);
    expect(entry?.revision).toBe(2);
    expect(entry?.status).toBe('pending');
  });

  it('refuses a decision on something nobody submitted', async () => {
    const repository = new DemoSubmissionsRepository();
    const id = await repository.createDraft(draft('Test dish'));
    await expect(repository.decide(id, 'approve', null)).rejects.toThrow(/pending/);
  });

  it('records the history a reviewer reads, and no author does', async () => {
    const repository = new DemoSubmissionsRepository();
    const id = await repository.createDraft(draft('Test dish'));
    await repository.submit(id);
    await repository.decide(id, 'request_changes', 'Add quantities.');

    const history = await repository.history(id);
    expect(history.map((event) => event.action)).toEqual(['submit', 'request_changes']);
  });

  it('renders the submitted recipe so the reviewer sees what they are judging', async () => {
    const repository = new DemoSubmissionsRepository();
    const queued = await repository.queue();
    const first = queued[0]!;

    const recipe = await repository.submittedRecipe(first.recipeId);
    expect(recipe?.title).toBe(first.title);
    expect(recipe?.ingredients.length).toBeGreaterThan(0);
    expect(recipe?.steps.length).toBeGreaterThan(0);
  });
});
