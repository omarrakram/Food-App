import { render } from '@/test-utils/render';
import { fromMajor } from '@/lib/format/money';

import { PriceTag } from '../price-tag';

/**
 * These assertions are the product rule made testable: an estimated price must
 * never be presented as a real one. `PriceTag` is the only component allowed
 * to render a price, so this is the single place that rule can be enforced.
 */
describe('PriceTag', () => {
  it('MARKS an estimate with ~ and the word Estimated', async () => {
    const view = await render(
      <PriceTag
        priced={{ money: fromMajor(126, 'EGP'), source: 'estimate' }}
        testID="price"
      />,
    );

    expect(view.getByTestId('price')).toHaveTextContent('~126 EGP');
    expect(view.getByText('Estimated')).toBeTruthy();
  });

  it('renders a live store price WITHOUT the estimate treatment', async () => {
    const view = await render(
      <PriceTag
        priced={{
          money: fromMajor(126, 'EGP'),
          source: 'live',
          storeName: 'Example Market',
        }}
        testID="price"
      />,
    );

    expect(view.getByTestId('price')).toHaveTextContent('126 EGP');
    expect(view.getByTestId('price')).not.toHaveTextContent('~');
    expect(view.queryByText('Estimated')).toBeNull();
    expect(view.getByText('Example Market')).toBeTruthy();
  });

  it('still prefixes an estimate at the small size, where the label is hidden', async () => {
    const view = await render(
      <PriceTag
        priced={{ money: fromMajor(80, 'EGP'), source: 'estimate' }}
        size="sm"
        testID="price"
      />,
    );

    // The word does not fit at this size, but the `~` is never dropped.
    expect(view.getByTestId('price')).toHaveTextContent('~80 EGP');
  });

  it('says so plainly when there is no price data', async () => {
    const view = await render(<PriceTag priced={null} testID="price" />);

    expect(view.getByTestId('price')).toHaveTextContent('Price estimate unavailable');
  });

  it('REFUSES to show a number when nothing could be priced', async () => {
    // The shopping-list bug: a salmon fillet we have no price for totalled
    // "~0 EGP", which reads as free rather than unknown.
    const view = await render(
      <PriceTag
        priced={{
          money: fromMajor(0, 'EGP'),
          source: 'estimate',
          completeness: 'unavailable',
          unpricedCount: 1,
        }}
        testID="price"
      />,
    );

    expect(view.getByTestId('price')).toHaveTextContent('Price estimate unavailable');
    expect(view.queryByText(/0 EGP/)).toBeNull();
  });

  it('marks a partial total as covering only the priced items', async () => {
    const view = await render(
      <PriceTag
        priced={{
          money: fromMajor(85, 'EGP'),
          source: 'estimate',
          completeness: 'partial',
          unpricedCount: 1,
        }}
        testID="price"
      />,
    );

    expect(view.getByTestId('price')).toHaveTextContent('~85 EGP');
    expect(view.getByTestId('price-partial')).toHaveTextContent('1 item has no estimate');
  });

  it('pluralises the unpriced-item note', async () => {
    const view = await render(
      <PriceTag
        priced={{
          money: fromMajor(85, 'EGP'),
          source: 'estimate',
          completeness: 'partial',
          unpricedCount: 3,
        }}
        testID="price"
      />,
    );

    expect(view.getByTestId('price-partial')).toHaveTextContent('3 items have no estimate');
  });

  it('exposes the estimate distinction to screen readers, not just visually', async () => {
    const view = await render(
      <PriceTag
        priced={{ money: fromMajor(126, 'EGP'), source: 'estimate' }}
        testID="price"
      />,
    );

    expect(view.getByLabelText('Estimated price: ~126 EGP')).toBeTruthy();
  });
});
