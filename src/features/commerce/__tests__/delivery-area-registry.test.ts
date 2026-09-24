/**
 * NO DEMO DISTRICT REACHES A PRODUCTION CUSTOMER.
 *
 * `delivery_areas` carries demo rows and real ones in the same table, flagged
 * rather than separated, so that the demo branch's coverage is describable in
 * the same schema as a partner's. That makes the FILTER the guarantee, and a
 * filter is only a guarantee if something fails when it is removed.
 *
 * This file pins the production build: the flag is mocked off, and a demo row
 * coming back from the server must not reach the form.
 * `address-repository.test.ts` covers the other side, where the flag is on.
 */
jest.mock('@/lib/config/env', () => ({
  env: { useDemoMerchantCatalogue: false, isProduction: true },
}));

/* eslint-disable import/first --
 * `jest.mock` is hoisted above the imports by the transform, so it is written
 * above them too; the lint rule cannot see the hoist.
 */
import { SupabaseAddressRepository } from '../address-repository';

const area = (key: string, isDemo: boolean) => ({
  key,
  governorate: 'cairo',
  name_en: key,
  name_ar: key,
  is_demo: isDemo,
});

/** Only the calls the repository makes; anything else would fail loudly. */
function client(rows: readonly Record<string, unknown>[]) {
  const builder = {
    select: () => builder,
    order: () => Promise.resolve({ data: rows, error: null }),
    eq: () => builder,
  };
  return { from: () => builder } as any;
}

describe('with the demo catalogue off', () => {
  it('drops demo areas the server returned', async () => {
    const repository = new SupabaseAddressRepository(
      client([area('real-zamalek', false), area('demo-maadi', true)]),
      'user-1',
    );

    expect((await repository.listAreas()).map((entry) => entry.key)).toEqual(['real-zamalek']);
  });

  it('leaves a customer with no areas rather than demo ones', async () => {
    const repository = new SupabaseAddressRepository(
      client([area('demo-maadi', true), area('demo-degla', true)]),
      'user-1',
    );

    expect(await repository.listAreas()).toEqual([]);
  });
});
