import { resolveIngredient } from '@/features/ingredients/matching';
import { money } from '@/lib/format/money';
import type {
  CountryCode,
  EstimateCompleteness,
  CurrencyCode,
  PricedAmount,
  Recipe,
  RecipeIngredient,
  Unit,
} from '@/types/domain';

import { priceBookFor, type PriceBook, type PriceQuote } from './price-book';
import { perPieceWeightFor, scaleQuantity, toGrams, type PerPieceWeight } from './units';

/**
 * The budget engine.
 *
 * PRODUCT RULE: the model may propose recipes, but software calculates what
 * they cost. Nothing here asks an LLM for a price, and every figure produced
 * is tagged `source: 'estimate'` so the UI can never present it as a receipt.
 */

export type IngredientCostLine = {
  ingredientId: string;
  name: string;
  /** Null when we have no price data for this ingredient. */
  amountMinor: number | null;
  lowMinor: number | null;
  highMinor: number | null;
  /** True when the quantity could not be converted and we billed a whole unit. */
  isApproximate: boolean;
  isOptional: boolean;
};

/** The part of a recipe's cost the cook still has to go out and buy. */
export type ShoppingPortion = {
  totalMinor: number;
  lowMinor: number;
  highMinor: number;
  /** Items they need but we cannot price. */
  unpricedCount: number;
  completeness: EstimateCompleteness;
  /** How many required ingredients they already have. */
  ownedCount: number;
};

export type RecipeCostEstimate = {
  currency: CurrencyCode;
  /** Total for `servings`, excluding optional ingredients. */
  totalMinor: number;
  lowMinor: number;
  highMinor: number;
  perServingMinor: number;
  lines: IngredientCostLine[];
  /** Ingredients we had no price for; the total understates by this much. */
  unpricedCount: number;
  /** Share of required ingredients we could price, 0–1. */
  coverage: number;
  /**
   * Whether the total is a finished figure. `partial` means real ingredients
   * are missing from it; `unavailable` means we priced nothing at all.
   */
  completeness: EstimateCompleteness;
  /**
   * Cost of only the ingredients the cook lacks. Null when no pantry
   * information was supplied — absent is not the same as "you own nothing".
   */
  toBuy: ShoppingPortion | null;
  lastUpdated: string;
};

/**
 * Classifies a total by how much of it we could price.
 *
 * A recipe whose every line is genuinely free ("salt to taste") is complete at
 * zero — that is a real answer. A recipe we simply have no data for is not.
 */
export function completenessOf(pricedCount: number, totalCount: number): EstimateCompleteness {
  if (totalCount === 0) return 'complete';
  if (pricedCount === 0) return 'unavailable';
  return pricedCount === totalCount ? 'complete' : 'partial';
}

/**
 * Cost of one recipe ingredient at a given serving count.
 *
 * Strategy:
 *   1. Convert the recipe amount and the quoted amount to grams and take the
 *      ratio. This handles "300g rice" priced "per 1 kg".
 *   2. If either side is not convertible (e.g. "1 can" of tuna priced per can),
 *      fall back to a direct unit ratio when the units agree.
 *   3. Otherwise bill one whole quoted unit and flag the line approximate,
 *      which over-states rather than silently under-states the budget.
 */
export function costOfIngredient(
  ingredient: Pick<RecipeIngredient, 'quantity' | 'unit' | 'name'>,
  quote: PriceQuote,
  perPiece: PerPieceWeight | null,
): { amountMinor: number; lowMinor: number; highMinor: number; isApproximate: boolean } {
  const quantity = ingredient.quantity;
  const unit: Unit | null = ingredient.unit;

  const scaleFrom = (ratio: number, approximate: boolean) => ({
    amountMinor: Math.round(quote.amountMinor * ratio),
    lowMinor: Math.round(quote.lowMinor * ratio),
    highMinor: Math.round(quote.highMinor * ratio),
    isApproximate: approximate,
  });

  if (quantity === null || unit === null || unit === 'to_taste') {
    // "Salt to taste" costs a rounding error; billing a whole kilo would wreck
    // the estimate. Treat it as free but never as missing data.
    return { amountMinor: 0, lowMinor: 0, highMinor: 0, isApproximate: true };
  }

  const neededGrams = toGrams(quantity, unit, perPiece);
  const quotedGrams = toGrams(quote.quantity, quote.unit, perPiece);

  if (neededGrams !== null && quotedGrams !== null && quotedGrams > 0) {
    return scaleFrom(neededGrams / quotedGrams, false);
  }

  if (unit === quote.unit && quote.quantity > 0) {
    return scaleFrom(quantity / quote.quantity, false);
  }

  return scaleFrom(1, true);
}

