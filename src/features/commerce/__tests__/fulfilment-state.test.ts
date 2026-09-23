import {
  ORDER_FULFILMENT_TRANSITIONS,
  TERMINAL_FULFILMENT_STATES,
  availableFulfilmentActions,
  canEnterMerchantQueue,
  checkFulfilmentTransition,
  isTerminalFulfilment,
  isVisibleToMerchant,
} from '../fulfilment-state';
import { ORDER_FULFILMENT_STATES, type OrderFulfilmentState } from '@/types/commerce';

/**
 * The fulfilment machine.
 *
 * These are not schema tests. Each one is a commercial rule that somebody will
 * eventually want to "just quickly" relax in a dashboard handler, and the
 * point of writing them down is that relaxing one has to be a deliberate edit
 * to a file called `fulfilment-state.ts` rather than a condition in a button.
 */

describe('the shape of the machine', () => {
  it('gives every non-terminal state somewhere to go', () => {
    // A state with no exits and no terminal marking is an order that is stuck
    // in a way nobody will notice until a customer asks where their food is.
    const stuck = ORDER_FULFILMENT_STATES.filter(
      (state) =>
        !isTerminalFulfilment(state) && ORDER_FULFILMENT_TRANSITIONS[state].length === 0,
    );

    expect(stuck).toEqual([]);
  });

  it('gives every terminal state no exits at all', () => {
    for (const state of TERMINAL_FULFILMENT_STATES) {
      expect(ORDER_FULFILMENT_TRANSITIONS[state]).toEqual([]);
    }
  });

  it('can reach every state from draft', () => {
    // Guards against a state that exists in the union, is handled in the UI,
    // and can never actually occur.
    const seen = new Set<OrderFulfilmentState>(['draft']);
    const queue: OrderFulfilmentState[] = ['draft'];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      for (const rule of ORDER_FULFILMENT_TRANSITIONS[current]) {
        if (!seen.has(rule.to)) {
          seen.add(rule.to);
          queue.push(rule.to);
        }
      }
    }

    const unreachable = ORDER_FULFILMENT_STATES.filter((state) => !seen.has(state));
    expect(unreachable).toEqual([]);
  });

  it('names an actor on every transition', () => {
    const actorless = ORDER_FULFILMENT_STATES.flatMap((state) =>
      ORDER_FULFILMENT_TRANSITIONS[state]
        .filter((rule) => rule.actors.length === 0)
        .map((rule) => `${state} -> ${rule.to}`),
    );

    expect(actorless).toEqual([]);
  });
});

describe('the merchant never sees an unpaid order', () => {
  it('keeps draft and pending out of the dashboard', () => {
    expect(isVisibleToMerchant('draft')).toBe(false);
    expect(isVisibleToMerchant('pending')).toBe(false);
    expect(isVisibleToMerchant('placed')).toBe(true);
  });

  it('refuses the merchant queue until a prepaid order is authorised', () => {
    expect(canEnterMerchantQueue('unpaid', 'card')).toBe(false);
    expect(canEnterMerchantQueue('authorising', 'card')).toBe(false);
    expect(canEnterMerchantQueue('failed', 'card')).toBe(false);
    expect(canEnterMerchantQueue('authorised', 'card')).toBe(true);
    expect(canEnterMerchantQueue('captured', 'card')).toBe(true);
  });

  it('expects cash on delivery to be unpaid at exactly that moment', () => {
    // The whole point of COD is that no money has moved yet. A gate written as
    // `payment === 'captured'` would make COD impossible, and a gate written
    // as `payment !== 'failed'` would let a failed card through.
    expect(canEnterMerchantQueue('unpaid', 'cash_on_delivery')).toBe(true);
    expect(canEnterMerchantQueue('failed', 'cash_on_delivery')).toBe(false);
    expect(canEnterMerchantQueue('captured', 'cash_on_delivery')).toBe(false);
  });
});

describe('who may do what', () => {
  it('lets a customer cancel up to the moment a merchant accepts', () => {
    expect(checkFulfilmentTransition('placed', 'cancelled', 'customer')).toEqual({ ok: true });

    // After `accepted`, somebody has begun committing stock. Who absorbs that
    // is a commercial decision, so it goes through ops rather than a button.
    const refused = checkFulfilmentTransition('accepted', 'cancelled', 'customer');
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.reason === 'actor_not_permitted') {
      expect(refused.allowedActors).toEqual(['akalt']);
    } else {
      throw new Error('expected an actor refusal');
    }
  });

  it('lets a merchant reject before accepting but not after', () => {
    expect(checkFulfilmentTransition('placed', 'rejected', 'merchant')).toEqual({ ok: true });
    // An order they took on and cannot fill is a substitution or a removal —
    // both of which move money through the ledger — not a rejection that would
    // erase the fact they had accepted it.
    expect(checkFulfilmentTransition('accepted', 'rejected', 'merchant')).toEqual({
      ok: false,
      reason: 'illegal_transition',
    });
  });

  it('never lets a customer advance fulfilment', () => {
    const forbidden: [OrderFulfilmentState, OrderFulfilmentState][] = [
      ['placed', 'accepted'],
      ['accepted', 'picking'],
      ['picking', 'ready'],
      ['ready', 'dispatched'],
      ['dispatched', 'delivered'],
    ];

    for (const [from, to] of forbidden) {
      expect(checkFulfilmentTransition(from, to, 'customer').ok).toBe(false);
    }
  });

  it('only lets the system decide whether a payment landed', () => {
    expect(checkFulfilmentTransition('pending', 'placed', 'system')).toEqual({ ok: true });
    expect(checkFulfilmentTransition('pending', 'placed', 'merchant').ok).toBe(false);
    expect(checkFulfilmentTransition('pending', 'placed', 'customer').ok).toBe(false);
  });

  it('refuses any move out of a terminal state, whoever asks', () => {
    for (const actor of ['customer', 'merchant', 'akalt', 'system'] as const) {
      expect(checkFulfilmentTransition('delivered', 'cancelled', actor)).toEqual({
        ok: false,
        reason: 'terminal',
      });
    }
  });

  it('refuses a skipped step', () => {
    // Nothing gets delivered without somebody picking it first.
    expect(checkFulfilmentTransition('placed', 'delivered', 'merchant')).toEqual({
      ok: false,
      reason: 'illegal_transition',
    });
  });
});

describe('a failed delivery is its own outcome', () => {
  it('is reachable from dispatched and is not the end of the story', () => {
    expect(checkFulfilmentTransition('dispatched', 'undeliverable', 'merchant')).toEqual({
      ok: true,
    });
    // Nobody home on Tuesday is usually delivered on Wednesday. Modelling it
    // as terminal would push operations into recording it as `delivered` or
    // `cancelled`, and both are false statements with money attached.
    expect(isTerminalFulfilment('undeliverable')).toBe(false);
    expect(checkFulfilmentTransition('undeliverable', 'delivered', 'merchant')).toEqual({
      ok: true,
    });
  });
});

describe('what the dashboard should render', () => {
  it('offers a merchant exactly the actions they may take', () => {
    expect(availableFulfilmentActions('placed', 'merchant')).toEqual(['accepted', 'rejected']);
    expect(availableFulfilmentActions('picking', 'merchant')).toEqual(['ready']);
    expect(availableFulfilmentActions('delivered', 'merchant')).toEqual([]);
  });

  it('offers a customer nothing once picking has started', () => {
    expect(availableFulfilmentActions('picking', 'customer')).toEqual([]);
  });
});
