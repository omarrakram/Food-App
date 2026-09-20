import type {
  Allergen,
  IngredientMatch,
  PantryItem,
  Recipe,
  RecipeIngredient,
} from '@/types/domain';

import { INGREDIENT_CATALOGUE, isUniversalBasic, type CatalogueIngredient } from './catalogue.ts';
import { familyFor } from './families.ts';
import { freshnessOf } from './freshness.ts';
import { normaliseIngredientName, similarityScore, withinEditDistance } from './normalise.ts';

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
      // First writer wins, so catalogue order breaks any tie. That tiebreak
      // is alphabetical and arbitrary, and it must never be what decides a
      // question of meaning: `chicken` used to resolve to chicken breast for
      // no better reason than that `chicken-breast` sorts before
      // `chicken-thigh`. A word that names more than one ingredient belongs
      // to none of them — see the chicken-cut tests in `matching.test.ts`.
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

/**
 * The ingredients a family word covers, or an empty list for anything else.
 *
 * A family word names a SET — `chicken` is seven rows, not one — and the
 * reasoning, the curated vocabulary and the inferred rule all live in
 * `./families`. This function owns only the part that needs the alias index:
 * the precedence.
 *
 * RESOLUTION WINS. A term that names one ingredient exactly is not a family
 * word, whatever else it might look like, so `milk` stays milk rather than
 * becoming every milk in the shop.
 *
 * Deliberately NOT consulted by pantry matching. Owning "chicken" is a claim
 * about one specific thing in a fridge, and a claim that vague is the bug this
 * whole milestone removed. A family narrows a search; it never fills a pantry.
 */
export function ingredientFamily(raw: string): readonly CatalogueIngredient[] {
  const normalised = normaliseIngredientName(raw);
  if (!normalised) return [];
  if (ALIAS_INDEX.has(normalised)) return [];
  return familyFor(normalised);
}

/** Autocomplete suggestions, best first. */
/**
 * How good a match is, as a rank rather than a blended number.
 *
 * WHY TIERS AND NOT A SCORE. Every name an ingredient answers to used to be
 * thrown into one pool and the best fuzzy score won. That is why typing "to"
 * offered garlic, apples and pickles: their Egyptian transliterations are
 * `toum`, `tofah` and `torshi`, so all three are genuine prefix matches and
 * scored the same as `tomatoes`. Nothing was broken — the ranking simply had
 * no way to say that a match on an ingredient's OWN NAME beats a match on one
 * of its nicknames.
 *
 * Higher wins. The gaps are deliberate: no amount of within-tier advantage can
 * lift an alias hit above a canonical one.
 */
const TIER = {
  exactCanonical: 100,
  exactAlias: 90,
  canonicalPrefix: 80,
  aliasPrefix: 70,
  canonicalTokenPrefix: 60,
  aliasTokenPrefix: 50,
  canonicalSubstring: 40,
  aliasSubstring: 30,
  fuzzy: 10,
} as const;

/** The tier a single candidate string earns, or 0 for no match at all. */
function tierFor(query: string, candidate: string, canonical: boolean): number {
  const q = normaliseIngredientName(query);
  const c = normaliseIngredientName(candidate);
  if (!q || !c) return 0;

  if (c === q) return canonical ? TIER.exactCanonical : TIER.exactAlias;
  if (c.startsWith(q)) return canonical ? TIER.canonicalPrefix : TIER.aliasPrefix;
  if (c.split(' ').some((token) => token.startsWith(q))) {
    return canonical ? TIER.canonicalTokenPrefix : TIER.aliasTokenPrefix;
  }
  if (c.includes(q)) return canonical ? TIER.canonicalSubstring : TIER.aliasSubstring;
  return 0;
}

/**
 * Below this, a typo-tolerant match is more likely to be noise than help.
 * "to" fuzzily resembles a great many things; "tomatos" resembles one.
 */
const MIN_FUZZY_QUERY = 4;

/**
 * Typo tolerance, only ever consulted as a last resort.
 *
 * The budget scales with the query because a one-character slip in a
 * four-letter word is most of it, and being generous there turns autocomplete
 * into a random ingredient generator. Seven characters in, a slip is a slip.
 */
