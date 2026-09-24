import { INGREDIENTS_BY_SLUG } from '@/features/ingredients/catalogue';
import { perPieceWeightFor } from '@/features/pricing/units';

import { hasEasternNumerals } from '@/lib/format/numerals';

import {
  DEMO_LOCATION_SNAPSHOT,
  DEMO_MERCHANT_SNAPSHOT,
  DemoCatalogueAdapter,
  demoCandidatesFor,
} from '../demo-adapter';
import { DEMO_PRODUCTS } from '../demo-catalogue.generated';
import { locationDisplayName, merchantDisplayName, productDisplayName } from '../display';
import type { SourcingLine } from '../ports';
import { sourceLine, sourceRequest, type SourcingContext } from '../sourcing';

/** The merchant's readable key → the uuid everything downstream carries. */
const idFor = (externalId: string): string =>
  DEMO_PRODUCTS.find((row) => row.externalId === externalId)!.id;

/**
 * End to end against the development catalogue.
 *
 * The unit tests prove the ranking rules in isolation against hand-built
 * fixtures. This one proves the rules survive contact with a catalogue shaped
 * like a real shelf — several pack sizes, a product that is out of stock, one
 * that has been delisted, a mapping a human blocked, and a marinated cut that
 * carries an allergen its canonical ingredient does not.
 *
 * The scenario is the one from the brief: the cook has pasta, garlic and
 * butter, and is missing chicken, cream and parmesan.
 */

const CONTEXT: SourcingContext = {
  avoidAllergens: [],
  requireDiets: [],
  perPieceFor: (slug) => perPieceWeightFor(INGREDIENTS_BY_SLUG.get(slug) ?? null),
};

/** What "YOU NEED" hands to commerce for a chicken pasta. */
const MISSING: SourcingLine[] = [
  { ingredientSlug: 'chicken-breast', quantity: 500, unit: 'g', amount: 'measured', sourceRecipeId: 'r-alfredo', requestLineId: null },
  { ingredientSlug: 'cream', quantity: 200, unit: 'ml', amount: 'measured', sourceRecipeId: 'r-alfredo', requestLineId: null },
  { ingredientSlug: 'parmesan', quantity: 50, unit: 'g', amount: 'measured', sourceRecipeId: 'r-alfredo', requestLineId: null },
];

describe('the missing-ingredients basket', () => {
  it('resolves every missing ingredient to a real product', () => {
    const result = sourceRequest(
      { lines: MISSING, merchantId: 'demo-merchant', locationId: 'demo-location' },
      demoCandidatesFor,
      CONTEXT,
    );

    expect(result.lines.map((line) => line.status)).toEqual(['matched', 'matched', 'matched']);
    expect(result.unresolvedCount).toBe(0);

    expect(result.lines.map((line) => line.chosen?.product.name)).toEqual([
      'Fresh Chicken Breast 500g',
      'Cooking Cream 200ml',
      'Grated Parmesan 100g',
    ]);
  });

  it('buys one pack of each, because each fits', () => {
    const result = sourceRequest(
      { lines: MISSING, merchantId: 'demo-merchant', locationId: 'demo-location' },
      demoCandidatesFor,
      CONTEXT,
    );

    expect(result.lines.map((line) => line.chosen?.packsNeeded)).toEqual([1, 1, 1]);
  });

  it('adds up to a basket the cart can be built from', () => {
    const result = sourceRequest(
      { lines: MISSING, merchantId: 'demo-merchant', locationId: 'demo-location' },
      demoCandidatesFor,
      CONTEXT,
    );

    const total = result.lines.reduce(
      (sum, line) => sum + (line.chosen?.effectiveCostMinor ?? 0),
      0,
    );

    // 90.00 chicken + 55.00 cream + 140.00 parmesan.
    expect(total).toBe(28_500);
  });
});

describe('the shelf is not tidy, and the engine copes', () => {
  it('skips the 500ml cream because it is out of stock', () => {
    const line = sourceLine(
      { ingredientSlug: 'cream', quantity: 400, unit: 'ml', amount: 'measured', sourceRecipeId: null, requestLineId: null },
      demoCandidatesFor('cream'),
      CONTEXT,
    );

    // 400 ml wants the 500 ml pot on pack fit alone — but it is out of stock,
    // so the answer is two of the 200 ml.
    expect(line.chosen?.product.name).toBe('Cooking Cream 200ml');
    expect(line.chosen?.packsNeeded).toBe(2);
    expect(line.candidates.map((c) => c.product.availability)).toContain('out_of_stock');
  });

  it('never offers the delisted chicken pack', () => {
    const line = sourceLine(
      { ingredientSlug: 'chicken-breast', quantity: 500, unit: 'g', amount: 'measured', sourceRecipeId: null, requestLineId: null },
      demoCandidatesFor('chicken-breast'),
      CONTEXT,
    );

    expect(line.candidates.map((c) => c.product.externalId)).not.toContain('dm-legacy-chk');
  });

  it('never offers a mapping a human blocked', () => {
    // Olive oil was blocked as a stand-in for butter. It is still a row in the
    // catalogue, which is the point — a deleted mapping would be re-derived.
    const line = sourceLine(
      { ingredientSlug: 'butter', quantity: 100, unit: 'g', amount: 'measured', sourceRecipeId: null, requestLineId: null },
      demoCandidatesFor('butter'),
      CONTEXT,
    );

    expect(line.candidates.map((c) => c.product.externalId)).toEqual(['dm-butter-200']);
  });
});

