import { isOrderingAvailable, selectMerchant } from '../merchant-selection';

/**
 * Which branch, and whether there is one at all.
 *
 * V1 has a single merchant, and that is precisely why this is explicit.
 * Everything that will eventually differ already differs per BRANCH —
 * catalogue, stock, delivery area, price, delivery fee, minimum order — so
 * threading "the merchant" through the app as an implicit global is cheap now
 * and expensive to unwind the day there are two.
 */

describe('with the demo catalogue on', () => {
  it('selects the demo branch in Egypt', () => {
    const selected = selectMerchant('EG');

    expect(selected).not.toBeNull();
    expect(selected?.isDemo).toBe(true);
    expect(selected?.merchant.slug).toBe('akalt-demo-market');
    // A BRANCH, not just a chain.
    expect(selected?.location.id).toBe('demo-location');
    expect(selected?.location.city).toBe('Cairo');
  });

  it('offers nothing outside Egypt', () => {
    // The demo catalogue is a Cairo branch. Offering it to somebody in London
    // would be a fixture pretending to be a delivery area.
    expect(selectMerchant('GB')).toBeNull();
    expect(selectMerchant('AE')).toBeNull();
    expect(isOrderingAvailable('GB')).toBe(false);
  });

  it('reports ordering as available where a branch exists', () => {
    expect(isOrderingAvailable('EG')).toBe(true);
  });

  it('carries the catalogue and the candidate lookup together', () => {
    // A branch you cannot query is not a selection. Both arrive as one object
    // so no caller can hold a location without the catalogue behind it.
    const selected = selectMerchant('EG');
    expect(selected?.catalogue.merchantId).toBe(selected?.merchant.id);
    expect(selected?.candidatesFor('cream').length).toBeGreaterThan(0);
  });

  it('never presents the demo branch as a real partner', () => {
    const selected = selectMerchant('EG');
    expect(selected?.merchant.isEnabled).toBe(false);
    expect(selected?.location.isAcceptingOrders).toBe(false);
    // Which is exactly why `isDemo` has to be read by every commerce screen:
    // the flags above say "not a partner", and only the badge says it to a
    // person.
    expect(selected?.isDemo).toBe(true);
  });
});
