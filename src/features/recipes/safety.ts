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

/**
 * Animal products that no other column can see.
 *
 * Vegan and vegetarian are inferred from three signals — meat, seafood, and
 * the dairy and eggs allergens — and honey answers "no" to all three. So a
 * recipe of flour, yeast, sugar, oil and honey passed as vegan, which is how
 * lokmet el qadi was very nearly offered to a vegan user. The catalogue had no
 * such recipe until one was written, so nothing had ever exposed it.
 *
 * Gelatin is the same shape and worse: it fails vegetarian too.
 *
 * Deliberately a short, explicit list rather than a category rule. Every entry
 * is an ingredient whose animal origin is not recoverable from any other
 * column, and a rule broad enough to catch them by category would also catch
 * things that are fine. `stock-cube` is NOT here: it is genuinely ambiguous in
 * an Egyptian kitchen — vegetable and chicken sit on the same shelf — and
 * guessing either way would be worse than the honest gap.
 */
const NON_VEGAN_SLUGS: ReadonlySet<string> = new Set(['honey', 'honeycomb', 'gelatin']);

/** The subset that a vegetarian must also avoid. */
const NON_VEGETARIAN_SLUGS: ReadonlySet<string> = new Set(['gelatin']);

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
 * We check the recipe's declared allergen list, the allergens implied by its
 * ingredients, AND the allergens a commercial version of an ingredient may
 * contain. We never reason about "only a trace" or "they could substitute".
 *
 * WHY `possibleAllergens` EXCLUDES AS HARD AS `allergens`. Generic corn flakes
 * are made of corn, but mainstream Egyptian brands add barley malt. The two
 * fields disagree about what the food IS; they do not disagree about what to
 * do for someone with coeliac disease. Asking that person to read the label of
 * an ingredient we already knew was risky is not a safety model, it is a
 * disclaimer — so the exclusion is identical and only the MEANING differs.
 *
 * That difference is why `satisfiesDiet` below must not read this: a product
 * that sometimes contains dairy is not intrinsically non-vegan.
 */
export function violatesAllergens(recipe: Recipe, allergens: readonly Allergen[]): boolean {
  if (allergens.length === 0) return false;
  const declared = new Set<Allergen>(recipe.allergens);
  for (const ingredient of recipe.ingredients) {
    const resolved = resolveIngredient(ingredient.name);
    resolved?.allergens.forEach((allergen) => declared.add(allergen));
    resolved?.possibleAllergens.forEach((allergen) => declared.add(allergen));
  }
  return allergens.some((allergen) => declared.has(allergen));
}

/**
 * Allergens this recipe may carry depending on which brand was bought.
 *
 * Separate from `violatesAllergens` on purpose: that answers "hide this", and
 * this answers "say this". A recipe using generic corn flakes should be able
 * to tell a reader that the gluten depends on the box, without the recipe
 * declaring that it CONTAINS gluten — which would be a claim about the food
 * rather than about the shelf.
 */
export function possibleAllergensOf(recipe: Recipe): Allergen[] {
  const intrinsic = new Set<Allergen>(recipe.allergens);
  const possible = new Set<Allergen>();
  for (const ingredient of recipe.ingredients) {
    const resolved = resolveIngredient(ingredient.name);
    resolved?.allergens.forEach((allergen) => intrinsic.add(allergen));
    resolved?.possibleAllergens.forEach((allergen) => possible.add(allergen));
  }
  // Anything the recipe certainly contains is not a "maybe".
  return [...possible].filter((allergen) => !intrinsic.has(allergen)).sort();
}

/**
 * Diet semantics read INTRINSIC allergens only.
 *
 * `possibleAllergens` is deliberately absent from everything below. A burger
 * patty that may contain rusk is not thereby non-vegetarian, and corn flakes
 * that may contain barley malt are still vegan. Letting "may" drive a diet
 * flag would mean the label on one brand decides what a food fundamentally is.
 */
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
      const hidden = diet === 'vegan' ? NON_VEGAN_SLUGS : NON_VEGETARIAN_SLUGS;
      const hasHiddenAnimalProduct = [...slugs].some((slug) => hidden.has(slug));
      return !hasMeat && !hasSeafood && !hasForbiddenAllergen && !hasHiddenAnimalProduct;
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
