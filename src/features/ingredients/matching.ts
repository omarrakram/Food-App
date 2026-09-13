import type {
  Allergen,
  IngredientMatch,
  PantryItem,
  Recipe,
  RecipeIngredient,
} from '@/types/domain';

import { INGREDIENT_CATALOGUE, isAssumedOnHand, type CatalogueIngredient } from './catalogue';
import { freshnessOf } from './freshness';
import { normaliseIngredientName, similarityScore } from './normalise';

/**
 * Deterministic ingredient matching.
 *
 * The model proposes recipes; this module decides what the user actually has.
 * Keeping the decision here (rather than asking the model "do they have it?")
 * means the match percentage is reproducible, explainable, and free.
 */

/** normalised name/alias -> catalogue entry. Built once at module load. */
const ALIAS_INDEX: Map<string, CatalogueIngredient> = (() => {
  const index = new Map<string, CatalogueIngredient>();
  for (const ingredient of INGREDIENT_CATALOGUE) {
    const keys = [ingredient.name, ingredient.slug.replace(/-/g, ' '), ...ingredient.aliases];
    for (const key of keys) {
      const normalised = normaliseIngredientName(key);
      // First writer wins: catalogue order defines precedence for shared
      // aliases (e.g. "chicken" resolves to chicken breast, not thighs).
      if (normalised && !index.has(normalised)) index.set(normalised, ingredient);
    }
    // Arabic name is indexed separately since normalisation differs.
    const arabicKey = normaliseIngredientName(ingredient.nameAr);
    if (arabicKey && !index.has(arabicKey)) index.set(arabicKey, ingredient);
  }
  return index;
})();

/** Resolves free text to a known ingredient, or null if we do not recognise it. */
export function resolveIngredient(raw: string): CatalogueIngredient | null {
  const normalised = normaliseIngredientName(raw);
  if (!normalised) return null;
  return ALIAS_INDEX.get(normalised) ?? null;
}

/** Autocomplete suggestions, best first. */
export function searchIngredients(query: string, limit = 8): CatalogueIngredient[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const scored = INGREDIENT_CATALOGUE.map((ingredient) => {
    const candidates = [ingredient.name, ingredient.nameAr, ...ingredient.aliases];
    const best = candidates.reduce((max, candidate) => {
      const score = similarityScore(trimmed, candidate);
      return score > max ? score : max;
    }, 0);
    return { ingredient, score: best };
  })
    .filter((entry) => entry.score > 0.25)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((entry) => entry.ingredient);
}

/** Every allergen implied by a set of ingredient names. */
export function allergensForNames(names: readonly string[]): Allergen[] {
  const found = new Set<Allergen>();
  for (const name of names) {
    const resolved = resolveIngredient(name);
    resolved?.allergens.forEach((allergen) => found.add(allergen));
  }
  return [...found];
}

export type AvailabilityOptions = {
  /**
   * Treat salt/pepper/oil-type ingredients as present even if not listed.
   * True by default: asking a user to add "salt" to their pantry is friction
   * with no payoff. Users see these marked "assumed" in the recipe detail.
   */
  assumeCommonStaples?: boolean;
  /** Reference time, injectable for deterministic tests. */
  now?: Date;
};

export type AvailabilityIndex = {
  /** Normalised names the user has. */
  available: Set<string>;
  /** Normalised names deliberately excluded because they are past their date. */
  expired: Set<string>;
  /** Normalised names covered only by the staple assumption. */
  assumedStaples: Set<string>;
  /** Pantry item ids keyed by normalised name, for "uses expiring items". */
  itemIdByName: Map<string, string>;
  /** Names that are expiring soon — recipes using them get ranked up. */
  expiringSoon: Set<string>;
};

/**
 * Builds the lookup used to decide, for each recipe ingredient, whether the
 * user has it. Handles pantry items, ad-hoc typed ingredients, expiry
 * exclusion and staple assumptions in one pass.
 */
export function buildAvailabilityIndex(
  pantryItems: readonly PantryItem[],
  typedIngredients: readonly string[] = [],
  options: AvailabilityOptions = {},
): AvailabilityIndex {
  const { assumeCommonStaples = true, now = new Date() } = options;

  const available = new Set<string>();
  const expired = new Set<string>();
  const assumedStaples = new Set<string>();
  const expiringSoon = new Set<string>();
  const itemIdByName = new Map<string, string>();

  const addName = (raw: string) => {
    const resolved = resolveIngredient(raw);
    const key = resolved ? normaliseIngredientName(resolved.name) : normaliseIngredientName(raw);
    if (key) available.add(key);
    return key;
  };

  // Explicitly typed ingredients are always trusted — the user is telling us
  // what is in front of them right now.
  const typedKeys = new Set<string>();
  for (const typed of typedIngredients) {
    const key = addName(typed);
    if (key) typedKeys.add(key);
  }

  for (const item of pantryItems) {
    const status = freshnessOf(item.expiresOn, now);
    const resolved = resolveIngredient(item.ingredientName);
    const key = resolved
      ? normaliseIngredientName(resolved.name)
      : normaliseIngredientName(item.ingredientName);
    if (!key) continue;

    if (status === 'expired') {
      // FOOD SAFETY: an out-of-date pantry row contributes nothing, and we
      // remember why so the UI can explain the absence.
      //
      // Unless the user has just told us otherwise. Typing "milk" into the
      // picker is a statement about what is in front of them now, and it
      // outranks a row they last touched a fortnight ago — so the row is not
      // recorded as expired either. What must never happen is the state this
      // branch used to allow: the same ingredient counted as available AND
      // reported as expired, which is two contradictory answers to one
      // question and made the food-safety rule unenforceable.
      if (!typedKeys.has(key)) expired.add(key);
      continue;
    }

    available.add(key);
    itemIdByName.set(key, item.id);
    if (status === 'expiring_soon' || status === 'expires_today') expiringSoon.add(key);
  }

  if (assumeCommonStaples) {
    for (const ingredient of INGREDIENT_CATALOGUE) {
      // `isAssumedOnHand`, NOT `isCommonStaple`. The difference is the whole
      // bug: the staple flag is a pantry-UI convenience that marks rice,
      // pasta, potatoes, onions, lentils and flour as cupboard items, and
      // assuming those made three recipes cookable from an empty kitchen —
      // which then matched every search, whatever the user had selected.
      //
      // FOOD SAFETY / HONESTY is still the other half: never assume a
      // perishable. `isAssumedOnHand` refuses those outright.
      if (!isAssumedOnHand(ingredient)) continue;
      const key = normaliseIngredientName(ingredient.name);
      // Something the user has explicitly marked expired stays excluded.
      if (available.has(key) || expired.has(key)) continue;
      available.add(key);
      assumedStaples.add(key);
    }
  }

  return { available, expired, assumedStaples, itemIdByName, expiringSoon };
}

