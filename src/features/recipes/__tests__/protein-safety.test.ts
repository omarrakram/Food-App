import { RECIPE_CATALOGUE } from '../catalogue.generated';

/**
 * Raw animal protein, and the instructions that reach a user.
 *
 * Recipe expansion started introducing more of it — liver in batch 2, whole
 * chicken proposed in the same round — and the liver recipe shipped telling
 * people it was "done the moment the pink has gone from the OUTSIDE" with a
 * centre that "should still be soft". That is both an unsafe endpoint for
 * offal and a method of judging it that cannot work: the outside of a seared
 * piece says nothing about its middle.
 *
 * A sweep of all 66 recipes containing a risk protein found that every chicken
 * recipe already carried "74°C / 165°F throughout" and every soft-egg recipe
 * but one already carried a set-whites note. The liver was the real defect and
 * the missing egg note was the other. These tests hold that line.
 *
 * This is deliberately NOT a general food-safety framework. It checks the
 * small number of things that are unambiguous.
 */

const ALL = RECIPE_CATALOGUE;
const slugsOf = (r: (typeof ALL)[number]) => r.ingredients.map((l) => l.slug ?? '');
const safetyText = (r: (typeof ALL)[number]) =>
  r.steps.map((s) => s.safetyNote ?? '').join(' ');
const stepText = (r: (typeof ALL)[number]) => r.steps.map((s) => s.instruction).join(' ');

const OFFAL = ['liver', 'duck-liver', 'chicken-liver', 'kidney', 'tongue', 'tripe', 'spleen'];
const POULTRY = [
  'chicken-breast', 'chicken-thigh', 'chicken-drumstick', 'chicken-wings',
  'whole-chicken', 'chicken-liver', 'chicken-gizzards',
];

describe('offal is never served undercooked', () => {
  it('names a cooked-through endpoint on every recipe containing offal', () => {
    const offalRecipes = ALL.filter((r) => slugsOf(r).some((s) => OFFAL.includes(s)));
    expect(offalRecipes.length).toBeGreaterThan(0);

    const missing = offalRecipes
      .filter((r) => !/71\s*°?\s*C|160\s*°?\s*F|cooked through/i.test(safetyText(r) + stepText(r)))
      .map((r) => r.slug);

    expect(missing).toEqual([]);
  });

  it('never tells a cook that the outside proves the inside', () => {
    // The exact wording that shipped, and the shape of it.
    const offenders = ALL.filter((r) =>
      /pink has gone from the outside|no longer pink on the outside|outside is no longer pink/i.test(
        stepText(r),
      ),
    ).map((r) => r.slug);

    expect(offenders).toEqual([]);
  });

  it('pins the recipe that caused this', () => {
    const kebda = ALL.find((r) => r.slug === 'kebda-eskandarani');
    expect(kebda).toBeDefined();
    expect(safetyText(kebda!)).toMatch(/71\s*°C/);
    expect(stepText(kebda!)).toMatch(/no pink left anywhere/i);

    // And the dish is the dish again: vinegar and green chilli are what make
    // it Alexandrian rather than plain fried liver.
    const slugs = slugsOf(kebda!);
    expect(slugs).toContain('vinegar');
    expect(slugs).toContain('chili-pepper');
    expect(slugs).toContain('cumin');
  });
});

describe('poultry states a safe endpoint', () => {
  it('carries the temperature on every chicken recipe', () => {
    const poultry = ALL.filter((r) => slugsOf(r).some((s) => POULTRY.includes(s)));
    expect(poultry.length).toBeGreaterThan(10);

    const missing = poultry
      .filter((r) => !/7[45]\s*°?\s*C|165\s*°?\s*F/i.test(safetyText(r)))
      .map((r) => r.slug);

    expect(missing).toEqual([]);
  });
});

describe('a runny yolk says so', () => {
  it('warns wherever the instructions leave the yolk soft', () => {
    const soft = ALL.filter(
      (r) =>
        slugsOf(r).includes('eggs') &&
        /yolks? still (?:move|wobble|run)|runny yolk|soft-boiled/i.test(stepText(r)),
    );
    expect(soft.length).toBeGreaterThan(0);

    const unwarned = soft
      .filter((r) => !/whites? (?:are|is) (?:completely )?set|runny yolks are not/i.test(safetyText(r)))
      .map((r) => r.slug);

    expect(unwarned).toEqual([]);
  });
});
