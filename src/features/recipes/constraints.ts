import { ingredientFamily, isNeededLine, resolveIngredient } from '@/features/ingredients/matching';
import { normaliseIngredientName } from '@/features/ingredients/normalise';
import type {
  Allergen,
  Appliance,
  CountryCode,
  Cuisine,
  CurrencyCode,
  DietFlag,
  EatingStyle,
  MealType,
  Recipe,
  RecipeIngredient,
  SkillLevel,
} from '@/types/domain';

/**
 * What the user asked for, in one shape.
 *
 * Every surface that narrows the catalogue — "cook with what I have", the
 * budget flow, Discover, natural-language search, the saved preferences — ends
 * up here. One model, because the alternative is five filters that each
 * honour a slightly different subset of the user's requirements, which is
 * exactly how "no bell pepper" ends up returning a recipe with bell pepper.
 *
 * The split that matters is HARD vs SOFT:
 *
 *   HARD constraints REMOVE a recipe. They are never traded off, never
 *   down-weighted, and never quietly relaxed to fill a page.
 *   SOFT preferences only change the ORDER of what survived.
 *
 * If nothing survives, the answer is "nothing matches all of this", plus an
 * offer to relax specific non-safety constraints — never a page of results
 * that ignore one of them.
 */

// --- Ingredient restrictions -----------------------------------------------

/**
 * Why an ingredient is unwanted. The severity decides whether it can ever be
 * overridden, so it is part of the data rather than a flag at the call site.
 */
export const RESTRICTION_SEVERITIES = ['allergy', 'hard_avoid', 'dislike'] as const;
export type RestrictionSeverity = (typeof RESTRICTION_SEVERITIES)[number];

export type IngredientRestriction = {
  /** Canonical catalogue slug when the ingredient is known to us. */
  slug: string | null;
  /** What to show the user — their words, or the catalogue's. */
  label: string;
  severity: RestrictionSeverity;
};

/** An allergy or a hard avoid can never be overridden to fill a results page. */
export function isAbsolute(restriction: IngredientRestriction): boolean {
  return restriction.severity === 'allergy' || restriction.severity === 'hard_avoid';
}

/**
 * Turns free text into a restriction, resolving it to a canonical slug when we
 * recognise it.
 *
 * Resolving matters more here than anywhere else in the app: a user who types
 * "bell pepper" must also exclude capsicum, red pepper and «فلفل ألوان», and
 * the only thing that knows those are the same food is the catalogue.
 */
export function toRestriction(
  input: string,
  severity: RestrictionSeverity,
): IngredientRestriction | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const resolved = resolveIngredient(trimmed);
  return { slug: resolved?.slug ?? null, label: resolved?.name ?? trimmed, severity };
}

// --- The model -------------------------------------------------------------

/**
 * How strictly the user's kitchen limits the results.
 *
 * `strict` is the honest answer to "what can I cook right now": every
 * essential ingredient is on hand and nothing is missing. `partial` admits a
 * BOUNDED number of gaps — see `maxMissingIngredients` — and the UI says how
 * many. `off` ignores the kitchen entirely, which is what Discover wants.
 *
 * `partial` used to mean "apply no kitchen constraint at all", which is why
 * it returned the same twenty top-ranked recipes for every possible input.
 * A mode that ignores the thing it is named after is not a relaxation of it.
 */
export const PANTRY_MODES = ['off', 'partial', 'strict'] as const;
export type PantryMode = (typeof PANTRY_MODES)[number];

/** How many gaps `partial` tolerates when the caller does not say. */
export const DEFAULT_MAX_MISSING = 2;

/** The gap budget a mode implies. `null` means "do not check the kitchen". */
export function missingBudgetFor(
  mode: PantryMode,
  explicit: number | null = null,
): number | null {
  if (mode === 'off') return null;
  if (mode === 'strict') return 0;
  return explicit ?? DEFAULT_MAX_MISSING;
}

export type RecipeConstraints = {
  // --- Hard: safety and identity -----------------------------------------
  /** SAFETY-CRITICAL. Absolute exclusions, never relaxable. */
  allergens: Allergen[];
  /** Exclusive eating style. */
  eatingStyle: EatingStyle;
  /** Independent flags, checked on top of the style. */
  dietFlags: DietFlag[];
  /** Foods to keep out, each with its own severity. */
  excludedIngredients: IngredientRestriction[];
  /**
   * When true, `dislike`-severity restrictions stop filtering and only
   * down-rank. Allergies and hard avoids are unaffected.
   */
  allowDislikedIngredients: boolean;

  // --- Hard: explicit requirements ---------------------------------------
  /** The recipe MUST contain all of these. Slugs, or free text we resolve. */
  requiredIngredients: string[];
  /** Appliances the user actually has. Empty means "do not filter on this". */
  appliances: Appliance[];
  mealType: MealType | null;
  cuisine: Cuisine | null;
  maxMinutes: number | null;
  maxCalories: number | null;
  minProteinGrams: number | null;
  /**
   * Collection tags the recipe must carry, e.g. `quick`, `high-protein`.
   *
   * These are curated groupings rather than user safety rules, but they are
   * still HARD: a Discover collection that quietly includes recipes outside it
   * is not a collection. Relaxable, unlike the safety constraints.
   */
  tags: string[];

  // --- Pantry -------------------------------------------------------------
  pantryMode: PantryMode;
  /**
   * How many essential ingredients a recipe may be missing.
   *
   * `null` defers to `pantryMode`: strict is 0, partial is
   * `DEFAULT_MAX_MISSING`. Set it to make "allow 1 missing" mean exactly that.
   */
  maxMissingIngredients: number | null;
  /**
   * Require the recipe to use at least one thing the user actually named.
   *
   * Without this a dish made entirely of assumed seasonings satisfies every
   * search — `manakish-zaatar` was returned for "chicken, rice, tomato" and
   * for "banana, oats, milk" alike, using nothing from either. Answering "what
   * can I cook with what I have" with a recipe that uses none of it is not an
   * answer.
   */
  mustUseSomethingAvailable: boolean;
  /** Ingredients the user says they have right now, beyond the pantry. */
  availableIngredients: string[];

  // --- Soft: ranking only -------------------------------------------------
  servings: number;
  budgetMinor: number | null;
  currency: CurrencyCode;
  country: CountryCode;
  skillLevel: SkillLevel;
  /** Cuisines the user tends to like. Ranking only, never a filter. */
  preferredCuisines: Cuisine[];
  /**
   * What this user said they always have.
   *
   * Kept apart from `availableIngredients` on purpose. Both make a recipe
   * cookable, but only the latter is something the user NAMED for this search,
   * and `mustUseSomethingAvailable` has to mean "uses something you asked
   * about" — not "uses the oil you told us about in March".
   */
  alwaysAvailableIngredients: string[];
  /** Free-text query, for search mode. */
  query: string | null;
};