export type EstimateOptions = {
  servings?: number;
  country?: CountryCode;
  currency?: CurrencyCode;
  /** Override for tests or a future live provider. */
  priceBook?: PriceBook;
  /** Include ingredients marked optional. Default false. */
  includeOptional?: boolean;
  /**
   * Recipe-ingredient ids the cook already has. Supplying this produces the
   * `toBuy` breakdown; omitting it leaves `toBuy` null rather than pretending
   * the pantry is empty.
   */
  ownedIngredientIds?: Iterable<string>;
};

/**
 * Things a recipe measures but nobody buys.
 *
 * Tap water is an ingredient — it is measured, it is required, and it belongs
 * on the ingredient list so the line count and the instructions agree. It is
 * not a PURCHASE. Counting it as an unpriced line dropped koshari's coverage
 * from 100% to 90% and would have put "water" at the top of the price-survey
 * backlog with 33 recipes behind it.
 *
 * Excluded rather than priced at zero, because a zero in the price book is a
 * surveyed claim and this is a statement about shopping, not about cost.
 */
const NOT_BOUGHT = new Set(['water']);

function isNotBought(ingredientName: string): boolean {
  return NOT_BOUGHT.has(resolveIngredient(ingredientName)?.slug ?? '');
}

export function estimateRecipeCost(
  recipe: Pick<Recipe, 'ingredients' | 'baseServings'>,
  options: EstimateOptions = {},
): RecipeCostEstimate {
  const country = options.country ?? 'EG';
  const currency = options.currency ?? 'EGP';
  const book = options.priceBook ?? priceBookFor(country, currency);
  const servings = options.servings ?? recipe.baseServings;
  const includeOptional = options.includeOptional ?? false;

  const considered = recipe.ingredients
    .filter((ingredient) => includeOptional || !ingredient.isOptional)
    .filter((ingredient) => !isNotBought(ingredient.name));

  const lines: IngredientCostLine[] = considered.map((ingredient) => {
    const quote = book.quote(ingredient.name);
    const catalogueEntry = resolveIngredient(ingredient.name);

    if (!quote) {
      return {
        ingredientId: ingredient.id,
        name: ingredient.name,
        amountMinor: null,
        lowMinor: null,
        highMinor: null,
        isApproximate: false,
        isOptional: ingredient.isOptional,
      };
    }

    const scaledQuantity = scaleQuantity(ingredient.quantity, recipe.baseServings, servings);
    const cost = costOfIngredient(
      { ...ingredient, quantity: scaledQuantity },
      quote,
      perPieceWeightFor(catalogueEntry, quote.unit),
    );

    return {
      ingredientId: ingredient.id,
      name: ingredient.name,
      amountMinor: cost.amountMinor,
      lowMinor: cost.lowMinor,
      highMinor: cost.highMinor,
      isApproximate: cost.isApproximate,
      isOptional: ingredient.isOptional,
    };
  });

  const priced = lines.filter((line) => line.amountMinor !== null);
  const totalMinor = priced.reduce((sum, line) => sum + (line.amountMinor ?? 0), 0);
  const lowMinor = priced.reduce((sum, line) => sum + (line.lowMinor ?? 0), 0);
  const highMinor = priced.reduce((sum, line) => sum + (line.highMinor ?? 0), 0);

  const owned = options.ownedIngredientIds ? new Set(options.ownedIngredientIds) : null;
  const toBuy = owned ? shoppingPortion(lines, owned) : null;

  return {
    currency,
    totalMinor,
    lowMinor,
    highMinor,
    perServingMinor: servings > 0 ? Math.round(totalMinor / servings) : totalMinor,
    lines,
    unpricedCount: lines.length - priced.length,
    coverage: lines.length === 0 ? 1 : priced.length / lines.length,
    completeness: completenessOf(priced.length, lines.length),
    toBuy,
    lastUpdated: book.lastUpdated,
  };
}

