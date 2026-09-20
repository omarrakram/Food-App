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

  it('never offers colour as a substitute for the thermometer', () => {
    // STAGE 3P.3. Both the liver and the whole chicken kept a second, softer
    // endpoint alongside the temperature — "cut the thickest piece open and
    // look", "with no thermometer, check there is no pink meat and no red at
    // the bone", "any juice running clear". Each of those states appears well
    // BELOW the safe temperature, so a recipe that names 71°C and then offers
    // a way to skip measuring has not really named an endpoint at all.
    //
    // The temperature may be the only proof. Texture and colour may still be
    // described, but as doneness and quality, never introduced by "if you have
    // no thermometer".
    const risky = ALL.filter((r) =>
      slugsOf(r).some((s) => OFFAL.includes(s) || POULTRY.includes(s) || s === 'eggs'),
    );
    expect(risky.length).toBeGreaterThan(10);

    const offenders = risky
      .filter((r) => {
        const text = `${safetyText(r)} ${stepText(r)}`;
        return (
          /(?:with|if you have|without) no thermometer|if you (?:do not|don't) have a thermometer/i.test(
            text,
          ) && !/use pasteurised egg|use pasteurized egg/i.test(text)
        );
      })
      .map((r) => r.slug);

    expect(offenders).toEqual([]);
  });

  it('pins the recipe that caused this', () => {
    const kebda = ALL.find((r) => r.slug === 'kebda-eskandarani');
    expect(kebda).toBeDefined();
    expect(safetyText(kebda!)).toMatch(/71\s*°C/);
    // Was `/no pink left anywhere/i`. Stage 3P.2 replaced "the outside looks
    // done" with "cut it open and look for pink", which is better but still a
    // colour test, and colour appears well below a safe temperature. Stage
    // 3P.3 moved the proof to the thermometer and the step now says to measure.
    expect(stepText(kebda!)).toMatch(/measure the thickest one/i);

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

describe('egg cooked into a dish names a temperature, not a duration', () => {
  /**
   * STAGE 3P.3. `avgolemono` used to say: hold it below a simmer until it
   * coats a spoon, and "if you are cooking for someone pregnant, elderly or
   * immunocompromised, keep it at that gentle heat for three full minutes".
   *
   * Three minutes of unspecified "gentle heat" is not a control. It reads as
   * a precaution and establishes nothing — the same three minutes at 60°C and
   * at 80°C are different dishes and different risks, and the people the
   * sentence singles out are exactly the ones for whom guessing is worst.
   *
   * The fix was not to add alarm. The endpoint was already reachable: egg
   * thickens a broth at roughly the temperature that makes it safe, so the
   * recipe names 71°C / 160°F and says what happens either side of it.
   */
  const EGG_THICKENED = ['avgolemono'];

  it.each(EGG_THICKENED)('%s names the temperature the egg has to reach', (slug) => {
    const recipe = ALL.find((r) => r.slug === slug);
    expect(recipe).toBeDefined();

    const safety = safetyText(recipe!);
    expect(safety).toMatch(/71\s*°C/);
    expect(safety).toMatch(/160\s*°F/);
    // And an alternative for a kitchen with no thermometer that is a real
    // control rather than a timer.
    expect(safety).toMatch(/pasteuri[sz]ed egg/i);
  });

  it.each(EGG_THICKENED)('%s does not sell a bare hold time as safety', (slug) => {
    const recipe = ALL.find((r) => r.slug === slug);
    // Either clause order: the sentence that shipped named the people first
    // and the duration second, and a regex that only caught the other order
    // passed against the exact wording it was written to reject.
    const text = `${safetyText(recipe!)} ${stepText(recipe!)}`;
    const RISK_GROUP = /pregnant|elderly|immunocompromised/i;
    const BARE_HOLD = /(?:two|three|four|five|ten|\d+)\s+(?:full\s+)?minutes?/i;
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      expect({
        sentence,
        sellsATimerToTheVulnerable: RISK_GROUP.test(sentence) && BARE_HOLD.test(sentence),
      }).toEqual({ sentence, sellsATimerToTheVulnerable: false });
    }
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
