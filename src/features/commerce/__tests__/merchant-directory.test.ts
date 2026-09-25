import { chooseLocation } from '../supabase-merchant-directory';

/**
 * WHICH BRANCH, given several open ones.
 *
 * The queries around this are plumbing; these are the rules, and each one has
 * a way of going wrong that a customer would feel.
 */

type Branch = { id: string };

const branches: readonly Branch[] = [{ id: 'alexandria' }, { id: 'maadi' }, { id: 'unconfigured' }];

const areas = new Map<string, readonly string[]>([
  ['alexandria', ['alex-smouha']],
  ['maadi', ['cairo-maadi', 'cairo-degla']],
  // 'unconfigured' has no row at all.
]);

describe('chooseLocation', () => {
  it('prefers the branch that actually reaches the customer', () => {
    expect(chooseLocation(branches, areas, 'cairo-maadi')?.id).toBe('maadi');
    expect(chooseLocation(branches, areas, 'alex-smouha')?.id).toBe('alexandria');
  });

  it('falls back to the first open branch when the area is unknown', () => {
    // Not an error: the customer may not have saved an address yet, and the
    // deliverability check at checkout is the authority either way.
    expect(chooseLocation(branches, areas, null)?.id).toBe('alexandria');
    expect(chooseLocation(branches, areas, 'somewhere-else')?.id).toBe('alexandria');
  });

  it('NEVER selects a branch with no delivery areas configured', () => {
    // Empty means no coverage, not "everywhere". A half-configured merchant
    // must not silently accept orders from the whole country.
    expect(chooseLocation([{ id: 'unconfigured' }], areas, null)).toBeNull();
    expect(chooseLocation([{ id: 'unconfigured' }], areas, 'cairo-maadi')).toBeNull();
  });

  it('returns null when there is nothing open at all', () => {
    expect(chooseLocation([], areas, 'cairo-maadi')).toBeNull();
  });

  it('is deterministic, so a cart does not move between branches', () => {
    // Two people in the same unknown area get the same shop, and so does the
    // same person on a second render.
    const first = chooseLocation(branches, areas, null);
    const second = chooseLocation(branches, areas, null);
    expect(first?.id).toBe(second?.id);
  });
});