function fuzzyScore(query: string, candidate: string): number {
  const q = normaliseIngredientName(query);
  const c = normaliseIngredientName(candidate);
  if (q.length < MIN_FUZZY_QUERY || !c) return 0;

  const budget = q.length >= 7 ? 2 : 1;
  if (withinEditDistance(q, c, budget)) return 1 - Math.abs(q.length - c.length) / 100;

  // A slip inside one word of a longer name — "chiken breast".
  for (const token of c.split(' ')) {
    if (token.length >= MIN_FUZZY_QUERY && withinEditDistance(q, token, budget)) return 0.5;
  }

  // Falls back to the shared token-overlap band, which catches a reordered or
  // partially-typed multi-word name.
  const score = similarityScore(q, c);
  return score > 0 && score < 0.7 ? score * 0.4 : 0;
}

/**
 * Ingredients matching a typed query, best first.
 *
 * Deterministic: same query, same order, every time. Within a tier the shorter
 * name wins — it is the tighter match on the same evidence — and ties break
 * alphabetically rather than on catalogue order, so adding an ingredient
 * cannot silently reshuffle an unrelated search.
 */
export function searchIngredients(query: string, limit = 8): CatalogueIngredient[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const scored = INGREDIENT_CATALOGUE.map((ingredient) => {
    // The ingredient's own names in both languages are canonical. Everything
    // else it answers to is an alias.
    let tier = Math.max(
      tierFor(trimmed, ingredient.name, true),
      tierFor(trimmed, ingredient.nameAr, true),
    );
    let matched = ingredient.name;

    for (const alias of ingredient.aliases) {
      const aliasTier = tierFor(trimmed, alias, false);
      if (aliasTier > tier) {
        tier = aliasTier;
        matched = alias;
      }
    }

    if (tier === 0) {
      const fuzzy = [ingredient.name, ingredient.nameAr, ...ingredient.aliases].reduce(
        (best, candidate) => Math.max(best, fuzzyScore(trimmed, candidate)),
        0,
      );
      if (fuzzy > 0) return { ingredient, tier: TIER.fuzzy, fuzzy, matched: ingredient.name };
    }

    return { ingredient, tier, fuzzy: 0, matched };
  }).filter((entry) => entry.tier > 0);

  // A confident match anywhere means the guesses are noise. Someone who has
  // typed something the catalogue recognises does not want to be shown what it
  // might have meant instead.
  const best = scored.reduce((max, entry) => Math.max(max, entry.tier), 0);
  const candidates =
    best >= TIER.canonicalTokenPrefix ? scored.filter((entry) => entry.tier > TIER.fuzzy) : scored;

  candidates.sort(
    (a, b) =>
      b.tier - a.tier ||
      b.fuzzy - a.fuzzy ||
      a.matched.length - b.matched.length ||
      a.ingredient.name.localeCompare(b.ingredient.name),
  );

  return candidates.slice(0, limit).map((entry) => entry.ingredient);
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
   * Assume water and salt. Nothing else — see `isUniversalBasic`.
   * True by default; tests turn it off to reason about a bare kitchen.
   */
  assumeUniversalBasics?: boolean;
  /**
   * Ingredient names THIS USER said they always have.
   *
   * The difference from the universal basics is who decided. These came from
   * a screen the user looked at and can change, so the app can answer "why
   * does it think I have onions?" with "because you said so, here".
   */
  alwaysAvailable?: readonly string[];
  /** Reference time, injectable for deterministic tests. */
  now?: Date;
};

/** Where an available ingredient came from. Drives what the UI is allowed to say. */
export type AvailabilitySource = 'pantry' | 'typed' | 'user_staple' | 'universal_basic';

