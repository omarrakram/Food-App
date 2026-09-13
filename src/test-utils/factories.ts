import type { Recipe, RecipeIngredient, RecipeStep } from '@/types/domain';

/**
 * Builders for domain objects in tests.
 *
 * Exists so that adding a field to `Recipe` is a one-line change here rather
 * than an edit to forty object literals across the suite — and so a test that
 * cares about two fields says so, instead of restating the other twenty.
 */

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`;

export function makeRecipeIngredient(
  overrides: Partial<RecipeIngredient> = {},
): RecipeIngredient {
  return {
    id: nextId('ingredient'),
    ingredientId: null,
    slug: null,
    name: 'tomatoes',
    quantity: 1,
    unit: null,
    preparation: null,
    isOptional: false,
    isGarnish: false,
    isPantryStaple: false,
    notes: null,
    sortOrder: 1,
    ...overrides,
  };
}

export function makeRecipeStep(overrides: Partial<RecipeStep> = {}): RecipeStep {
  return {
    id: nextId('step'),
    stepNumber: 1,
    instruction: 'Cook it.',
    instructionAr: 'اطبخه.',
    durationMinutes: null,
    ingredientRefs: [],
    safetyNote: null,
    safetyNoteAr: null,
    ...overrides,
  };
}

export function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: nextId('recipe'),
    slug: 'test-recipe',
    title: 'Test recipe',
    titleAr: 'وصفة اختبار',
    description: '',
    descriptionAr: '',
    imageUrl: null,
    image: null,
    source: 'curated',
    cuisine: 'egyptian',
    mealTypes: ['dinner'],
    difficulty: 'easy',
    prepMinutes: 5,
    cookMinutes: 10,
    baseServings: 2,
    nutrition: {
      calories: 400,
      proteinGrams: 20,
      carbsGrams: 40,
      fatGrams: 15,
      fiberGrams: 5,
    },
    ingredients: [],
    steps: [],
    allergens: [],
    dietTags: [],
    requiredAppliances: [],
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Shorthand for the common "a recipe made of these ingredient names" case. */
export function makeRecipeWithIngredients(
  names: readonly (string | Partial<RecipeIngredient>)[],
  overrides: Partial<Recipe> = {},
): Recipe {
  return makeRecipe({
    ingredients: names.map((entry, index) =>
      makeRecipeIngredient(
        typeof entry === 'string'
          ? { name: entry, sortOrder: index + 1 }
          : { sortOrder: index + 1, ...entry },
      ),
    ),
    ...overrides,
  });
}
