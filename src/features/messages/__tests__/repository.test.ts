import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEMO_HASSAN, DEMO_NOUR, DEMO_OMAR, DEMO_VIEWER_ID } from '@/features/demo/people';
import {
  DemoMessagesRepository,
  LocalMessagesRepository,
} from '@/features/messages/repository';

/**
 * The two non-Supabase implementations.
 *
 * `LocalMessagesRepository` is tested for what it REFUSES, not for what it
 * returns: the one thing that must never happen is a send appearing to succeed
 * for a user who has no account and therefore no recipient.
 *
 * `DemoMessagesRepository` is tested as real behaviour, because that is what it
 * is — the preview has to demonstrate the product, not a cartoon of it. If
 * marking read did not clear the badge here, the preview would be showing
 * something the real app does not do.
 */

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('LocalMessagesRepository', () => {
  it('reads empty rather than inventing conversations', async () => {
    const repository = new LocalMessagesRepository();
    expect(await repository.conversations()).toEqual([]);
    expect(await repository.messages()).toEqual({ messages: [], nextCursor: null });
  });

  it('refuses every write, because a guest has nobody to send to', async () => {
    const repository = new LocalMessagesRepository();
    await expect(repository.send()).rejects.toThrow(/account/);
    await expect(repository.markRead()).rejects.toThrow(/account/);
    await expect(repository.startWith()).rejects.toThrow(/account/);
  });

  it('has no viewer, which is how a screen knows to ask for an account', () => {
    expect(new LocalMessagesRepository().viewerId).toBeNull();
  });

  it('never claims to be live', () => {
    expect(new LocalMessagesRepository().isLive).toBe(false);
  });
});

describe('DemoMessagesRepository', () => {
  it('is never live, however convincing the screens look', () => {
    expect(new DemoMessagesRepository().isLive).toBe(false);
  });

  it('lists seeded threads newest first', async () => {
    const repository = new DemoMessagesRepository();
    const conversations = await repository.conversations();

    expect(conversations.map((entry) => entry.partner.id)).toEqual([
      DEMO_HASSAN.id,
      DEMO_NOUR.id,
    ]);
  });

  it('shows a thread oldest-last, so a screen can reverse it once', async () => {
    const repository = new DemoMessagesRepository();
    const page = await repository.messages('demo-c1');

    // Newest first is what the real index can seek to; the hook reverses.
    expect(page.messages[0]?.createdAt.localeCompare(page.messages[1]?.createdAt ?? '')).toBe(1);
  });

  it('persists a send and moves the thread to the top of the list', async () => {
    const repository = new DemoMessagesRepository();
    await repository.send({ conversationId: 'demo-c1', body: 'On my way' });

    const page = await repository.messages('demo-c1');
    expect(page.messages[0]?.body).toBe('On my way');
    expect(page.messages[0]?.senderId).toBe(DEMO_VIEWER_ID);

    const conversations = await repository.conversations();
    expect(conversations[0]?.id).toBe('demo-c1');
    expect(conversations[0]?.lastMessagePreview).toBe('On my way');
  });

  it('leaves the preview empty when the message is only a shared recipe', async () => {
    const repository = new DemoMessagesRepository();
    await repository.send({ conversationId: 'demo-c1', body: '', sharedRecipeId: 'r-1' });

    const conversations = await repository.conversations();
    expect(conversations[0]?.lastMessagePreview).toBeNull();
  });

  it('clears the unread count when the thread is opened', async () => {
    const repository = new DemoMessagesRepository();
    const before = await repository.conversations();
    expect(before.find((entry) => entry.id === 'demo-c2')?.unread).toBeGreaterThan(0);

    await repository.markRead('demo-c2');

    const after = await repository.conversations();
    expect(after.find((entry) => entry.id === 'demo-c2')?.unread).toBe(0);
  });

  it('finds the existing thread rather than opening a second one', async () => {
    const repository = new DemoMessagesRepository();
    const first = await repository.startWith(DEMO_NOUR.id);
    const again = await repository.startWith(DEMO_NOUR.id);

    expect(again).toBe(first);
    expect((await repository.conversations()).length).toBe(2);
  });

  it('opens a thread with somebody new', async () => {
    const repository = new DemoMessagesRepository();
    const id = await repository.startWith(DEMO_OMAR.id);

    const conversations = await repository.conversations();
    expect(conversations.some((entry) => entry.id === id)).toBe(true);
  });

  it('refuses a person who is not in the demo cast', async () => {
    const repository = new DemoMessagesRepository();
    await expect(repository.startWith('someone-real')).rejects.toThrow();
  });

  it('carries a recipe share as a reference, never as copied content', async () => {
    const repository = new DemoMessagesRepository();
    const sent = await repository.send({
      conversationId: 'demo-c1',
      body: 'try this',
      sharedRecipeId: 'recipe-42',
    });

    expect(sent.sharedRecipeId).toBe('recipe-42');
    // No title, no image, no ingredient list travelled with it.
    expect(Object.keys(sent).sort()).toEqual([
      'body',
      'conversationId',
      'createdAt',
      'editedAt',
      'id',
      'senderId',
      'sharedRecipeId',
    ]);
  });
});