export function emptyConstraints(overrides: Partial<RecipeConstraints> = {}): RecipeConstraints {
  return {
    allergens: [],
    eatingStyle: 'none',
    dietFlags: [],
    excludedIngredients: [],
    allowDislikedIngredients: false,
    requiredIngredients: [],
    appliances: [],
    mealType: null,
    cuisine: null,
    maxMinutes: null,
    maxCalories: null,
    minProteinGrams: null,
    tags: [],
    pantryMode: 'off',
    maxMissingIngredients: null,
    mustUseSomethingAvailable: false,
    availableIngredients: [],
    servings: 2,
    budgetMinor: null,
    currency: 'EGP',
    country: 'EG',
    skillLevel: 'intermediate',
    preferredCuisines: [],
    alwaysAvailableIngredients: [],
    query: null,
    ...overrides,
  };
}

// --- Canonical ingredient identity -----------------------------------------

/**
 * The canonical slug for a recipe ingredient line.
 *
 * Curated and community recipes carry a slug from the importer. An
 * AI-generated one carries only a name, so it is resolved through the
 * catalogue's alias index — the same path a user's typed ingredient takes,
 * which is what keeps "capsicum" and "bell pepper" one thing on both sides.
 */
export function ingredientSlug(line: Pick<RecipeIngredient, 'slug' | 'name'>): string | null {
  if (line.slug) return line.slug;
  return resolveIngredient(line.name)?.slug ?? null;
}

/** Every canonical slug a recipe contains, garnishes and optionals included. */
export function recipeSlugs(recipe: Pick<Recipe, 'ingredients'>): Set<string> {
  const slugs = new Set<string>();
  for (const line of recipe.ingredients) {
    const slug = ingredientSlug(line);
    if (slug) slugs.add(slug);
  }
  return slugs;
}

/**
 * Does this recipe contain the named ingredient?
 *
 * Three answers in descending order of confidence. An exact resolution wins.
 * Failing that, a FAMILY WORD — one that names several catalogue rows, like
 * `chicken` — matches any member, which is what both callers mean: "without
 * chicken" rules out every cut, and "with chicken" is satisfied by any one of
 * them. Failing that, normalised-name comparison, so a user excluding
 * something we have never heard of still gets an exact-name exclusion rather
 * than nothing at all.
 *
 * The family case is why removing `chicken` as an alias of `chicken-breast`
 * did not simply break search. Resolution returns one ingredient; the honest
 * answer for a generic word is a set, and a set is what exclusion and
 * requirement have always needed.
 */
export function recipeContains(
  recipe: Pick<Recipe, 'ingredients'>,
  wanted: string,
  options: { includeOptional?: boolean } = {},
): boolean {
  const { includeOptional = true } = options;
  const lines = includeOptional
    ? recipe.ingredients
    : recipe.ingredients.filter((line) => !line.isOptional && !line.isGarnish);

  const resolved = resolveIngredient(wanted);
  const wantedSlug = resolved?.slug ?? null;
  const wantedKey = normaliseIngredientName(resolved?.name ?? wanted);

  if (!resolved) {
    const family = ingredientFamily(wanted);
    if (family.length > 0) {
      const slugs = new Set(family.map((ingredient) => ingredient.slug));
      return lines.some((line) => {
        const slug = ingredientSlug(line);
        return slug !== null && slugs.has(slug);
      });
    }
  }

  return lines.some((line) => {
    if (wantedSlug) {
      const slug = ingredientSlug(line);
      if (slug && slug === wantedSlug) return true;
    }
    if (!wantedKey) return false;
    const lineResolved = resolveIngredient(line.name);
    const lineKey = normaliseIngredientName(lineResolved?.name ?? line.name);
    return lineKey === wantedKey;
  });
}

/**
 * Lines a cook genuinely has to have in the kitchen tonight.
 *
 * Not optional, not a garnish, not a background staple. This is the set
 * `pantryMode: 'strict'` is asserted against, and getting it wrong in either
 * direction is a bad product: too wide and "recipes I can make now" tells
 * someone to go and buy salt; too narrow and it tells them they can make a
 * dish they have no chicken for.
 */
export function essentialIngredients(recipe: Pick<Recipe, 'ingredients'>): RecipeIngredient[] {
  // Deliberately delegating rather than restating the predicate: this and the
  // match aggregate MUST agree, and they did not.
  return recipe.ingredients.filter(isNeededLine);
}
