import { resolveIngredient } from '@/features/ingredients/matching';

import { RECIPE_FIXTURES } from '../fixtures';
import {
  KNOWN_PREPARATIONS,
  preparationLabel,
  recipeDescription,
  recipeTitle,
  stepInstruction,
  stepSafetyNote,
} from '../localise';

/**
 * Arabic completeness of the FOOD, not just the chrome.
 *
 * The locale parity test only sees the translation dictionary, which is why
 * the app could report 468/468 keys translated while an Arabic reader was
 * handed "Koshari — Egypt in a bowl: rice, lentils and pasta" and a recipe
 * written entirely in English. Recipe content lives in fixtures and the
 * database, so it needs its own check.
 */
const ARABIC = /[؀-ۿ]/;

describe('curated recipes are readable in Arabic', () => {
  it('has a real Arabic title and description for every recipe', () => {
    const untranslated = RECIPE_FIXTURES.filter(
      (recipe) => !ARABIC.test(recipe.titleAr ?? '') || !ARABIC.test(recipe.descriptionAr ?? ''),
    ).map((recipe) => recipe.slug);

    expect(untranslated).toEqual([]);
  });

  it('has a real Arabic instruction for every step', () => {
    const untranslated = RECIPE_FIXTURES.flatMap((recipe) =>
      recipe.steps
        .filter((step) => !ARABIC.test(step.instructionAr ?? ''))
        .map((step) => `${recipe.slug} step ${step.stepNumber}`),
    );

    expect(untranslated).toEqual([]);
  });

  it('translates every safety note it has', () => {
    // SAFETY-CRITICAL: a step that carries a temperature or a handling warning
    // in English must carry it in Arabic too. Silently dropping it would be
    // worse than not having one.
    const untranslated = RECIPE_FIXTURES.flatMap((recipe) =>
      recipe.steps
        .filter((step) => step.safetyNote && !ARABIC.test(step.safetyNoteAr ?? ''))
        .map((step) => `${recipe.slug} step ${step.stepNumber}`),
    );

    expect(untranslated).toEqual([]);
  });

  it('keeps the temperatures in the Arabic safety notes', () => {
    // A translation that loses "74°C" loses the instruction. Arabic writes the
    // same number in Arabic-Indic digits with م / ف for the scale, so this
    // transliterates before comparing rather than asking for Latin numerals.
    const arabicIndic = (value: string) =>
      value
        .replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]!)
        .replace(/C|F/, (unit) => (unit === 'C' ? 'م' : 'ف'));

    for (const recipe of RECIPE_FIXTURES) {
      for (const step of recipe.steps) {
        if (!step.safetyNote) continue;
        for (const temperature of step.safetyNote.match(/\d+°[CF]/g) ?? []) {
          expect(step.safetyNoteAr ?? '').toContain(arabicIndic(temperature));
        }
      }
    }
  });

  it('names every ingredient with something the catalogue can translate', () => {
    // Ingredient names are not stored per recipe in Arabic — the catalogue
    // already carries nameAr for all of them — so a recipe that invents a name
    // the catalogue does not know would render in English forever.
    const unresolved = RECIPE_FIXTURES.flatMap((recipe) =>
      recipe.ingredients
        .filter((ingredient) => !resolveIngredient(ingredient.name)?.nameAr)
        .map((ingredient) => `${recipe.slug}: ${ingredient.name}`),
    );

    expect(unresolved).toEqual([]);
  });

  it('knows every preparation phrase the recipes use', () => {
    const unknown = [
      ...new Set(
        RECIPE_FIXTURES.flatMap((recipe) =>
          recipe.ingredients
            .map((ingredient) => ingredient.preparation)
            .filter((preparation): preparation is string => Boolean(preparation))
            .filter((preparation) => !KNOWN_PREPARATIONS.includes(preparation.toLowerCase())),
        ),
      ),
    ];

    expect(unknown).toEqual([]);
  });
});

describe('falling back', () => {
  const generated = {
    title: 'Model recipe',
    titleAr: null,
    description: 'Whatever the model wrote',
    descriptionAr: null,
  };

  it('shows the English text when there is no Arabic', () => {
    // AI recipes arrive in one language and are never machine-translated.
    expect(recipeTitle(generated, 'ar')).toBe('Model recipe');
    expect(recipeDescription(generated, 'ar')).toBe('Whatever the model wrote');
    expect(preparationLabel('something new', 'ar')).toBe('something new');
  });

  it('never reaches for the Arabic field in English', () => {
    const recipe = RECIPE_FIXTURES[0]!;
    expect(recipeTitle(recipe, 'en')).toBe(recipe.title);
    expect(stepInstruction(recipe.steps[0]!, 'en')).toBe(recipe.steps[0]!.instruction);
  });

  it('reads the Arabic field in Arabic', () => {
    const recipe = RECIPE_FIXTURES[0]!;
    expect(recipeTitle(recipe, 'ar')).toBe('كشري');
    expect(stepInstruction(recipe.steps[0]!, 'ar')).toBe(recipe.steps[0]!.instructionAr);
    expect(preparationLabel('finely chopped', 'ar')).toBe('مفروم ناعم');
  });

  it('leaves a missing safety note missing rather than inventing one', () => {
    expect(stepSafetyNote({ safetyNote: null, safetyNoteAr: null }, 'ar')).toBeNull();
  });
});