describe('an allergy changes the basket, not the ranking', () => {
  it('removes the marinated chicken for a dairy allergy and still finds chicken', () => {
    const dairyFree: SourcingContext = { ...CONTEXT, avoidAllergens: ['dairy'] };

    const line = sourceLine(
      { ingredientSlug: 'chicken-breast', quantity: 500, unit: 'g', amount: 'measured', sourceRecipeId: null, requestLineId: null },
      demoCandidatesFor('chicken-breast'),
      dairyFree,
    );

    expect(line.candidates.map((c) => c.product.externalId)).not.toContain('dm-chk-mar-500');
    expect(line.status).toBe('matched');
    expect(line.chosen?.product.externalId).toBe('dm-chk-500');
  });

  it('leaves a dairy-allergic cook with no parmesan at all, honestly', () => {
    const dairyFree: SourcingContext = { ...CONTEXT, avoidAllergens: ['dairy'] };

    const line = sourceLine(
      { ingredientSlug: 'parmesan', quantity: 50, unit: 'g', amount: 'measured', sourceRecipeId: null, requestLineId: null },
      demoCandidatesFor('parmesan'),
      dairyFree,
    );

    // The only parmesan on the shelf contains dairy. `no_eligible_match` — not
    // `unmapped` — because we DO stock parmesan and this cook cannot have it,
    // which is a different sentence and a different fix. Substituting
    // something else would be the app quietly deciding what a person with an
    // allergy may eat.
    expect(line.status).toBe('no_eligible_match');
    expect(line.chosen).toBeNull();
    expect(line.exclusions).toEqual([
      { productId: idFor('dm-parm-100'), axis: 'eligibility', reason: 'allergen' },
    ]);
  });
});

describe('the bigger pack wins when it actually costs less', () => {
  it('prefers 1kg of chicken over two 500g packs for a 900g recipe', () => {
    const line = sourceLine(
      { ingredientSlug: 'chicken-breast', quantity: 900, unit: 'g', amount: 'measured', sourceRecipeId: null, requestLineId: null },
      demoCandidatesFor('chicken-breast'),
      CONTEXT,
    );

    // Two 500 g packs is 180.00; one 1 kg pack is 170.00. The shelf price says
    // the small pack is cheaper, and the shelf price is not the question.
    expect(line.chosen?.product.name).toBe('Fresh Chicken Breast 1kg');
    expect(line.chosen?.effectiveCostMinor).toBe(17_000);
  });
});

describe('the adapter', () => {
  it('finds products by English and Arabic name', async () => {
    const adapter = new DemoCatalogueAdapter();

    const english = await adapter.searchProducts({ locationId: 'demo-location', term: 'chicken' });
    expect(english.length).toBeGreaterThan(0);

    const arabic = await adapter.searchProducts({ locationId: 'demo-location', term: 'فراخ' });
    expect(arabic.length).toBeGreaterThan(0);
  });

  it('never returns a delisted product from search', async () => {
    const adapter = new DemoCatalogueAdapter();
    const results = await adapter.searchProducts({ locationId: 'demo-location', term: 'chicken' });
    expect(results.map((p) => p.externalId)).not.toContain('dm-legacy-chk');
  });

  it('reports a merchant that is demo and disabled', async () => {
    const merchant = await new DemoCatalogueAdapter().getMerchant();
    expect(merchant.isDemo).toBe(true);
    expect(merchant.isEnabled).toBe(false);
  });

  it('reports a branch that is not accepting orders', async () => {
    const [branch] = await new DemoCatalogueAdapter().listLocations();
    expect(branch?.isAcceptingOrders).toBe(false);
  });
});

describe('a product with no published allergen data', () => {
  it('is offered but not chosen for a cook with allergies', () => {
    // The demo bakery line carries `allergens: unknown` on purpose — a real
    // merchant catalogue will be full of them, and the day we integrate one
    // this is the path that stops every unlabelled product becoming safe for
    // everybody by default.
    const line = sourceLine(
      { ingredientSlug: 'baladi-bread', quantity: 2, unit: 'piece', amount: 'measured', sourceRecipeId: null, requestLineId: null },
      demoCandidatesFor('baladi-bread'),
      { ...CONTEXT, avoidAllergens: ['gluten'] },
    );

    expect(line.status).toBe('needs_confirmation');
    expect(line.chosen).toBeNull();
    expect(line.candidates[0]?.reasons).toContain('eligibility_unknown');
  });

  it('is chosen normally for a cook with no restrictions', () => {
    const line = sourceLine(
      { ingredientSlug: 'baladi-bread', quantity: 2, unit: 'piece', amount: 'measured', sourceRecipeId: null, requestLineId: null },
      demoCandidatesFor('baladi-bread'),
      CONTEXT,
    );

    expect(line.status).toBe('matched');
    expect(line.chosen?.packsNeeded).toBe(1);
  });
});