/**
 * Narrows a cost to the lines the cook does not already have.
 *
 * "I have 150 EGP" is a question about what leaves their wallet, not about
 * what the dish is worth. When we know the pantry, the honest answer is the
 * cost of the gaps.
 */
function shoppingPortion(
  lines: readonly IngredientCostLine[],
  ownedIds: ReadonlySet<string>,
): ShoppingPortion {
  const needed = lines.filter((line) => !ownedIds.has(line.ingredientId));
  const pricedNeeded = needed.filter((line) => line.amountMinor !== null);

  return {
    totalMinor: pricedNeeded.reduce((sum, line) => sum + (line.amountMinor ?? 0), 0),
    lowMinor: pricedNeeded.reduce((sum, line) => sum + (line.lowMinor ?? 0), 0),
    highMinor: pricedNeeded.reduce((sum, line) => sum + (line.highMinor ?? 0), 0),
    unpricedCount: needed.length - pricedNeeded.length,
    completeness: completenessOf(pricedNeeded.length, needed.length),
    ownedCount: lines.length - needed.length,
  };
}

/**
 * Wraps an estimate as a `PricedAmount`, which is the only shape the UI is
 * allowed to render a price from. `source` is hard-coded to `'estimate'` here:
 * a live price can only be produced by a grocery provider.
 */
export function toPricedAmount(estimate: RecipeCostEstimate): PricedAmount {
  return {
    money: money(estimate.totalMinor, estimate.currency),
    source: 'estimate',
    lastUpdated: estimate.lastUpdated,
    isFallback: estimate.coverage < 1,
    completeness: estimate.completeness,
    unpricedCount: estimate.unpricedCount,
  };
}

/**
 * The figure a budget question should actually be answered with.
 *
 * Falls back to the full recipe cost when no pantry information was supplied,
 * because an unknown pantry must not be read as an empty one.
 */
export function toSpendAmount(estimate: RecipeCostEstimate): PricedAmount {
  const portion = estimate.toBuy;
  if (!portion) return toPricedAmount(estimate);

  return {
    money: money(portion.totalMinor, estimate.currency),
    source: 'estimate',
    lastUpdated: estimate.lastUpdated,
    isFallback: portion.completeness !== 'complete',
    completeness: portion.completeness,
    unpricedCount: portion.unpricedCount,
  };
}

export type BudgetVerdict = 'within' | 'slightly_over' | 'over' | 'unknown';

/** Tolerance band for "slightly over" — 15% above the stated budget. */
export const BUDGET_TOLERANCE = 0.15;

/**
 * Whether a recipe fits a budget.
 *
 * The completeness argument is what keeps this honest. An incomplete total is
 * a floor: the real figure can only be higher. So "over" remains safe to
 * assert on partial data — adding the missing prices cannot bring it back
 * under — while "within" never is, and becomes `unknown` instead.
 *
 * Callers that pass no completeness are asserting the total is finished.
 */
export function budgetVerdict(
  totalMinor: number,
  budgetMinor: number,
  completeness: EstimateCompleteness = 'complete',
): BudgetVerdict {
  if (budgetMinor <= 0) return 'within';

  if (completeness !== 'complete') {
    return totalMinor > budgetMinor ? 'over' : 'unknown';
  }

  if (totalMinor <= budgetMinor) return 'within';
  if (totalMinor <= budgetMinor * (1 + BUDGET_TOLERANCE)) return 'slightly_over';
  return 'over';
}
