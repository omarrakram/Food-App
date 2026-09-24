import {
  LocalOrderDraftRepository,
  ORDER_DRAFT_FAILURES,
  OrderDraftRefused,
  refusalFrom,
  SupabaseOrderDraftRepository,
  type OrderDraftFailure,
} from '../order-draft';

/**
 * THE CLIENT SIDE OF THE DRAFT.
 *
 * The database is the authority — `supabase/tests/10_checkout_test.sql` drives
 * `create_order_draft` directly — so what is tested here is the part the
 * database cannot check: that a refusal survives the trip back with its
 * meaning intact, that nothing is invented when it does not, and that the
 * totals the screen shows are the ones the SERVER wrote rather than the ones
 * the client asked for.
 */

const ROW = {
  id: 'order-1',
  reference: 'AKL-7KQ4-M2XR',
  currency: 'EGP',
  items_subtotal_minor: 24_500,
  delivery_fee_minor: 2_000,
  created_at: '2026-09-25T10:00:00.000Z',
};

type Outcome = { rpc: unknown; row?: unknown };

/**
 * A supabase-js shape, not a supabase-js mock.
 *
 * Only the two calls the repository makes are modelled. Anything else it
 * started doing would fail loudly here rather than pass against a stub that
 * answers everything.
 */
function client(outcome: Outcome) {
  const calls: { rpc: unknown[] } = { rpc: [] };
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: () =>
      Promise.resolve(
        outcome.row === undefined
          ? { data: ROW, error: null }
          : { data: null, error: outcome.row },
      ),
  };

  return {
    calls,
    supabase: {
      rpc: (name: string, args: unknown) => {
        calls.rpc.push({ name, args });
        return Promise.resolve(outcome.rpc);
      },
      from: () => builder,
    } as any,
  };
}

const REQUEST = {
  cartRevision: 7,
  addressId: 'addr-1',
  idempotencyKey: 'key-1',
  customerNote: null,
};

describe('refusalFrom', () => {
  it('reads the token out of a postgres message rather than matching the whole string', () => {
    expect(refusalFrom('below_minimum')).toBe('below_minimum');
    expect(refusalFrom('P0001: below_minimum')).toBe('below_minimum');
    expect(refusalFrom('new row violates ... stale_cart_revision ...')).toBe(
      'stale_cart_revision',
    );
  });

  it('falls back to unknown rather than guessing', () => {
    expect(refusalFrom('connection reset by peer')).toBe('unknown');
    expect(refusalFrom(null)).toBe('unknown');
    expect(refusalFrom('')).toBe('unknown');
  });

  // UNKNOWN IS NOT PERMISSIVE. Every named failure must map to itself, so a
  // refusal never degrades into "we could not tell, carry on".
  it.each(ORDER_DRAFT_FAILURES.filter((failure) => failure !== 'unknown'))(
    'maps %s to itself',
    (failure) => {
      expect(refusalFrom(failure)).toBe(failure as OrderDraftFailure);
    },
  );
});

describe('LocalOrderDraftRepository', () => {
  it('refuses: a guest has no account for an order to belong to', async () => {
    await expect(new LocalOrderDraftRepository().create()).rejects.toBeInstanceOf(
      OrderDraftRefused,
    );
    await expect(new LocalOrderDraftRepository().create()).rejects.toMatchObject({
      failure: 'not_authenticated',
    });
  });
});

describe('SupabaseOrderDraftRepository', () => {
  it('sends the revision, the address and the idempotency key — and no money', async () => {
    const { supabase, calls } = client({ rpc: { data: 'order-1', error: null } });
    await new SupabaseOrderDraftRepository(supabase, 'user-1').create(REQUEST);

    expect(calls.rpc).toEqual([
      {
        name: 'create_order_draft',
        args: {
          p_cart_revision: 7,
          p_address_id: 'addr-1',
          p_idempotency_key: 'key-1',
          p_customer_note: null,
        },
      },
    ]);

    // Nothing financial crosses the wire: no price, no total, no rate.
    const [{ args }] = calls.rpc as [{ args: Record<string, unknown> }];
    for (const key of Object.keys(args)) {
      expect(key).not.toMatch(/price|total|minor|commission|fee/i);
    }
  });

  it('returns the totals the SERVER wrote, not anything the client supplied', async () => {
    const { supabase } = client({ rpc: { data: 'order-1', error: null } });
    const draft = await new SupabaseOrderDraftRepository(supabase, 'user-1').create(REQUEST);

    expect(draft.reference).toBe('AKL-7KQ4-M2XR');
    expect(draft.itemsSubtotal).toEqual({ amountMinor: 24_500, currency: 'EGP' });
    expect(draft.deliveryFee).toEqual({ amountMinor: 2_000, currency: 'EGP' });
    expect(draft.total).toEqual({ amountMinor: 26_500, currency: 'EGP' });
  });

  it('turns a refusal into a named failure', async () => {
    const { supabase } = client({ rpc: { data: null, error: { message: 'below_minimum' } } });

    await expect(
      new SupabaseOrderDraftRepository(supabase, 'user-1').create(REQUEST),
    ).rejects.toMatchObject({ failure: 'below_minimum' });
  });

  it('refuses rather than inventing a draft when the rpc returns nothing', async () => {
    const { supabase } = client({ rpc: { data: null, error: null } });

    await expect(
      new SupabaseOrderDraftRepository(supabase, 'user-1').create(REQUEST),
    ).rejects.toMatchObject({ failure: 'unknown' });
  });
});
