import { INGREDIENT_CATALOGUE } from '@/features/ingredients/catalogue';
import { ingredientDisplayName } from '@/features/ingredients/display';
import { hasEasternNumerals } from '@/lib/format/numerals';

import { RECIPE_CATALOGUE } from '../catalogue.generated';
import {
  preparationLabel,
  recipeDescription,
  recipeTitle,
  stepInstruction,
  stepSafetyNote,
} from '../localise';

/**
 * WESTERN NUMERALS 0–9, IN ENGLISH AND IN ARABIC, ACROSS ALL RECIPE CONTENT.
 *
 * THE BUG THIS EXISTS FOR. The app pins its locale to `ar-EG-u-nu-latn`, so
 * every price, count and date it formats comes out Latin. Recipe prose is not
 * formatted by the app — it was typed by a person — and 356 generated lines of
 * it carried Arabic-Indic digits. The result was a single screen reading
 * «حوالي ١٥ دقيقة» in a step directly under a «15 min» chip the app had
 * rendered itself.
 *
 * The fix is at the DISPLAY boundary, not in the data, because recipes also
 * arrive from Supabase and from the AI edge function and neither passes
 * through the importer. So this walks the whole catalogue through the same
 * accessors the screens use, and asserts on what a reader would actually see.
 *
 * It is deliberately a DATA gate rather than a source-text one: a new recipe
 * written with «٥ دقائق» is fine, and this proves the boundary handles it.
 */

const LANGUAGES = ['en', 'ar'] as const;

describe('no recipe shows an Eastern numeral to a reader', () => {
  it('not in a title, in either language', () => {
    const offenders = RECIPE_CATALOGUE.flatMap((recipe) =>
      LANGUAGES.map((language) => recipeTitle(recipe, language)).filter(hasEasternNumerals),
    );
    expect(offenders).toEqual([]);
  });

  it('not in a description', () => {
    const offenders = RECIPE_CATALOGUE.flatMap((recipe) =>
      LANGUAGES.map((language) => recipeDescription(recipe, language)).filter(hasEasternNumerals),
    );
    expect(offenders).toEqual([]);
  });

  it('not in a cooking step — the 356-line case', () => {
    const offenders = RECIPE_CATALOGUE.flatMap((recipe) =>
      recipe.steps.flatMap((step) =>
        LANGUAGES.map((language) => stepInstruction(step, language)).filter(hasEasternNumerals),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('not in a safety note, where a temperature is the whole point', () => {
    const offenders = RECIPE_CATALOGUE.flatMap((recipe) =>
      recipe.steps.flatMap((step) =>
        LANGUAGES.map((language) => stepSafetyNote(step, language))
          .filter((note): note is string => note !== null)
          .filter(hasEasternNumerals),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('not in an ingredient preparation', () => {
    const offenders = RECIPE_CATALOGUE.flatMap((recipe) =>
      recipe.ingredients
        .map((ingredient) => ingredient.preparation)
        .filter((preparation): preparation is string => Boolean(preparation))
        .flatMap((preparation) =>
          LANGUAGES.map((language) => preparationLabel(preparation, language)),
        )
        .filter(hasEasternNumerals),
    );
    expect(offenders).toEqual([]);
  });

  it('not in an ingredient name', () => {
    const offenders = INGREDIENT_CATALOGUE.flatMap((ingredient) =>
      LANGUAGES.map((language) => ingredientDisplayName(ingredient.name, language)).filter(
        hasEasternNumerals,
      ),
    );
    expect(offenders).toEqual([]);
  });
});

describe('the boundary, not the data, is what was fixed', () => {
  it('still reads the numerals the authors actually typed', () => {
    // If this ever reaches zero, somebody "fixed" the numerals by editing the
    // catalogue — which leaves every recipe from Supabase and from the AI
    // still wrong, because neither goes through the importer. The gate above
    // would keep passing and the bug would be back in the paths nobody looks
    // at. So the source is EXPECTED to be full of Arabic-Indic digits.
    const stored = RECIPE_CATALOGUE.flatMap((recipe) =>
      recipe.steps.flatMap((step) =>
        [step.instructionAr, step.safetyNoteAr].filter((text): text is string => Boolean(text)),
      ),
    );
    expect(stored.filter(hasEasternNumerals).length).toBeGreaterThan(0);
  });

  it('converts a step that arrived at runtime, not through the importer', () => {
    // The Supabase and AI paths, which the importer never sees.
    const fromTheModel = {
      instruction: 'Simmer for 15 minutes.',
      instructionAr: 'سيبها على نار هادية ١٥ دقيقة.',
    };
    expect(stepInstruction(fromTheModel, 'ar')).toBe('سيبها على نار هادية 15 دقيقة.');
  });

  it('leaves the Arabic words exactly as written', () => {
    const step = { instruction: 'x', instructionAr: 'اتركها ٥ دقائق وقلّبها' };
    expect(stepInstruction(step, 'ar')).toBe('اتركها 5 دقائق وقلّبها');
  });
});
