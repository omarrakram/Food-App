import type { PerPieceWeight } from '@/features/pricing/units';

import { packsNeeded } from '../pack-maths';

/**
 * Pack maths.
 *
 * Every case here is a real shelf. The worked example from the brief — 500 g
 * of chicken breast against a 450 g pack and a 1 kg pack — is the first two.
 */

describe('the worked example', () => {
  it('buys two 450g packs for a 500g recipe', () => {
    const result = packsNeeded({ quantity: 500, unit: 'g' }, { quantity: 450, unit: 'g' });

    expect(result).toEqual({
      kind: 'known',
      packs: 2,
      totalQuantity: 900,
      unit: 'g',
      surplusQuantity: 400,
    });
  });

  it('buys one 1kg pack for the same recipe, and says what is left over', () => {
    const result = packsNeeded({ quantity: 500, unit: 'g' }, { quantity: 1, unit: 'kg' });

    // Expressed in the PACK's unit, because that is what the customer is
    // buying: "1 × 1 kg, 0.5 kg left over" — not "1000 grams".
    expect(result).toEqual({
      kind: 'known',
      packs: 1,
      totalQuantity: 1,
      unit: 'kg',
      surplusQuantity: 0.5,
    });
  });
});

describe('exact fits leave nothing over', () => {
  it('handles a clean multiple', () => {
    const result = packsNeeded({ quantity: 1000, unit: 'g' }, { quantity: 500, unit: 'g' });
    expect(result).toMatchObject({ packs: 2, surplusQuantity: 0 });
  });

  it('handles a single exact pack', () => {
    const result = packsNeeded({ quantity: 1, unit: 'kg' }, { quantity: 1, unit: 'kg' });
    expect(result).toMatchObject({ packs: 1, surplusQuantity: 0 });
  });
});

describe('floating point does not cost the customer an extra pack', () => {
  it('buys three 100g packs for 0.3kg, not four', () => {
    // 0.3 × 1000 is 300.00000000000006 in JavaScript, and ceiling that against
    // a 100 g pack gives FOUR. Recipes are written in kilograms and packs are
    // sold in grams, so this is an everyday case rather than a curiosity.
    const result = packsNeeded({ quantity: 0.3, unit: 'kg' }, { quantity: 100, unit: 'g' });
    expect(result).toMatchObject({ packs: 3, surplusQuantity: 0 });
  });
});

describe('countable units', () => {
  it('compares pieces against pieces without needing a weight', () => {
    // A 12-egg tray against "2 eggs". Nothing here needs converting to grams,
    // and requiring a per-piece weight would make it unanswerable.
    const result = packsNeeded({ quantity: 2, unit: 'piece' }, { quantity: 12, unit: 'piece' });
    expect(result).toMatchObject({ packs: 1, totalQuantity: 12, surplusQuantity: 10 });
  });

  it('converts a countable recipe amount into a weighed pack', () => {
    // Three cloves of garlic against a 200 g bulb pack. 5 g a clove.
    const perClove: PerPieceWeight = { unit: 'clove', grams: 5 };
    const result = packsNeeded(
      { quantity: 3, unit: 'clove' },
      { quantity: 200, unit: 'g' },
      perClove,
    );
    expect(result).toMatchObject({ packs: 1, totalQuantity: 200, surplusQuantity: 185 });
  });

  it('refuses to convert one countable unit into a different one', () => {
    // A per-BUNCH weight says nothing about a clove. The existing unit module
    // already refuses this; the point of the test is that pack maths inherits
    // the refusal rather than inventing a number.
    const perBunch: PerPieceWeight = { unit: 'bunch', grams: 60 };
    const result = packsNeeded(
      { quantity: 3, unit: 'clove' },
      { quantity: 200, unit: 'g' },
      perBunch,
    );
    expect(result).toEqual({ kind: 'unknown', reason: 'incompatible_units' });
  });
});

