import { demoMerchant, isDemoCatalogueAvailable } from '../merchant-selection';

/**
 * Which branch, and whether there is one at all.
 *
 * V1 has a single merchant, and that is precisely why this is explicit.
 * Everything that will eventually differ already differs per BRANCH —
 * catalogue, stock, delivery area, price, delivery fee, minimum order — so
 * threading "the merchant" through the app as an implicit global is cheap now
 * and expensive to unwind the day there are two.
 *
 * The DATABASE path is covered separately, in
 * `supabase-merchant-directory.test.ts`. This file is about the fallback, and
 * about the fallback never pretending to be a partner.
 */

describe('with the demo catalogue on', () => {
  it('offers the demo branch in Egypt', async () => {
    const selected = demoMerchant('EG');

    expect(selected).not.toBeNull();
    expect(selected?.isDemo).toBe(true);
    // The name, not the slug: `SelectedMerchant.merchant` is the CUSTOMER
    // -facing subset now, and a slug is not part of it on the public path.
    expect(selected?.merchant.name).toBe('AKALT Demo Market (development only)');
    // A BRANCH, not just a chain.
    // The branch's id is a derived uuid now (so the same row can exist in a
    // local database); its EXTERNAL id is the readable key the fixture uses.
    expect(selected?.location.externalId).toBe('demo-branch-1');
    expect(selected?.location.city).toBe('Cairo');
  });

  it('offers nothing outside Egypt', () => {
    // The demo catalogue is a Cairo branch. Offering it to somebody in London
    // would be a fixture pretending to be a delivery area.
    expect(demoMerchant('GB')).toBeNull();
    expect(demoMerchant('AE')).toBeNull();
    expect(isDemoCatalogueAvailable('GB')).toBe(false);
    expect(isDemoCatalogueAvailable('EG')).toBe(true);
  });

  it('carries the catalogue and the candidate lookup together', async () => {
    // A branch you cannot query is not a selection. Both arrive as one object
    // so no caller can hold a location without the catalogue behind it.
    const selected = demoMerchant('EG');
    expect(selected?.catalogue.merchantId).toBe(selected?.merchant.id);

    const index = await selected!.candidatesFor(['cream']);
    expect((index.get('cream') ?? []).length).toBeGreaterThan(0);
  });

  it('answers about several ingredients in one read', async () => {
    // The shape the sourcing hook depends on: one call per recipe, not one per
    // ingredient. A supermarket catalogue cannot be asked forty times.
    const selected = demoMerchant('EG');
    const index = await selected!.candidatesFor(['cream', 'rice', 'not-a-real-ingredient']);

    expect(index.has('not-a-real-ingredient')).toBe(false);
    expect(index.size).toBeGreaterThan(0);
  });

  it('never presents the demo branch as a real partner', () => {
    const selected = demoMerchant('EG');
    expect(selected?.merchant.isEnabled).toBe(false);
    expect(selected?.location.isAcceptingOrders).toBe(false);
    // Which is exactly why `isDemo` has to be read by every commerce screen:
    // the flags above say "not a partner", and only the badge says it to a
    // person.
    expect(selected?.isDemo).toBe(true);
  });
});
