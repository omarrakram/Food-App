import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { I18nProvider } from '@/i18n';
import { ThemeProvider } from '@/theme';

/**
 * THE CHAT COMPOSER'S HEIGHT.
 *
 * THE BUG THIS EXISTS FOR: the message composer opened roughly twice as tall
 * as the one line most messages need. A `multiline` TextInput is a `<textarea>`
 * on web, react-native-web sets its `rows` from `numberOfLines`, and nothing
 * passed one — so the browser applied its own default of two rows.
 *
 * `autoGrow` pins it to one row and measures the content instead. The clamp is
 * the part worth testing: without a ceiling the field grows until it pushes
 * Send off the bottom of a small phone, which is the one control the screen
 * exists for.
 */

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

function wrap(node: ReactNode) {
  return (
    <ThemeProvider>
      <I18nProvider>{node}</I18nProvider>
    </ThemeProvider>
  );
}

const BOUNDS = { min: 44, max: 132 };

afterEach(async () => {
  // One macrotask, so anything a component scheduled on its way out — a
  // press animation, a batched state notification — fires before Jest tears
  // the environment down and calls the pending timer a leak.
  await new Promise((resolve) => setTimeout(resolve, 0));
});


async function renderInput(props: Record<string, unknown> = {}) {
  await render(
    wrap(<Input value="" onChangeText={() => {}} multiline autoGrow={BOUNDS} testID="field" {...props} />),
  );
  return screen.findByTestId('field');
}

/**
 * What the platform reports when the text occupies `height` points.
 *
 * Awaited through `findByTestId`: `render` and state updates are asynchronous
 * in RNTL v14, so reading props straight after `fireEvent` reads the tree from
 * before the measurement landed.
 */
async function contentHeight(height: number) {
  fireEvent(screen.getByTestId('field'), 'contentSizeChange', {
    nativeEvent: { contentSize: { width: 300, height } },
  });
  return screen.findByTestId('field');
}

function heightOf(node: ReturnType<typeof screen.getByTestId>): number | undefined {
  const style = Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style.filter(Boolean)) : node.props.style;
  return style?.height;
}

describe('an auto-growing input', () => {
  it('asks for a single row rather than the browser default', async () => {
    const field = await renderInput();
    expect(field.props.rows).toBe(1);
  });

  it('never goes below one line, however small the content measures', async () => {
    await renderInput();
    expect(heightOf(await contentHeight(12))).toBe(BOUNDS.min);
  });

  it('grows with the text', async () => {
    await renderInput();
    expect(heightOf(await contentHeight(88))).toBe(88);
  });

  it('stops at the ceiling instead of pushing Send off the screen', async () => {
    await renderInput();
    expect(heightOf(await contentHeight(900))).toBe(BOUNDS.max);
  });

  it('scrolls inside itself only once it has stopped growing', async () => {
    await renderInput();
    expect((await contentHeight(88)).props.scrollEnabled).toBe(false);
    expect((await contentHeight(900)).props.scrollEnabled).toBe(true);
  });

  it('leaves an ordinary field alone', async () => {
    // No `autoGrow`, no measuring, no imposed height — every other Input in
    // the app keeps the behaviour it had.
    await render(wrap(<Input value="" onChangeText={() => {}} testID="plain" />));
    const plain = await screen.findByTestId('plain');
    expect(plain.props.rows).toBeUndefined();
    expect(heightOf(plain)).toBeUndefined();
  });
});
