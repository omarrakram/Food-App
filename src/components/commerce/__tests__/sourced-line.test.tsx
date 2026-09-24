import { screen } from '@testing-library/react-native';

import { setItem, StorageKeys } from '@/lib/storage';
import { render } from '@/test-utils/render';
import type { IngredientProductMapping, MerchantProduct } from '@/types/commerce';

import type { ProductCandidate, SourcedLine, SourcingLine } from '@/features/commerce/ports';

import { SourcedLineRow, UnsourceableLineRow } from '../sourced-line';

/**
 * WHAT THE SHOP SAYS UNDER AN INGREDIENT THE COOK DOES NOT HAVE.
 *
 * Every state here is a different answer, and collapsing any two of them
 * throws away the only thing the cook can act on. An out-of-stock item may be
 * there tomorrow; an unmapped one never will be; one excluded for an allergy
 * must never quietly become a suggestion to buy something else; and a product
 * we cannot size must not be shown a price we cannot stand behind.
 */

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

/*
  LANGUAGE IS SHARED STATE IN THIS FILE.

  `I18nProvider` hydrates from AsyncStorage, which the mock keeps for the whole
  run — so the Arabic tests below used to leave every test written after them
  rendering in Arabic, and a new English assertion would fail for a reason that
  has nothing to do with what it is testing. Each test starts from English and
  says so itself if it wants otherwise.
*/
beforeEach(async () => {
  await setItem(StorageKeys.languagePreference, 'en');
});

function product(over: Partial<MerchantProduct> = {}): MerchantProduct {
  return {
    id: 'prod-a',
    merchantId: 'm-1',
    locationId: 'loc-1',
    externalId: 'x-1',
    sku: null,
    name: 'Juhayna Cooking Cream 200ml',
    nameAr: 'جهينة كريمة طبخ ٢٠٠ مل',
    brand: 'Juhayna',
    packQuantity: 200,
    packUnit: 'ml',
    price: { amountMinor: 4_500, currency: 'EGP' },
    availability: 'in_stock',
    imageUrl: null,
    isActive: true,
    fetchedAt: '2026-09-23T09:00:00.000Z',
    ...over,
  };
}

const MAPPING: IngredientProductMapping = {
  id: 'map-a',
  ingredientSlug: 'cream',
  merchantProductId: 'prod-a',
  confidence: 0.95,
  source: 'name_match',
  isVerified: true,
  verifiedAt: '2026-09-23T09:00:00.000Z',
  verifiedBy: 'ops',
  isBlocked: false,
  createdAt: '2026-09-23T09:00:00.000Z',
  updatedAt: '2026-09-23T09:00:00.000Z',
};

const REQUESTED: SourcingLine = {
  ingredientSlug: 'cream',
  quantity: 200,
  unit: 'ml',
  amount: 'measured',
  sourceRecipeId: 'r-1',
  requestLineId: 'ri-1',
};

function candidate(over: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    product: product(),
    mapping: MAPPING,
    packsNeeded: 1,
    effectiveCostMinor: 4_500,
    score: 1_500,
    reasons: ['verified_mapping'],
    ...over,
  };
}

function sourced(over: Partial<SourcedLine> = {}): SourcedLine {
  return {
    requested: REQUESTED,
    status: 'matched',
    candidates: [candidate()],
    chosen: candidate(),
    exclusions: [],
    ...over,
  };
}

describe('a product the cook can actually buy', () => {
  it('names the product, the pack count and the price', async () => {
    await render(<SourcedLineRow line={sourced()} merchantName="Seoudi" />);

    expect(screen.getByText('Juhayna Cooking Cream 200ml')).toBeTruthy();
    expect(screen.getByText('1 pack')).toBeTruthy();
    // A MERCHANT PRICE IS LIVE. No `~`, because this is a shelf price and not
    // the ingredient estimate the rest of the app shows.
    expect(screen.queryByText(/~/)).toBeNull();
  });

  it('multiplies the price by the packs the cook has to buy', async () => {
    const line = sourced({ chosen: candidate({ packsNeeded: 3 }) });
    await render(<SourcedLineRow line={line} merchantName="Seoudi" />);

    expect(screen.getByText('3 packs')).toBeTruthy();
    // 45.00 × 3. The row prices the PURCHASE, not one pack of it.
    expect(screen.getByText(/135/)).toBeTruthy();
  });

  it('refuses to price a product it cannot count', async () => {
    // Matched, in stock, and the merchant never published a pack size. One
    // pack's price here is a number the cook could plan around and we could
    // not stand behind.
    const line = sourced({ chosen: candidate({ packsNeeded: null, effectiveCostMinor: null }) });
    await render(<SourcedLineRow line={line} merchantName="Seoudi" />);

    expect(screen.getByText('Juhayna Cooking Cream 200ml')).toBeTruthy();
    expect(screen.getByText(/Pack size unknown/)).toBeTruthy();
    expect(screen.queryByText(/45/)).toBeNull();
  });
});

