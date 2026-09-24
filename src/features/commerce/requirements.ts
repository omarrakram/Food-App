import type { IngredientMatch } from '@/types/domain';

import type { RequirementAmount, SourcingLine } from './ports';

/**
 * Turning "YOU NEED" into something a shop can be asked for.
 *
 * `RecipeMatch.missingIngredients` is already the right SET — it excludes
 * optional lines, garnishes, pantry staples and anything the cook has. What it
 * needed was the AMOUNT, which `IngredientMatch` used to drop; it now carries
 * `slug`, `quantity` and `unit` straight off the recipe line, so this module
 * is a translation and never a second source of truth for quantities.
 *
 * Nothing here guesses. An ingredient with no canonical slug is reported as
 * unsourceable rather than matched on its name, and an amount the recipe did
 * not give is labelled as missing rather than defaulted to one.
 */

export const UNSOURCEABLE_REASONS = [
  /**
   * No canonical slug, so there is nothing to look a product up by.
   *
   * Only happens for an AI-proposed ingredient the catalogue never
   * canonicalised. Matching it on its display name would mean buying whatever
   * a fuzzy string search turned up, which is precisely the failure the
   * canonical layer exists to prevent.
   */
  'no_canonical_ingredient',
] as const;
export type UnsourceableReason = (typeof UNSOURCEABLE_REASONS)[number];

export type UnsourceableRequirement = {
  readonly name: string;
  readonly reason: UnsourceableReason;
  /** The caller's handle for the row, so a screen can annotate it in place. */
  readonly requestLineId: string | null;
};

export type RequirementsResult = {
  readonly lines: readonly SourcingLine[];
  /** Still shown in the recipe; simply cannot be bought. */
  readonly unsourceable: readonly UnsourceableRequirement[];
};

/**
 * How much of this the cook actually has to buy.
 *
 * TODAY THIS IS THE FULL RECIPE AMOUNT, and that is a deliberate limitation
 * rather than an oversight.
 *
 * Sourcing a DEFICIT — "the recipe wants 500 g, you have 200 g, buy 300 g" —
 * requires pantry quantities that can be trusted, and this app does not have
 * them yet. Four reasons, any one of which is enough:
 *
 *   1. `AvailabilityIndex` is a set of NAMES. Availability is a boolean by
 *      ingredient, and there is nowhere in it for an amount to live.
 *   2. `PantryItem.quantity` is read in exactly one place, as `<= 0` meaning
 *      "used up". It is a presence flag, not a measure.
 *   3. The pantry editor leaves quantity blank by default, so most rows have
 *      none at all.
 *   4. Nothing decrements a pantry quantity when somebody cooks, so even an
 *      entered number is a claim about the past.
 *
 * And a fifth that would survive fixing the other four: a pantry row reading
 * "1 pack" cannot be subtracted from "500 g" without a pack weight nobody
 * recorded.
 *
 * Inventing a deficit from any of that would mean under-buying, which is the
 * one error the cook only discovers with a pan already hot. Buying the full
 * amount is over-cautious and honest.
 *
 * NOTHING STRUCTURAL BLOCKS THE DEFICIT. `SourcingLine` takes a quantity; the
 * day pantry amounts are trustworthy, the caller passes a smaller one and the
 * pack maths, ranking and cart are unchanged.
 */
function amountFor(match: IngredientMatch): {
  quantity: number | null;
  unit: SourcingLine['unit'];
  amount: RequirementAmount;
} {
  // "To taste" is a real unit in this catalogue, and it means the cook needs
  // SOME. It is not zero, and it is not a number — labelling it lets the UI
  // say "you'll need some" and stops the pack maths pretending otherwise.
  if (match.unit === 'to_taste') {
    return { quantity: null, unit: null, amount: 'to_taste' };
  }

  if (match.quantity === null || match.unit === null) {
    return { quantity: null, unit: null, amount: 'unspecified' };
  }

  return { quantity: match.quantity, unit: match.unit, amount: 'measured' };
}

/**
 * The missing ingredients of one recipe, as sourcing lines.
 *
 * Pass `RecipeMatch.missingIngredients` directly. It has already dropped the
 * optional lines, the garnishes, the staples and everything the cook has, so
 * there is no second filter here — duplicating that rule is how the two
 * would eventually disagree about what counts as missing.
 */
export function requirementsFor(
  missing: readonly IngredientMatch[],
  sourceRecipeId: string | null,
): RequirementsResult {
  const lines: SourcingLine[] = [];
  const unsourceable: UnsourceableRequirement[] = [];

  for (const match of missing) {
    if (!match.slug) {
      unsourceable.push({
        name: match.name,
        reason: 'no_canonical_ingredient',
        requestLineId: match.recipeIngredientId,
      });
      continue;
    }

    const { quantity, unit, amount } = amountFor(match);
    lines.push({
      ingredientSlug: match.slug,
      quantity,
      unit,
      amount,
      sourceRecipeId,
      // The recipe row this came from. Carried so the screen can put the
      // product under the ingredient it belongs to rather than guessing from
      // the slug, which is not unique within a recipe.
      requestLineId: match.recipeIngredientId,
    });
  }

  return { lines, unsourceable };
}
