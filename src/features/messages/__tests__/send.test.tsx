import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { RepositoryProvider } from '@/features/data/repositories';
import { useSendMessage } from '@/features/messages/hooks';
import {
  LocalMessagesRepository,
  type MessagesRepository,
  type SendMessageInput,
} from '@/features/messages/repository';
import type { Message } from '@/types/domain';

/**
 * Optimistic sending, and what happens when the send does not land.
 *
 * THE BUG THIS PREVENTS is the one an optimistic UI invites: the placeholder
 * is written into the React Query cache, the next refetch replaces that cache
 * with the server's version, and a message that failed to send quietly
 * disappears from the thread. The user watched it appear and has no reason to
 * think it did not arrive.
 *
 * The outbox therefore lives beside the query cache, not inside it, and these
 * tests assert exactly that: a failed message survives, carries `failed`, and
 * can be retried.
 */

class RejectingMessages extends LocalMessagesRepository implements MessagesRepository {
  attempts = 0;
  /** Flip to let the next attempt through, so a retry can be observed. */
  shouldFail = true;

  override async send(input: SendMessageInput): Promise<Message> {
    this.attempts += 1;
    if (this.shouldFail) throw new Error('offline');
    return {
      id: `server-${this.attempts}`,
      conversationId: input.conversationId,
      senderId: 'me',
      body: input.body,
      sharedRecipeId: input.sharedRecipeId ?? null,
      createdAt: new Date().toISOString(),
      editedAt: null,
      delivery: 'sent',
    };
  }
}

let repository: RejectingMessages;

/**
 * Drives the hook the way a screen does — through presses, not by reaching
 * into its return value. The outbox is rendered, so what the assertions see is
 * what a user would see.
 */
function Probe() {
  const { send, retry, outbox } = useSendMessage('c-1');

  return (
    <View>
      <Pressable testID="send" onPress={() => send('On my way')}>
        <Text>send</Text>
      </Pressable>
      <Pressable testID="retry" onPress={() => outbox[0] && retry(outbox[0].id)}>
        <Text>retry</Text>
      </Pressable>
      <Text testID="outbox-ids">{outbox.map((message) => message.id).join(',')}</Text>
      {outbox.map((message) => (
        <Text key={message.id} testID={`outbox-${message.delivery}`}>
          {message.body}
        </Text>
      ))}
    </View>
  );
}

beforeEach(() => {
  repository = new RejectingMessages();
});

/**
 * `RepositoryProvider` builds the guest repositories itself, so the failing one
 * is injected through `remote` — the same door the Supabase bridge uses.
 */
function providers(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <RepositoryProvider
        userId="me"
        remote={
          {
            messages: repository,
          } as never
        }
      >
        {children}
      </RepositoryProvider>
    </QueryClientProvider>
  );
}

describe('useSendMessage', () => {
  it('keeps a failed message in the thread, marked as not sent', async () => {
    await render(providers(<Probe />));

    await act(async () => {
      fireEvent.press(screen.getByTestId('send'));
    });

    expect(screen.getByTestId('outbox-failed')).toBeTruthy();
    expect(screen.getByText('On my way')).toBeTruthy();
  });

  it('clears the placeholder once the server actually has it', async () => {
    repository.shouldFail = false;
    await render(providers(<Probe />));

    await act(async () => {
      fireEvent.press(screen.getByTestId('send'));
    });

    // Nothing left in the outbox: the refetch is now the source of truth, and
    // leaving the placeholder would show the message twice.
    expect(screen.queryByText('On my way')).toBeNull();
  });

  it('retries a failed message rather than asking the user to retype it', async () => {
    await render(providers(<Probe />));

    await act(async () => {
      fireEvent.press(screen.getByTestId('send'));
    });
    expect(repository.attempts).toBe(1);

    repository.shouldFail = false;
    await act(async () => {
      fireEvent.press(screen.getByTestId('retry'));
    });

    expect(repository.attempts).toBe(2);
    expect(screen.queryByText('On my way')).toBeNull();
  });

  it('gives the placeholder an id nothing can mistake for a server id', async () => {
    await render(providers(<Probe />));

    await act(async () => {
      fireEvent.press(screen.getByTestId('send'));
    });

    expect(screen.getByTestId('outbox-ids').props.children).toMatch(/^pending-/);
  });
});