/**
 * Is this line something the cook actually has to go and get?
 *
 * THE ONE DEFINITION OF "NEEDED". It used to exist twice: the filter excluded
 * optional lines, garnishes and pantry staples, while the match counted only
 * optional ones — so a recipe admitted into an "allow one missing" search
 * displayed "2 missing" on its card, because the card was counting a garnish.
 * Two numbers for one question, and the one the user could see was the wrong
 * one.
 *
 * Garnishes and pantry staples are excluded for the same reason optional lines
 * are: nobody considers themselves unable to cook because they are out of
 * parsley to scatter on top, and telling them they are is how a results screen
 * loses their trust.
 */
export function isNeededLine(line: Pick<RecipeIngredient, 'isOptional' | 'isGarnish' | 'isPantryStaple'>): boolean {
  return !line.isOptional && !line.isGarnish && !line.isPantryStaple;
}

function matchOne(
  recipeIngredient: RecipeIngredient,
  index: AvailabilityIndex,
): IngredientMatch {
  const resolved = resolveIngredient(recipeIngredient.name);
  const key = resolved
    ? normaliseIngredientName(resolved.name)
    : normaliseIngredientName(recipeIngredient.name);

  if (index.expired.has(key)) {
    return {
      recipeIngredientId: recipeIngredient.id,
      name: recipeIngredient.name,
      isAvailable: false,
      matchedVia: null,
      excludedReason: 'expired',
      isOptional: !isNeededLine(recipeIngredient),
    };
  }

  const isAvailable = index.available.has(key);
  const matchedVia: IngredientMatch['matchedVia'] = !isAvailable
    ? null
    : index.assumedStaples.has(key)
      ? 'assumed_staple'
      : resolved && normaliseIngredientName(recipeIngredient.name) !== key
        ? 'alias'
        : 'exact';

  return {
    recipeIngredientId: recipeIngredient.id,
    name: recipeIngredient.name,
    isAvailable,
    matchedVia,
    excludedReason: null,
    // `isOptional` on a MATCH means "not something they must go and buy",
    // which is the union of optional, garnish and pantry staple — not the
    // recipe line's own `isOptional` flag alone.
    isOptional: !isNeededLine(recipeIngredient),
  };
}

export type MatchResult = {
  matchPercent: number;
  haveCount: number;
  requiredCount: number;
  matches: IngredientMatch[];
  availableIngredients: IngredientMatch[];
  missingIngredients: IngredientMatch[];
  /** Pantry item ids the recipe would consume before they expire. */
  usesExpiringItems: string[];
};

/**
 * Scores a recipe against an availability index.
 *
 * Optional ingredients are excluded from the denominator so a recipe is not
 * punished for listing a garnish. A recipe with no required ingredients scores
 * 100 rather than dividing by zero.
 */
export function matchRecipeIngredients(
  recipe: Pick<Recipe, 'ingredients'>,
  index: AvailabilityIndex,
): MatchResult {
  const matches = recipe.ingredients.map((ingredient) => matchOne(ingredient, index));
  const required = matches.filter((match) => !match.isOptional);
  const haveCount = required.filter((match) => match.isAvailable).length;
  const requiredCount = required.length;

  const usesExpiringItems: string[] = [];
  for (const ingredient of recipe.ingredients) {
    const resolved = resolveIngredient(ingredient.name);
    const key = resolved
      ? normaliseIngredientName(resolved.name)
      : normaliseIngredientName(ingredient.name);
    if (index.expiringSoon.has(key)) {
      const itemId = index.itemIdByName.get(key);
      if (itemId) usesExpiringItems.push(itemId);
    }
  }

  return {
    matchPercent: requiredCount === 0 ? 100 : Math.round((haveCount / requiredCount) * 100),
    haveCount,
    requiredCount,
    matches,
    availableIngredients: matches.filter((match) => match.isAvailable),
    missingIngredients: matches.filter((match) => !match.isAvailable && !match.isOptional),
    usesExpiringItems,
  };
}
