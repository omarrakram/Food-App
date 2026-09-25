import {
  allergenCoverage,
  allergenNotice,
  orderingNarrowedByMissingAllergenData,
} from '../allergen-policy';

/**
 * THE MESSAGE, NOT THE RULE.
 *
 * "Unknown must not mean safe" is enforced in `sourcing.ts` and is tested
 * there. What these cover is the sentence a customer reads when that rule
 * makes their basket narrower than somebody else's — because a silent gate is
 * indistinguishable from a thin catalogue, and from a bug.
 */

const published = { productAllergens: [] as readonly string[] };
const alsoPublished = { productAllergens: ['gluten'] as readonly string[] };
const unpublished = { productAllergens: null };

describe('allergenCoverage', () => {
  it('counts a DECLARED-EMPTY list as published', () => {
    // The distinction the whole policy turns on: an empty array is the
    // merchant saying "none"; null is nobody having said anything.
    expect(allergenCoverage([published, alsoPublished])).toEqual({
      candidatesConsidered: 2,
      withPublishedData: 2,
    });
  });

  it('counts null as unpublished', () => {
    expect(allergenCoverage([published, unpublished, unpublished])).toEqual({
      candidatesConsidered: 3,
      withPublishedData: 1,
    });
  });

  it('handles an empty shelf', () => {
    expect(allergenCoverage([])).toEqual({ candidatesConsidered: 0, withPublishedData: 0 });
  });
});

describe('allergenNotice', () => {
  it('says nothing to somebody with no declared allergies', () => {
    // They are not affected, and a warning they cannot act on is noise — which
    // is how a real warning stops being read.
    expect(allergenNotice(false, allergenCoverage([unpublished, unpublished]))).toBe('none');
  });

  it('says nothing when the shop has published everything', () => {
    expect(allergenNotice(true, allergenCoverage([published, alsoPublished]))).toBe('none');
  });

  it('warns when SOME of the shelf is unlabelled', () => {
    expect(allergenNotice(true, allergenCoverage([published, unpublished]))).toBe('partial');
  });

  it('is explicit when the shop has published NOTHING', () => {
    // The pilot case. Automatic ordering is materially narrower for this
    // customer and they are entitled to know why.
    expect(allergenNotice(true, allergenCoverage([unpublished, unpublished]))).toBe('absent');
  });

  it('says nothing when the shop offered no candidates at all', () => {
    // Nothing was considered, so nothing was withheld. A different screen
    // already explains an empty result.
    expect(allergenNotice(true, allergenCoverage([]))).toBe('none');
  });

  it('never reports a state that would imply the gate was relaxed', () => {
    // There is deliberately no 'allowed_anyway'. The only outcomes are silence
    // and an explanation; nothing here can widen what the sourcer will choose.
    for (const coverage of [
      allergenCoverage([unpublished]),
      allergenCoverage([published, unpublished]),
      allergenCoverage([published]),
    ]) {
      expect(['none', 'partial', 'absent']).toContain(allergenNotice(true, coverage));
    }
  });
});

describe('orderingNarrowedByMissingAllergenData', () => {
  it('is true only in the absent case', () => {
    expect(orderingNarrowedByMissingAllergenData('absent')).toBe(true);
    expect(orderingNarrowedByMissingAllergenData('partial')).toBe(false);
    expect(orderingNarrowedByMissingAllergenData('none')).toBe(false);
  });
});
