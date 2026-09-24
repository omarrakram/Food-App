import type { DeliveryAddress, MerchantLocation } from '@/types/commerce';

import {
  areaByKey,
  areaDisplayName,
  canDeliver,
  DEMO_DELIVERY_AREAS,
} from '../delivery-areas';
import { DEMO_LOCATION_SNAPSHOT } from '../demo-adapter';

/**
 * A VALID ADDRESS IS NOT A DELIVERABLE ONE.
 *
 * Three separate things — an address, an area, a branch — and the question is
 * answered by comparing canonical keys. These tests are mostly about the ways
 * a string comparison would have got it wrong.
 */

function location(keys: readonly string[]): Pick<MerchantLocation, 'deliveryAreaKeys'> {
  return { deliveryAreaKeys: keys };
}

function address(areaKey: string): Pick<DeliveryAddress, 'areaKey'> {
  return { areaKey };
}

describe('the same address, two branches', () => {
  const home = address('demo-maadi');

  it('is deliverable by a branch that covers it', () => {
    expect(canDeliver(location(['demo-maadi', 'demo-degla']), home)).toEqual({
      deliverable: true,
    });
  });

  it('is NOT deliverable by a branch that does not', () => {
    expect(canDeliver(location(['demo-nasr-city']), home)).toEqual({
      deliverable: false,
      reason: 'outside_delivery_area',
    });
  });
});

describe('the string comparisons this replaces', () => {
  it('does not treat a longer name as a match for a shorter one', () => {
    // 'demo-maadi' is a prefix of 'demo-maadi-degla'. A `startsWith` or an
    // `includes` would deliver to the wrong district; a key comparison does
    // not care how the names are spelled.
    expect(canDeliver(location(['demo-maadi-degla']), address('demo-maadi'))).toEqual({
      deliverable: false,
      reason: 'outside_delivery_area',
    });
  });

  it('does not match on a shared word', () => {
    expect(canDeliver(location(['demo-sarayat']), address('demo-maadi'))).toEqual({
      deliverable: false,
      reason: 'outside_delivery_area',
    });
  });

  it('is case- and whitespace-exact, because it is an identifier', () => {
    expect(canDeliver(location(['demo-maadi']), address('Demo-Maadi')).deliverable).toBe(false);
    expect(canDeliver(location(['demo-maadi']), address(' demo-maadi ')).deliverable).toBe(false);
  });
});

describe('the defaults that must not be generous', () => {
  it('treats no declared coverage as NO coverage, never as everywhere', () => {
    // The inverse would accept an Aswan order for a Maadi branch, and would do
    // it most confidently for a merchant nobody had configured yet.
    expect(canDeliver(location([]), address('demo-maadi'))).toEqual({
      deliverable: false,
      reason: 'branch_has_no_coverage',
    });
  });

  it('refuses an address with no area chosen rather than guessing one', () => {
    expect(canDeliver(location(['demo-maadi']), address(''))).toEqual({
      deliverable: false,
      reason: 'no_area_selected',
    });
  });

  it('distinguishes "you never picked" from "we do not go there"', () => {
    // Two different sentences for the user: one is a form to finish, the other
    // is a branch that cannot help them.
    const unfinished = canDeliver(location(['demo-maadi']), address(''));
    const unserved = canDeliver(location(['demo-maadi']), address('demo-nasr-city'));
    expect(unfinished).not.toEqual(unserved);
  });
});

describe('the demo registry', () => {
  it('carries at least one area the demo branch does NOT serve', () => {
    // So the unsupported-area path is reachable in a build somebody can open,
    // rather than only in this file.
    const served = DEMO_LOCATION_SNAPSHOT.deliveryAreaKeys;
    const unserved = DEMO_DELIVERY_AREAS.filter((area) => !served.includes(area.key));
    expect(unserved.length).toBeGreaterThan(0);
  });

  it('declares every area it serves in the registry', () => {
    // A branch cannot cover a key that does not exist; the database enforces
    // it with a foreign key, and this catches the fixture drifting first.
    const keys = DEMO_DELIVERY_AREAS.map((area) => area.key);
    for (const served of DEMO_LOCATION_SNAPSHOT.deliveryAreaKeys) {
      expect(keys).toContain(served);
    }
  });

  it('marks every development area as demo, in the data', () => {
    expect(DEMO_DELIVERY_AREAS.every((area) => area.isDemo)).toBe(true);
  });

  it('names each area in both languages', () => {
    for (const area of DEMO_DELIVERY_AREAS) {
      expect(areaDisplayName(area, 'en')).toBe(area.nameEn);
      expect(areaDisplayName(area, 'ar')).toBe(area.nameAr);
      expect(area.nameAr).not.toBe(area.nameEn);
    }
  });
});

describe('looking an area up', () => {
  it('finds one by key', () => {
    expect(areaByKey(DEMO_DELIVERY_AREAS, 'demo-degla')?.nameEn).toBe('Degla');
  });

  it('returns null for an unknown key rather than a near miss', () => {
    expect(areaByKey(DEMO_DELIVERY_AREAS, 'maadi')).toBeNull();
    expect(areaByKey(DEMO_DELIVERY_AREAS, null)).toBeNull();
  });
});