describe('the four things that are not a product', () => {
  it('asks rather than choosing when the match is not certain', async () => {
    await render(
      <SourcedLineRow
        line={sourced({ status: 'needs_confirmation', chosen: null })}
        merchantName="Seoudi"
      />,
    );

    expect(screen.getByText('Choose a product')).toBeTruthy();
    // No price, because nothing has been chosen to price.
    expect(screen.queryByText(/45/)).toBeNull();
  });

  it('says out of stock rather than unavailable', async () => {
    await render(
      <SourcedLineRow
        line={sourced({ status: 'no_purchasable_match', chosen: null })}
        merchantName="Seoudi"
      />,
    );

    expect(screen.getByText('Out of stock')).toBeTruthy();
    expect(screen.getByText(/none right now/)).toBeTruthy();
  });

  it('never turns an allergy exclusion into a suggestion', async () => {
    await render(
      <SourcedLineRow
        line={sourced({
          status: 'no_eligible_match',
          chosen: null,
          exclusions: [{ productId: 'prod-a', axis: 'eligibility', reason: 'allergen' }],
        })}
        merchantName="Seoudi"
      />,
    );

    expect(screen.getByText('Not suitable for you')).toBeTruthy();
    // The excluded product's name must not appear anywhere on the row.
    expect(screen.queryByText(/Juhayna/)).toBeNull();
  });

  it('says the SHOP does not carry it when the shop does not carry it', async () => {
    await render(
      <SourcedLineRow line={sourced({ status: 'unmapped', chosen: null })} merchantName="Seoudi" />,
    );
    expect(screen.getByText('Not sold here')).toBeTruthy();
  });

  it('says WE cannot name it when the app has no canonical ingredient', async () => {
    // A different sentence from "not sold here" on purpose: one is a fact
    // about this branch's shelves, the other is a gap in our own catalogue,
    // and only the first might be different at another branch tomorrow.
    await render(<UnsourceableLineRow />);
    expect(screen.getByText('Cannot be ordered yet')).toBeTruthy();
    expect(screen.queryByText('Not sold here')).toBeNull();
  });
});

describe('Arabic', () => {
  it('renders the status copy in Arabic, not as a fallback to English', async () => {
    await setItem(StorageKeys.languagePreference, 'ar');
    await render(
      <SourcedLineRow
        line={sourced({ status: 'no_purchasable_match', chosen: null })}
        merchantName="سعودي"
      />,
    );

    expect(await screen.findByText('مش متوفر')).toBeTruthy();
    expect(screen.queryByText('Out of stock')).toBeNull();
  });

  it('keeps prices in Western numerals, matching the rest of the app', async () => {
    await setItem(StorageKeys.languagePreference, 'ar');
    await render(<SourcedLineRow line={sourced()} merchantName="سعودي" />);

    // `ar-EG-u-nu-latn` is pinned app-wide so a count interpolated by `t()`
    // and a price formatted by `Intl` cannot disagree on the same row.
    expect(await screen.findByText(/45/)).toBeTruthy();
    expect(screen.queryByText(/٤٥/)).toBeNull();
  });
});

describe('the two reasons we ask rather than choose', () => {
  /*
    `needs_confirmation` covers a mapping we are unsure of AND a product whose
    allergen or dietary data the shop never published. Those are different
    problems with different next steps, and a cook with a restriction who is
    told "we are not sure which product matches" will go looking at the wrong
    thing entirely.
  */
  it('says the MATCH is uncertain when that is the doubt', async () => {
    const line = sourced({
      status: 'needs_confirmation',
      chosen: null,
      candidates: [candidate({ reasons: ['name_match_mapping', 'in_stock'] })],
    });
    await render(<SourcedLineRow line={line} merchantName="Seoudi" />);

    expect(screen.getByText('Choose a product')).toBeTruthy();
    expect(screen.queryByText(/allergies or diet/i)).toBeNull();
  });

  it('says the LABEL is missing when the shop published nothing about it', async () => {
    const line = sourced({
      status: 'needs_confirmation',
      chosen: null,
      candidates: [candidate({ reasons: ['verified_mapping', 'eligibility_unknown'] })],
    });
    await render(<SourcedLineRow line={line} merchantName="Seoudi" />);

    expect(screen.getByText('Cannot be confirmed for you')).toBeTruthy();
    expect(screen.getByText(/allergies or diet/i)).toBeTruthy();
    expect(screen.queryByText('Choose a product')).toBeNull();
  });

  it('never prices or names a product it cannot vouch for', async () => {
    const line = sourced({
      status: 'needs_confirmation',
      chosen: null,
      candidates: [candidate({ reasons: ['eligibility_unknown'] })],
    });
    await render(<SourcedLineRow line={line} merchantName="Seoudi" />);

    expect(screen.queryByText(/Juhayna/)).toBeNull();
    expect(screen.queryByText(/45/)).toBeNull();
  });
});

describe('a refusal on dietary grounds', () => {
  it('reads as allergies OR diet, because either can be the cause', async () => {
    await render(
      <SourcedLineRow
        line={sourced({
          status: 'no_eligible_match',
          chosen: null,
          exclusions: [{ productId: 'prod-a', axis: 'eligibility', reason: 'diet' }],
        })}
        merchantName="Seoudi"
      />,
    );

    expect(screen.getByText('Not suitable for you')).toBeTruthy();
    expect(screen.getByText(/allergies or your diet/i)).toBeTruthy();
    // And still never names the product it just refused.
    expect(screen.queryByText(/Juhayna/)).toBeNull();
  });
});
