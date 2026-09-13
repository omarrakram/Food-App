import { INGREDIENT_CATALOGUE } from '@/features/ingredients/catalogue';
import { resolveIngredient } from '@/features/ingredients/matching';
import { normaliseIngredientName } from '@/features/ingredients/normalise';
import type { Allergen, DietFlag, DietaryPreference, Recipe } from '@/types/domain';

/**
 * The checks that exist to keep someone safe or to honour a commitment they
 * have made about what they eat.
 *
 * Separated from ranking because they are categorically different: these
 * REMOVE a recipe and are never traded off against a score. Separated from
 * `filter.ts` so both the filter and the older ranking entry point can use
 * them without importing each other.
 */

// --- Hard constraints ------------------------------------------------------

/**
 * Diets that forbid whole ingredient categories. A recipe qualifies either by
 * carrying the tag explicitly or by containing no forbidden ingredient.
 */
const DIET_FORBIDDEN_TAGS: Partial<Record<DietaryPreference, Allergen[]>> = {
  vegan: ['dairy', 'eggs', 'fish', 'shellfish'],
  vegetarian: ['fish', 'shellfish'],
};

/**
 * Catalogue proteins that are not animal flesh.
 *
 * The ONLY hand-maintained list here, and it is the safe direction to
 * maintain by hand: forgetting to add one makes a vegan dish look non-vegan,
 * which is a missing result rather than a broken promise.
 */
const PLANT_PROTEIN_SLUGS: ReadonlySet<string> = new Set([
  'eggs',
  'egg-white',
  'egg-yolk',
  'tofu',
  'chickpeas',
  'lentils',
  'green-lentils',
  'split-peas',
  'white-beans',
  'kidney-beans',
  'black-eyed-peas',
  'fava-beans',
  'soybeans',
  'edamame',
  'falafel-mix',
]);

/**
 * Seafood, derived from the catalogue's own allergen tagging.
 *
 * Every fish carries the `fish` allergen and every shellfish the `shellfish`
 * one, so the catalogue already knows this and there is nothing to keep in
 * step by hand.
 */
const SEAFOOD_SLUGS: ReadonlySet<string> = new Set(
  INGREDIENT_CATALOGUE.filter(
    (entry) => entry.allergens.includes('fish') || entry.allergens.includes('shellfish'),
  ).map((entry) => entry.slug),
);

/**
 * Meat, derived from the catalogue rather than listed.
 *
 * This USED to be six hard-coded slugs written when the catalogue had
 * fourteen recipes in it. Adding beef steak, lamb, veal, turkey, duck and the
 * rest to the ingredient catalogue silently made every one of them vegan as
 * far as this check was concerned — a vegan user would have been shown a beef
 * stir-fry. Deriving it means a new protein is covered the moment it is
 * added.
 */
const MEAT_SLUGS: ReadonlySet<string> = new Set(
  INGREDIENT_CATALOGUE.filter(
    (entry) =>
      entry.category === 'protein' &&
      !PLANT_PROTEIN_SLUGS.has(entry.slug) &&
      !SEAFOOD_SLUGS.has(entry.slug),
  ).map((entry) => entry.slug),
);

function recipeIngredientSlugs(recipe: Recipe): Set<string> {
  const slugs = new Set<string>();
  for (const ingredient of recipe.ingredients) {
    const resolved = resolveIngredient(ingredient.name);
    if (resolved) slugs.add(resolved.slug);
  }
  return slugs;
}

/**
 * ALLERGY SAFETY: a declared allergen is an absolute exclusion.
 *
 * We check both the recipe's declared allergen list and the allergens implied
 * by its ingredients, so a mis-tagged recipe still gets caught. We never reason
 * about "only a trace" or "they could substitute".
 */
export function violatesAllergens(recipe: Recipe, allergens: readonly Allergen[]): boolean {
  if (allergens.length === 0) return false;
  const declared = new Set<Allergen>(recipe.allergens);
  for (const ingredient of recipe.ingredients) {
    const resolved = resolveIngredient(ingredient.name);
    resolved?.allergens.forEach((allergen) => declared.add(allergen));
  }
  return allergens.some((allergen) => declared.has(allergen));
}

export function satisfiesDiet(recipe: Recipe, diet: DietaryPreference): boolean {
  if (diet === 'none' || diet === 'other') return true;
  if (recipe.dietTags.includes(diet)) return true;

  const slugs = recipeIngredientSlugs(recipe);
  const forbiddenAllergens = DIET_FORBIDDEN_TAGS[diet] ?? [];

  const hasForbiddenAllergen = forbiddenAllergens.some((allergen) =>
    recipe.allergens.includes(allergen),
  );

  switch (diet) {
    case 'vegan':
    case 'vegetarian': {
      const hasMeat = [...slugs].some((slug) => MEAT_SLUGS.has(slug));
      const hasSeafood = [...slugs].some((slug) => SEAFOOD_SLUGS.has(slug));
      return !hasMeat && !hasSeafood && !hasForbiddenAllergen;
    }
    case 'pescatarian':
      return ![...slugs].some((slug) => MEAT_SLUGS.has(slug));
    case 'halal':
      // Our curated set contains no pork or alcohol; an untagged recipe from
      // the model is treated as not-yet-verified rather than assumed halal.
      return recipe.dietTags.includes('halal') || recipe.source === 'curated';
    case 'keto':
      return (recipe.nutrition.carbsGrams ?? 999) <= 25;
    default:
      return true;
  }
}

/**
 * Diet flags are checked on top of the eating style, not instead of it.
 *
 * Each flag is its own constraint, so a halal keto user must satisfy both —
 * previously only one diet value could be held at a time, and choosing "halal"
 * silently discarded "vegetarian".
 */
export function satisfiesDietFlags(recipe: Recipe, flags: readonly DietFlag[]): boolean {
  return flags.every((flag) => satisfiesDiet(recipe, flag));
}

/** A recipe the user has no way to cook is not a suggestion. */
export function canCookWithAppliances(recipe: Recipe, appliances: readonly string[]): boolean {
  if (appliances.length === 0) return true;
  return recipe.requiredAppliances.every((required) => appliances.includes(required));
}

/** Soft preference, applied as a filter only when the user was explicit. */
export function containsDislikedIngredient(recipe: Recipe, disliked: readonly string[]): boolean {
  if (disliked.length === 0) return false;
  const dislikedKeys = new Set(disliked.map(normaliseIngredientName).filter(Boolean));
  return recipe.ingredients.some((ingredient) => {
    if (ingredient.isOptional) return false;
    const resolved = resolveIngredient(ingredient.name);
    const key = resolved
      ? normaliseIngredientName(resolved.name)
      : normaliseIngredientName(ingredient.name);
    return dislikedKeys.has(key);
  });
}
