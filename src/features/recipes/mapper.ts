import type {
  RecipeIngredientRow,
  RecipeRow,
  RecipeStepRow,
} from '@/lib/supabase/database.types';
import type {
  Allergen,
  Appliance,
  DietaryPreference,
  MealType,
  Recipe,
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
  id, slug, title, description, image_url, source, cuisine, difficulty,
  prep_minutes, cook_minutes, base_servings,
  calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public, created_at, updated_at,
  recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order),
  recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs),
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

function toIngredient(row: RecipeIngredientRow): RecipeIngredient {
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    preparation: row.preparation,
    isOptional: row.is_optional,
    sortOrder: row.sort_order,
  };
}

function toStep(row: RecipeStepRow): RecipeStep {
  return {
    id: row.id,
    stepNumber: row.step_number,
    instruction: row.instruction,
    durationMinutes: row.duration_minutes,
    ingredientRefs: row.ingredient_refs ?? [],
    safetyNote: row.safety_note,
  };
}

export function rowsToRecipe(row: RecipeQueryRow): Recipe {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
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
