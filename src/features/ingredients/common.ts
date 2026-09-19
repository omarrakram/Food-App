import { RECIPE_CATALOGUE } from '@/features/recipes/catalogue.generated';

import { INGREDIENTS_BY_SLUG, UNIVERSAL_BASICS } from './catalogue';

/**
 * The ingredients worth offering before anyone types anything.
 *
 * FIRST ATTEMPT, and why it was wrong: the catalogue already flags 47
 * ingredients with `isCommonStaple`, so the picker took the first eighteen of
 * them. That flag carries no ordering, and the catalogue is authored
 * alphabetically, so the "common ingredients" a user was offered opened with
 * anise, baking powder, bay leaf, caraway, cardamom and clove. Every one of
 * those IS a common staple. None of them is what somebody standing at a fridge
 * wants to tap first.
 *
 * So this ranks by how many recipes actually call for an ingredient, counted
 * across the real catalogue. That is a better proxy for two things at once:
 * what a kitchen is likely to hold, and what will actually unlock results if
 * the user taps it.
 *
 * UNIVERSAL BASICS ARE EXCLUDED. The product already assumes those are present
 * — that is what makes them universal — so offering them would ask the user to
 * confirm something the engine never doubted, and ticking them would change
 * nothing about the results.
 */
function rankByRecipeUsage(): string[] {
  const counts = new Map<string, number>();

  for (const recipe of RECIPE_CATALOGUE) {
    // Per recipe, not per line: a recipe using onion twice is still one vote.
    const seen = new Set<string>();
    for (const ingredient of recipe.ingredients) {
      if (ingredient.isOptional || ingredient.isGarnish) continue;
      // A recipe ingredient may carry no slug when the catalogue does not
      // recognise it; those cannot be offered as a tappable suggestion.
      const { slug } = ingredient;
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([slug]) => !UNIVERSAL_BASICS.has(slug) && INGREDIENTS_BY_SLUG.has(slug))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([slug]) => INGREDIENTS_BY_SLUG.get(slug)!.name);
}

/** Computed once at module load; the catalogue is static. */
export const COMMON_INGREDIENT_NAMES: readonly string[] = rankByRecipeUsage();
