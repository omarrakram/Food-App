import { fireEvent, render } from '@/test-utils/render';
import type { Message } from '@/types/domain';

import { MessageBubble } from '../message-bubble';

/**
 * The bubble, and specifically the failure state.
 *
 * THE OUTCOME THIS EXISTS TO PREVENT: a send fails, the optimistic bubble
 * disappears, and the user — who watched their words appear — walks away
 * believing they were delivered. That is worse than an error, because there is
 * nothing on screen to correct it.
 *
 * So the assertions below are about what stays visible: "Not sent", a Retry
 * the user can press, and the words themselves still in the thread.
 */

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm-1',
    conversationId: 'c-1',
    senderId: 'me',
    body: 'On my way',
    sharedRecipeId: null,
    createdAt: '2026-09-14T10:00:00.000Z',
    editedAt: null,
    delivery: 'sent',
    ...overrides,
  };
}

// The shared-recipe card fetches through the repositories, which this render
// helper deliberately does not provide. Nothing here is about that card.
jest.mock('../shared-recipe-card', () => ({
  SharedRecipeCard: () => null,
}));

describe('MessageBubble', () => {
  it('shows the words', async () => {
    const view = await render(
      <MessageBubble message={makeMessage()} isMine showTime testID="bubble" />,
    );
    expect(view.getByText('On my way')).toBeTruthy();
  });

  it('says a failed message was not sent, and keeps the words on screen', async () => {
    const view = await render(
      <MessageBubble
        message={makeMessage({ delivery: 'failed' })}
        isMine
        showTime
        onRetry={jest.fn()}
        testID="bubble"
      />,
    );

    expect(view.getByText('Not sent')).toBeTruthy();
    // Still there. A failure must not swallow what the user typed.
    expect(view.getByText('On my way')).toBeTruthy();
  });

  it('offers a retry on a failed message', async () => {
    const onRetry = jest.fn();
    const view = await render(
      <MessageBubble
        message={makeMessage({ delivery: 'failed' })}
        isMine
        showTime
        onRetry={onRetry}
        testID="bubble"
      />,
    );

    fireEvent.press(view.getByTestId('bubble-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('never shows a timestamp on a message that has not arrived', async () => {
    // A time next to an undelivered message reads as "delivered at".
    const view = await render(
      <MessageBubble
        message={makeMessage({ delivery: 'sending' })}
        isMine
        showTime
        testID="bubble"
      />,
    );

    expect(view.getByText('Sending…')).toBeTruthy();
    expect(view.queryByText('Not sent')).toBeNull();
  });

  it('puts my messages on my side and theirs on theirs', async () => {
    const mine = await render(
      <MessageBubble message={makeMessage()} isMine showTime testID="mine" />,
    );
    expect(mine.getByTestId('mine').props.style.alignSelf).toBe('flex-end');

    const theirs = await render(
      <MessageBubble
        message={makeMessage({ senderId: 'them' })}
        isMine={false}
        showTime
        testID="theirs"
      />,
    );
    expect(theirs.getByTestId('theirs').props.style.alignSelf).toBe('flex-start');
  });
});
