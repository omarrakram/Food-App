import { fireEvent, render, screen } from '@/test-utils/render';

import { DemoBanner } from '../demo-banner';

/**
 * The one thing the preview cannot get wrong.
 *
 * A demo action must never be mistakable for a successful server action, and
 * this banner is what carries that. It was shrunk from a four-line card to a
 * single line because eight identical paragraphs is how a warning becomes
 * wallpaper — so these tests pin the parts that must survive the shrinking:
 * the words DEMO MODE are on screen WITHOUT expanding it, the consequence is
 * stated, and the full explanation is reachable.
 */

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

describe('the demo banner', () => {
  it('names itself before anybody taps anything', async () => {
    await render(<DemoBanner />);
    expect(screen.getByText(/DEMO MODE/)).toBeTruthy();
  });

  it('states the consequence in the collapsed line', async () => {
    // Not just a label — "stays on this device" is the part that stops
    // somebody believing a message went out.
    await render(<DemoBanner />);
    expect(screen.getByText(/stay on this device|stays on this device/i)).toBeTruthy();
  });

  it('keeps the full explanation one tap away', async () => {
    const view = await render(<DemoBanner />);
    expect(screen.queryByTestId('demo-banner-detail')).toBeNull();

    fireEvent.press(view.getByTestId('demo-banner'));

    // `findBy` rather than `getBy`: expanding is a state update, and RNTL's
    // render is asynchronous, so the tree has not settled by the next line.
    expect(await screen.findByTestId('demo-banner-detail')).toBeTruthy();
    expect(screen.getByText(/Nothing you do here reaches another person/)).toBeTruthy();
  });

  it('reads the whole warning to a screen reader without being expanded', async () => {
    // Collapsing is a visual economy. It must not cost anybody the warning.
    const view = await render(<DemoBanner />);
    const label = view.getByTestId('demo-banner').props.accessibilityLabel as string;
    expect(label).toMatch(/DEMO MODE/);
    expect(label).toMatch(/Nothing you do here reaches another person/);
  });
});
