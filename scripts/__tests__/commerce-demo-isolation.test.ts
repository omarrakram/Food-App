import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEMO_LOCATION,
  DEMO_MAPPINGS,
  DEMO_MERCHANT,
  DEMO_PRODUCTS,
} from '../../src/features/commerce/demo-catalogue.generated.ts';
import { INGREDIENT_CATALOGUE } from '../../src/features/ingredients/catalogue.ts';

/**
 * The demo catalogue is quarantined.
 *
 * `data/commerce-demo/` exists so the ordering flow can be built before a real
 * partner catalogue does. The risk it carries is contamination in two
 * directions, and both are quiet:
 *
 *   1. INTO THE FOOD INTELLIGENCE. A merchant mapping that invents an
 *      ingredient, or a recipe that starts referencing a SKU, and the
 *      canonical catalogue is no longer the single source of food truth.
 *
 *   2. INTO PRODUCTION. A demo merchant that reads as a real one. The whole
 *      point of the flag is that nobody — a developer, a screen, a query —
 *      can mistake a development fixture for a signed partner.
 */

const ROOT = join(__dirname, '..', '..');

function filesUnder(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (match.test(entry)) out.push(path);
    }
  };
  walk(join(ROOT, dir));
  return out;
}

describe('the demo merchant cannot be mistaken for a partner', () => {
  it('is flagged as demo and is not enabled', () => {
    expect(DEMO_MERCHANT.isDemo).toBe(true);
    expect(DEMO_MERCHANT.isEnabled).toBe(false);
    expect(DEMO_LOCATION.isAcceptingOrders).toBe(false);
  });

  it('says so in its own name, in both languages', () => {
    // Belt and braces with the flag: the first place a developer or a
    // screenshot encounters this row is its name.
    expect(DEMO_MERCHANT.name).toMatch(/development only/i);
    expect(DEMO_MERCHANT.nameAr).toContain('للتطوير');
  });

  it('carries the development commission assumption, not a negotiated one', () => {
    expect(DEMO_MERCHANT.commissionRateBasisPoints).toBe(1_000);
  });
});

describe('mappings cannot invent food', () => {
  it('references only canonical ingredients', () => {
    const canonical = new Set(INGREDIENT_CATALOGUE.map((entry) => entry.slug));
    const invented = DEMO_MAPPINGS.map((m) => m.ingredientSlug).filter(
      (slug) => !canonical.has(slug),
    );

    expect(invented).toEqual([]);
  });

  it('references only products that exist', () => {
    const ids = new Set(DEMO_PRODUCTS.map((p) => p.externalId));
    const dangling = DEMO_MAPPINGS.map((m) => m.productExternalId).filter(
      (id) => !ids.has(id),
    );

    expect(dangling).toEqual([]);
  });

  it('never marks a mapping both verified and blocked', () => {
    const contradictory = DEMO_MAPPINGS.filter((m) => m.isVerified && m.isBlocked);
    expect(contradictory).toEqual([]);
  });

  it('keeps at least one blocked mapping, so the refusal path is exercised', () => {
    // A blocked row is how a human says "not this one, ever". If the fixture
    // never contains one, nothing downstream ever proves it is honoured.
    expect(DEMO_MAPPINGS.some((m) => m.isBlocked)).toBe(true);
  });
});

describe('nothing leaks into the food intelligence', () => {
  it('puts no merchant SKU or product id into the ingredient or recipe data', () => {
    const needles = [
      ...DEMO_PRODUCTS.map((p) => p.externalId),
      ...DEMO_PRODUCTS.map((p) => p.sku).filter((sku): sku is string => sku !== null),
    ];

    const foodFiles = [
      ...filesUnder('data/ingredients', /\.(csv|json)$/),
      ...filesUnder('data/recipes', /\.json$/),
    ];

    const leaks: string[] = [];
    for (const file of foodFiles) {
      const contents = readFileSync(file, 'utf8');
      for (const needle of needles) {
        if (contents.includes(needle)) leaks.push(`${file.replace(ROOT, '')} contains ${needle}`);
      }
    }

    expect(leaks).toEqual([]);
  });

  it('is imported only from the commerce feature', () => {
    // A screen or an engine outside commerce reaching for the demo catalogue
    // is the moment a development fixture becomes product behaviour.
    const sources = filesUnder('src', /\.tsx?$/);
    const offenders: string[] = [];

    for (const file of sources) {
      if (file.includes(join('features', 'commerce'))) continue;
      if (/demo-catalogue\.generated/.test(readFileSync(file, 'utf8'))) {
        offenders.push(file.replace(ROOT, ''));
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('the catalogue is usable enough to prove the flow', () => {
  it('offers more than one pack size for something', () => {
    // Pack maths and the price ranking are both untestable against a
    // catalogue where every ingredient has exactly one option.
    const bySlug = new Map<string, number>();
    for (const mapping of DEMO_MAPPINGS) {
      if (mapping.isBlocked) continue;
      bySlug.set(mapping.ingredientSlug, (bySlug.get(mapping.ingredientSlug) ?? 0) + 1);
    }

    const multiOption = [...bySlug.values()].filter((count) => count > 1);
    expect(multiOption.length).toBeGreaterThanOrEqual(3);
  });

  it('includes an out-of-stock product and an inactive one', () => {
    expect(DEMO_PRODUCTS.some((p) => p.availability === 'out_of_stock')).toBe(true);
    expect(DEMO_PRODUCTS.some((p) => !p.isActive)).toBe(true);
  });

  it('includes a product carrying an allergen its canonical ingredient does not', () => {
    // Marinated chicken breast against canonical `chicken-breast`. This is the
    // case the allergen filter exists for, and a fixture without it would let
    // that filter rot untested.
    const marinated = DEMO_PRODUCTS.find((p) => p.externalId === 'dm-chk-mar-500');
    expect(marinated?.allergens).toContain('dairy');

    const canonical = INGREDIENT_CATALOGUE.find((entry) => entry.slug === 'chicken-breast');
    expect(canonical?.allergens ?? []).not.toContain('dairy');
  });
});