describe('every sourcing state is reachable in a build somebody can open', () => {
  /**
   * NON-VACUITY FOR THE DEMO CATALOGUE.
   *
   * A state that exists only in a unit test against hand-built fixtures is a
   * state nobody has ever looked at — no copy written for it, no layout, no
   * screenshot. The awkward rows in `data/commerce-demo/products.csv` exist to
   * make all five reachable, and this fails the moment one of them is tidied
   * away.
   */
  it('produces all five statuses from real rows', () => {
    const coeliac: SourcingContext = { ...CONTEXT, avoidAllergens: ['gluten'] };

    const statuses = {
      // Rice: two pack sizes, both in stock, no allergens.
      matched: sourceLine(
        { ingredientSlug: 'rice', quantity: 500, unit: 'g', amount: 'measured', sourceRecipeId: null, requestLineId: null },
        demoCandidatesFor('rice'),
        coeliac,
      ).status,
      // Baladi bread: the bakery publishes no allergen data at all.
      needs_confirmation: sourceLine(
        { ingredientSlug: 'baladi-bread', quantity: 2, unit: 'piece', amount: 'measured', sourceRecipeId: null, requestLineId: null },
        demoCandidatesFor('baladi-bread'),
        coeliac,
      ).status,
      // Potatoes: the only potato row, and it is out of stock.
      no_purchasable_match: sourceLine(
        { ingredientSlug: 'potatoes', quantity: 500, unit: 'g', amount: 'measured', sourceRecipeId: null, requestLineId: null },
        demoCandidatesFor('potatoes'),
        CONTEXT,
      ).status,
      // Pasta: the only pasta row, and it is wheat.
      no_eligible_match: sourceLine(
        { ingredientSlug: 'pasta', quantity: 400, unit: 'g', amount: 'measured', sourceRecipeId: null, requestLineId: null },
        demoCandidatesFor('pasta'),
        coeliac,
      ).status,
      // Tomato paste: nothing in the catalogue claims to be it.
      unmapped: sourceLine(
        { ingredientSlug: 'tomato-paste', quantity: 2, unit: 'tbsp', amount: 'measured', sourceRecipeId: null, requestLineId: null },
        demoCandidatesFor('tomato-paste'),
        CONTEXT,
      ).status,
    };

    expect(statuses).toEqual({
      matched: 'matched',
      needs_confirmation: 'needs_confirmation',
      no_purchasable_match: 'no_purchasable_match',
      no_eligible_match: 'no_eligible_match',
      unmapped: 'unmapped',
    });
  });
});

describe('merchant text is normalised for display and untouched in storage', () => {
  /**
   * THE TWO HALVES OF ONE PROMISE.
   *
   * AKALT renders 0–9 in both languages; a merchant's catalogue is their
   * record of their own product. Both hold because normalisation happens at
   * display time and nowhere else — so this asserts the stored row STILL
   * carries what the merchant published, and that the display layer renders it
   * Western anyway.
   *
   * The first half matters most: the easy "fix" for the numeral rule is to
   * edit the CSV, and that is the one thing we must not do.
   */
  const allProducts = () =>
    new DemoCatalogueAdapter().getProducts(DEMO_PRODUCTS.map((row) => row.id));

  it('keeps the merchant spelling in the catalogue, Eastern numerals included', async () => {
    const products = await allProducts();
    const rice = products.find((product) => product.externalId === 'dm-rice-1000');
    expect(rice?.nameAr).toBe('رز مصري ١ كجم');
    expect(hasEasternNumerals(rice!.nameAr!)).toBe(true);
  });

  it('renders it with Western numerals and the same words', async () => {
    const products = await allProducts();
    const rice = products.find((product) => product.externalId === 'dm-rice-1000')!;
    expect(productDisplayName(rice, 'ar')).toBe('رز مصري 1 كجم');
    expect(productDisplayName(rice, 'en')).toBe(rice.name);
  });

  it('leaves no Eastern numeral anywhere on the displayed catalogue', async () => {
    // Every product, both languages. A single row that skipped the display
    // layer would show up here rather than in a screenshot somebody squints at.
    const products = await allProducts();
    const offenders = products.flatMap((product) =>
      (['en', 'ar'] as const)
        .map((language) => productDisplayName(product, language))
        .filter(hasEasternNumerals),
    );
    expect(offenders).toEqual([]);
  });

  it('and the branch name is normalised the same way', () => {
    expect(hasEasternNumerals(locationDisplayName(DEMO_LOCATION_SNAPSHOT, 'ar'))).toBe(false);
    expect(hasEasternNumerals(merchantDisplayName(DEMO_MERCHANT_SNAPSHOT, 'ar'))).toBe(false);
  });
});
