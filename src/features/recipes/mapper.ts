import type { RecipeIngredientRow, RecipeRow, RecipeStepRow } from '@/lib/supabase/database.types';
import type {
  Allergen,
  Appliance,
  DietaryPreference,
  MealType,
  Recipe,
  RecipeImageMeta,
  RecipeIngredient,
  RecipeStep,
} from '@/types/domain';

/**
 * Maps Postgres rows onto the domain `Recipe`.
 *
 * A recipe is spread across eight tables; `RECIPE_SELECT` is the one place the
 * embedded-resource select string is written, so every query that needs a full
 * recipe fetches the same shape and the mapper never sees a missing relation.
 */

export const RECIPE_SELECT = `
  id, slug, title, title_ar, description, description_ar, image_url, source, cuisine, difficulty,
  image_path, image_source, image_creator, image_license, image_attribution, image_source_url,
  prep_minutes, cook_minutes, base_servings,
  calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public, created_at, updated_at,
  recipe_ingredients (id, recipe_id, ingredient_id, slug, name, quantity, unit, preparation, is_optional, is_garnish, is_pantry_staple, notes, sort_order),
  recipe_steps (id, recipe_id, step_number, instruction, instruction_ar, duration_minutes, safety_note, safety_note_ar, ingredient_refs),
  recipe_meal_types (meal_type),
  recipe_diet_tags (diet),
  recipe_allergens (allergen),
  recipe_appliances (appliance),
  recipe_tags (tag)
`;

export type RecipeQueryRow = RecipeRow & {
  recipe_ingredients: RecipeIngredientRow[] | null;
  recipe_steps: RecipeStepRow[] | null;
  recipe_meal_types: { meal_type: MealType }[] | null;
  recipe_diet_tags: { diet: DietaryPreference }[] | null;
  recipe_allergens: { allergen: Allergen }[] | null;
  recipe_appliances: { appliance: Appliance }[] | null;
  recipe_tags: { tag: string }[] | null;
};

/**
 * Image provenance, or null when the row carries no photograph.
 *
 * `image_path` is the discriminator: the migration's check constraint makes a
 * path without a source and a licence impossible, so one test covers all six
 * columns.
 */
function toImage(row: RecipeRow): RecipeImageMeta | null {
  if (!row.image_path) return null;
  return {
    path: row.image_path,
    source: row.image_source ?? 'owned',
    creator: row.image_creator,
    license: row.image_license ?? 'proprietary',
    attribution: row.image_attribution,
    sourceUrl: row.image_source_url,
  };
}

function toIngredient(row: RecipeIngredientRow): RecipeIngredient {
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    slug: row.slug,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    preparation: row.preparation,
    isOptional: row.is_optional,
    isGarnish: row.is_garnish,
    isPantryStaple: row.is_pantry_staple,
    notes: row.notes,
    sortOrder: row.sort_order,
  };
}

function toStep(row: RecipeStepRow): RecipeStep {
  return {
    id: row.id,
    stepNumber: row.step_number,
    instruction: row.instruction,
    instructionAr: row.instruction_ar,
    durationMinutes: row.duration_minutes,
    ingredientRefs: row.ingredient_refs ?? [],
    safetyNote: row.safety_note,
    safetyNoteAr: row.safety_note_ar,
  };
}

export function rowsToRecipe(row: RecipeQueryRow): Recipe {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    titleAr: row.title_ar,
    description: row.description,
    descriptionAr: row.description_ar,
    imageUrl: row.image_url,
    image: toImage(row),
    source: row.source,
    cuisine: row.cuisine,
    mealTypes: (row.recipe_meal_types ?? []).map((entry) => entry.meal_type),
    difficulty: row.difficulty,
    prepMinutes: row.prep_minutes,
    cookMinutes: row.cook_minutes,
    baseServings: row.base_servings,
    nutrition: {
      calories: row.calories,
      proteinGrams: row.protein_g,
      carbsGrams: row.carbs_g,
      fatGrams: row.fat_g,
      fiberGrams: row.fiber_g,
    },
    ingredients: (row.recipe_ingredients ?? [])
      .map(toIngredient)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    steps: (row.recipe_steps ?? []).map(toStep).sort((a, b) => a.stepNumber - b.stepNumber),
    allergens: (row.recipe_allergens ?? []).map((entry) => entry.allergen),
    dietTags: (row.recipe_diet_tags ?? []).map((entry) => entry.diet),
    requiredAppliances: (row.recipe_appliances ?? []).map((entry) => entry.appliance),
    tags: (row.recipe_tags ?? []).map((entry) => entry.tag),
    createdAt: row.created_at,
  };
}