describe('when it cannot tell, it says so', () => {
  it('does not guess when the recipe gives no quantity', () => {
    expect(packsNeeded({ quantity: null, unit: 'g' }, { quantity: 450, unit: 'g' })).toEqual({
      kind: 'unknown',
      reason: 'no_recipe_quantity',
    });
  });

  it('does not guess when the merchant gives no pack size', () => {
    expect(packsNeeded({ quantity: 500, unit: 'g' }, { quantity: null, unit: null })).toEqual({
      kind: 'unknown',
      reason: 'no_pack_size',
    });
  });

  it('does not guess when the pack size is zero', () => {
    expect(packsNeeded({ quantity: 500, unit: 'g' }, { quantity: 0, unit: 'g' })).toEqual({
      kind: 'unknown',
      reason: 'no_pack_size',
    });
  });

  it('never returns zero packs for something the cook does not have', () => {
    // "Salt, to taste" converts to zero grams. Zero packs of salt is not a
    // basket anybody can cook from — if it is on the missing list, the answer
    // is one.
    const result = packsNeeded({ quantity: 1, unit: 'to_taste' }, { quantity: 500, unit: 'g' });
    expect(result).toMatchObject({ kind: 'known', packs: 1 });
  });
});

describe('spoon and cup measures reach the shelf', () => {
  it('turns tablespoons of oil into a bottle', () => {
    // 4 tbsp is 60 ml, against a 1 l bottle.
    const result = packsNeeded({ quantity: 4, unit: 'tbsp' }, { quantity: 1, unit: 'l' });
    expect(result).toMatchObject({ packs: 1, totalQuantity: 1, unit: 'l' });
  });

  it('turns cups of rice into kilogram bags', () => {
    // 3 cups is 720 g; a 500 g bag means two of them.
    const result = packsNeeded({ quantity: 3, unit: 'cup' }, { quantity: 500, unit: 'g' });
    expect(result).toMatchObject({ packs: 2, totalQuantity: 1000, surplusQuantity: 280 });
  });
});

describe('the required cases, exactly as specified', () => {
  /**
   * Correctness before optimisation. Every row below is a stated requirement,
   * written out one-to-one so a change to the rounding rule cannot pass by
   * satisfying the spirit of a paraphrase.
   */

  it('500 g needed, 500 g pack → buy 1', () => {
    expect(packsNeeded({ quantity: 500, unit: 'g' }, { quantity: 500, unit: 'g' })).toMatchObject({
      kind: 'known',
      packs: 1,
      surplusQuantity: 0,
    });
  });

  it('500 g needed, 450 g pack → buy 2, because the quantity must be satisfied', () => {
    // Never rounds DOWN to one. A recipe that needs 500 g and is handed 450 g
    // is a recipe that does not work, and the 50 g gap is invisible until
    // somebody is standing at a hob.
    expect(packsNeeded({ quantity: 500, unit: 'g' }, { quantity: 450, unit: 'g' })).toMatchObject({
      kind: 'known',
      packs: 2,
    });
  });

  it('500 g needed, 1 kg pack → buy 1', () => {
    expect(packsNeeded({ quantity: 500, unit: 'g' }, { quantity: 1, unit: 'kg' })).toMatchObject({
      kind: 'known',
      packs: 1,
    });
  });

  it('1.2 kg needed, 500 g pack → buy 3', () => {
    // 2.4 packs. Two is not enough; three is the answer, and the arithmetic
    // crosses a unit boundary on the way, which is where it usually breaks.
    expect(packsNeeded({ quantity: 1.2, unit: 'kg' }, { quantity: 500, unit: 'g' })).toMatchObject({
      kind: 'known',
      packs: 3,
    });
  });

  it('2 pieces needed, pack of 6 → buy 1', () => {
    expect(
      packsNeeded({ quantity: 2, unit: 'piece' }, { quantity: 6, unit: 'piece' }),
    ).toMatchObject({ kind: 'known', packs: 1, surplusQuantity: 4 });
  });

  it('unconvertible units → an explicit failure, never a guessed conversion', () => {
    // No per-piece weight, so there is no honest way to turn slices into
    // grams. Returning 1 would be a guess that costs money; returning the
    // reason lets the UI ask.
    expect(packsNeeded({ quantity: 3, unit: 'slice' }, { quantity: 500, unit: 'g' })).toEqual({
      kind: 'unknown',
      reason: 'incompatible_units',
    });
  });
});
