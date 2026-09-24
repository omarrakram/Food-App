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

/**
 * THE CONTRACT IS ABOUT THE BOUNDARY, NOT ABOUT THE DATA.
 *
 * Whatever recipe text ARRIVES, what a reader SEES uses 0–9. That has to hold
 * for the bundled catalogue (above), and equally for a recipe fetched from
 * Supabase or written by the AI edge function, neither of which passes through
 * the importer — which is why the fix lives at the display boundary and not in
 * the generated file.
 *
 * These cases feed the boundary directly, so none of them depends on what the
 * bundled dataset happens to contain. Cleaning the source later changes
 * nothing here, and it should not: dirty data must never become part of the
 * contract.
 */
describe('whatever enters the boundary, Western numerals come out', () => {
  /** Stands in for a step from Supabase, from the model, or from an editor. */
  const step = (instructionAr: string) => ({ instruction: 'Simmer for 15 minutes.', instructionAr });

  it('normalises Arabic-Indic digits', () => {
    expect(stepInstruction(step('سيبها على نار هادية ١٥ دقيقة.'), 'ar')).toBe(
      'سيبها على نار هادية 15 دقيقة.',
    );
  });

  it('normalises Extended Arabic-Indic (Persian/Urdu) digits', () => {
    expect(stepInstruction(step('بگذارید ۲۰ دقیقه بماند.'), 'ar')).toBe(
      'بگذارید 20 دقیقه بماند.',
    );
  });

  it('leaves text that is ALREADY Western exactly as it is', () => {
    // The case that matters once the dataset is cleaned: normalisation must be
    // a no-op, not a second transformation.
    const clean = 'اتركها 5 دقائق وقلّبها';
    expect(stepInstruction(step(clean), 'ar')).toBe(clean);
  });

  it('changes digits and nothing else — not one Arabic letter', () => {
    const rendered = stepInstruction(step('اتركها ٥ دقائق وقلّبها'), 'ar');
    expect(rendered).toBe('اتركها 5 دقائق وقلّبها');
    // Same words, same order, same diacritics; only the numeral moved.
    expect(rendered.replace(/[0-9]/g, '#')).toBe('اتركها # دقائق وقلّبها');
  });

  it('holds for a safety note, where the number is the whole point', () => {
    const note = { safetyNote: null, safetyNoteAr: 'لازم توصل ٧٤°م قبل ما تقدّم.' };
    expect(stepSafetyNote(note, 'ar')).toBe('لازم توصل 74°م قبل ما تقدّم.');
  });

  it('holds for a title and a description too', () => {
    expect(recipeTitle({ title: 'x', titleAr: 'كشري ٢ نفر' }, 'ar')).toBe('كشري 2 نفر');
    expect(
      recipeDescription({ description: 'x', descriptionAr: 'يكفي ٤ أشخاص' }, 'ar'),
    ).toBe('يكفي 4 أشخاص');
  });

  it('holds for an ingredient name a user typed themselves', () => {
    expect(ingredientDisplayName('٢ بصلة', 'ar')).toBe('2 بصلة');
  });

  it('is idempotent, so a cleaned dataset renders identically', () => {
    const once = stepInstruction(step('سيبها ١٠ دقايق'), 'ar');
    expect(stepInstruction(step(once), 'ar')).toBe(once);
    expect(hasEasternNumerals(once)).toBe(false);
  });
});
