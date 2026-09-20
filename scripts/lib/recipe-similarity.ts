/**
 * How alike are two recipes, by what actually goes in them?
 *
 * WHAT THIS EXISTS TO CATCH: a catalogue padding itself. Two dishes sharing
 * most of their ingredients are either the same dish written twice or a
 * variant pretending to be a second recipe, and either way the count is a
 * bigger number than the catalogue deserves.
 *
 * THE BUG THIS WAS EXTRACTED TO FIX. The comparison used to run over every
 * non-optional, non-garnish line, which includes SALT and WATER. Those are the
 * two ingredients the matching engine assumes every kitchen already has, and
 * they are in the catalogue only so the line count and the instructions agree.
 * Counting them meant a recipe could be made "less similar" to another by
 * writing down the water it was already using — and that is exactly what
 * happened: adding the missing water line to `sutlac-baked` pushed it below
 * the threshold against `muhallabia`, and the suspicious-pair count fell from
 * 9 to 8. Nothing about either dish had changed. The metric had just been
 * given a way to be gamed by bookkeeping.
 *
 * So the comparison now runs over the DISTINGUISHING ingredients: what is left
 * after removing the things every kitchen is assumed to have.
 *
 * `SUGGESTED_KITCHEN_BASICS` are deliberately NOT removed. Onions, garlic,
 * cumin and tomato paste are offered during onboarding and can be unticked, so
 * they are a fact about one cook rather than about the world — and they
 * genuinely distinguish dishes. A tomato sauce with garlic and cumin is not
 * the same sauce without them.
 */
import { SUGGESTED_KITCHEN_BASICS, UNIVERSAL_BASICS } from '../../src/features/ingredients/catalogue.ts';

/** The shape this needs from a recipe, and nothing more. */
export type ComparableRecipe = {
  ingredients: readonly {
    slug: string | null;
    isOptional: boolean;
    isGarnish: boolean;
  }[];
};

/**
 * What a recipe needs that is not assumed of every kitchen.
 *
 * Optional lines and garnishes are excluded as they always were: a recipe is
 * not a different dish because somebody scattered parsley on it.
 */
export function distinguishingSlugs(recipe: ComparableRecipe): string[] {
  return recipe.ingredients
    .filter((line) => !line.isOptional && !line.isGarnish)
    .map((line) => line.slug)
    .filter((slug): slug is string => slug !== null)
    .filter((slug) => !UNIVERSAL_BASICS.has(slug));
}

/** Jaccard over the distinguishing ingredients. 1 is identical, 0 is disjoint. */
export function similarity(a: ComparableRecipe, b: ComparableRecipe): number {
  const left = new Set(distinguishingSlugs(a));
  const right = new Set(distinguishingSlugs(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const slug of left) if (right.has(slug)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/**
 * The basics that are offered rather than assumed, re-exported so a reader of
 * this file can see what is deliberately still counted.
 */
export const COUNTED_EVEN_THOUGH_COMMON: readonly string[] = SUGGESTED_KITCHEN_BASICS;