export type AvailabilityIndex = {
  /** Normalised names the user has. */
  available: Set<string>;
  /** Normalised names deliberately excluded because they are past their date. */
  expired: Set<string>;
  /** Normalised names covered only by the two universal basics. */
  assumedStaples: Set<string>;
  /** Why each available name counts. The UI must never claim more than this. */
  sourceByName: Map<string, AvailabilitySource>;
  /** Names in the pantry that are present but used up. */
  outOfStock: Set<string>;
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
  const { assumeUniversalBasics = true, alwaysAvailable = [], now = new Date() } = options;

  const available = new Set<string>();
  const expired = new Set<string>();
  const assumedStaples = new Set<string>();
  const expiringSoon = new Set<string>();
  const outOfStock = new Set<string>();
  const itemIdByName = new Map<string, string>();
  const sourceByName = new Map<string, AvailabilitySource>();

  const addName = (raw: string, source: AvailabilitySource) => {
    const resolved = resolveIngredient(raw);
    const key = resolved ? normaliseIngredientName(resolved.name) : normaliseIngredientName(raw);
    if (key) {
      available.add(key);
      // First source wins, and they are added strongest-first: something the
      // user typed is better evidence than something they configured months
      // ago, which is better evidence than an assumption we made for them.
      if (!sourceByName.has(key)) sourceByName.set(key, source);
    }
    return key;
  };

  // Explicitly typed ingredients are always trusted — the user is telling us
  // what is in front of them right now.
  const typedKeys = new Set<string>();
  for (const typed of typedIngredients) {
    const key = addName(typed, 'typed');
    if (key) typedKeys.add(key);
  }

  for (const item of pantryItems) {
    const status = freshnessOf(item.expiresOn, now);
    const resolved = resolveIngredient(item.ingredientName);
    const key = resolved
      ? normaliseIngredientName(resolved.name)
      : normaliseIngredientName(item.ingredientName);
    if (!key) continue;

    // ZERO IS NOT SOME. A row that exists because the user bought it once and
    // has since finished it is not an ingredient they have, and "assume I
    // always have this" does not conjure any back. The flag means the row does
    // not need a quantity or a date to keep counting — it does not mean the
    // quantity and the date stop applying when they are there.
    if (item.quantity !== null && item.quantity <= 0) {
      if (!typedKeys.has(key)) outOfStock.add(key);
      continue;
    }

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
    if (!sourceByName.has(key)) {
      sourceByName.set(key, item.isStaple ? 'user_staple' : 'pantry');
    }
    itemIdByName.set(key, item.id);
    if (status === 'expiring_soon' || status === 'expires_today') expiringSoon.add(key);
  }

  // What this user said they always have. An explicit, editable choice, so it
  // is availability like any other — but it never overrides a pantry row that
  // says the thing is expired or finished.
  for (const name of alwaysAvailable) {
    const resolved = resolveIngredient(name);
    const key = resolved ? normaliseIngredientName(resolved.name) : normaliseIngredientName(name);
    if (!key || expired.has(key) || outOfStock.has(key)) continue;
    addName(name, 'user_staple');
  }

  if (assumeUniversalBasics) {
    for (const ingredient of INGREDIENT_CATALOGUE) {
      // Water and salt. NOT `isCommonStaple`, which is a pantry-UI convenience
      // marking forty-seven cupboard items, and not the longer list this used
      // to carry — onions, garlic, stock, tomato paste, oil, every spice —
      // which told a user with rice and tomatoes that they had six of the
      // seven things Tomato Rice needs. They had two.
      if (!isUniversalBasic(ingredient)) continue;
      const key = normaliseIngredientName(ingredient.name);
      // Anything the user has said is expired or finished stays that way.
      if (available.has(key) || expired.has(key) || outOfStock.has(key)) continue;
      available.add(key);
      assumedStaples.add(key);
      sourceByName.set(key, 'universal_basic');
    }
  }

  return { available, expired, assumedStaples, outOfStock, sourceByName, itemIdByName, expiringSoon };
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

  if (index.expired.has(key) || index.outOfStock.has(key)) {
    return {
      recipeIngredientId: recipeIngredient.id,
      name: recipeIngredient.name,
      isAvailable: false,
      matchedVia: null,
      availableVia: null,
      excludedReason: index.expired.has(key) ? 'expired' : 'out_of_stock',
      isOptional: !isNeededLine(recipeIngredient),
    };
  }

  const isAvailable = index.available.has(key);
  const matchedVia: IngredientMatch['matchedVia'] = !isAvailable
    ? null
    : resolved && normaliseIngredientName(recipeIngredient.name) !== key
      ? 'alias'
      : 'exact';

  return {
    recipeIngredientId: recipeIngredient.id,
    name: recipeIngredient.name,
    isAvailable,
    matchedVia,
    availableVia: isAvailable ? (index.sourceByName.get(key) ?? 'pantry') : null,
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
