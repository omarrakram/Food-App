import { render } from '@/test-utils/render';

import { EmptyState, ErrorState } from '../states';

describe('EmptyState', () => {
  it('renders the title, body and action', async () => {
    const onPress = jest.fn();
    const view = await render(
      <EmptyState
        icon="cart-outline"
        title="Your shopping list is empty"
        body="Add missing ingredients from any recipe."
        action={{ label: 'Add item', onPress }}
        testID="empty"
      />,
    );

    expect(view.getByText('Your shopping list is empty')).toBeTruthy();
    expect(view.getByText('Add missing ingredients from any recipe.')).toBeTruthy();
    expect(view.getByText('Add item')).toBeTruthy();
  });

  it('exposes title and body together to screen readers', async () => {
    const view = await render(
      <EmptyState icon="cart-outline" title="Nothing here" body="Try adding one." />,
    );

    // Read as one announcement rather than two disconnected fragments.
    expect(view.getByLabelText('Nothing here. Try adding one.')).toBeTruthy();
  });

  it('renders without an action', async () => {
    const view = await render(<EmptyState icon="cart-outline" title="Nothing here" />);
    expect(view.getByText('Nothing here')).toBeTruthy();
  });
});

describe('ErrorState', () => {
  it('renders a retry action', async () => {
    const onPress = jest.fn();
    const view = await render(
      <ErrorState
        title="You are offline"
        body="Check your connection."
        action={{ label: 'Try again', onPress }}
      />,
    );

    expect(view.getByText('You are offline')).toBeTruthy();
    expect(view.getByText('Try again')).toBeTruthy();
  });

  it('defaults to an offline icon when none is given', async () => {
    const view = await render(<ErrorState title="Something went wrong" />);
    expect(view.getByText('Something went wrong')).toBeTruthy();
  });
});
