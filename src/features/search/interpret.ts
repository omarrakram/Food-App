import { INGREDIENT_CATALOGUE } from '@/features/ingredients/catalogue';
import { ingredientFamily } from '@/features/ingredients/matching';
import { normaliseIngredientName } from '@/features/ingredients/normalise';
import { fromMajor } from '@/lib/format/money';
import type {
  CurrencyCode,
  Cuisine,
  MealRequest,
  MealType,
} from '@/types/domain';

/**
 * Deterministic natural-language interpretation.
 *
 * "something cheesy under 150 pounds" and "dinner in 20 minutes" are handled
 * here with plain pattern matching — no model call, no latency, no cost, and
 * the same answer every time. The AI interpreter (Phase 6) is the fallback for
 * queries this cannot decompose, not the default path.
 */

export type Interpretation = {
  budgetMinor: number | null;
  maxMinutes: number | null;
  minProteinGrams: number | null;
  maxCalories: number | null;
  servings: number | null;
  mealType: MealType | null;
  cuisine: Cuisine | null;
  ingredients: string[];
  /** Foods the query explicitly rules out: "without chicken", "بدون بصل". */
  excludedIngredients: string[];
  tags: string[];
  /**
   * What is left of the query after everything understood has been lifted out.
   *
   * This — not the raw query — is what may be matched against a recipe TITLE.
   * "chicken without bell pepper" is fully understood, so its residual is
   * empty and there is no title to search for; "koshari under 30 minutes"
   * leaves "koshari", which is exactly the dish the user named.
   *
   * Matching the raw string instead returns nothing for any query with
   * structure in it, because no recipe is called "chicken without bell
   * pepper".
   */
  keywords: string;
  /** 0–1. Below `LOW_CONFIDENCE` the caller should consider the AI fallback. */
  confidence: number;
};

export const LOW_CONFIDENCE = 0.34;

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  a: 1,
  an: 1,
};

/** Words users actually type for money in the launch market. */
const CURRENCY_WORDS = /(egp|pounds?|pound|le|جنيه|جنيهات)/i;

const CUISINE_KEYWORDS: Record<string, Cuisine> = {
  egyptian: 'egyptian',
  masri: 'egyptian',
  baladi: 'egyptian',
  مصري: 'egyptian',
  levantine: 'levantine',
  shami: 'levantine',
  lebanese: 'levantine',
  syrian: 'levantine',
  italian: 'italian',
  pasta: 'italian',
  pizza: 'italian',
  asian: 'asian',
  chinese: 'asian',
  thai: 'asian',
  japanese: 'asian',
  indian: 'indian',
  curry: 'indian',
  mexican: 'mexican',
  taco: 'mexican',
  american: 'american',
  burger: 'american',
  mediterranean: 'mediterranean',
  greek: 'mediterranean',
  turkish: 'turkish',
};

const MEAL_KEYWORDS: Record<string, MealType> = {
  breakfast: 'breakfast',
  brunch: 'breakfast',
  فطار: 'breakfast',
  lunch: 'lunch',
  غداء: 'lunch',
  dinner: 'dinner',
  supper: 'dinner',
  عشاء: 'dinner',
  snack: 'snack',
  dessert: 'dessert',
  sweet: 'dessert',
  حلو: 'dessert',
};

/** Free-text qualities mapped onto recipe tags used for ranking. */
const TAG_KEYWORDS: Record<string, string> = {
  healthy: 'healthy',
  light: 'healthy',
  quick: 'quick',
  fast: 'quick',
  easy: 'beginner',
  simple: 'beginner',
  cheap: 'budget',
  budget: 'budget',
  comfort: 'comfort',
  cosy: 'comfort',
  cozy: 'comfort',
  cheesy: 'comfort',
  'air fryer': 'air-fryer',
  airfryer: 'air-fryer',
  leftovers: 'leftovers',
  'late night': 'late-night',
};

function extractBudget(text: string, currency: CurrencyCode): number | null {
  // "under 150 EGP", "less than 150 pounds", "150 جنيه", "under 150"
  const patterns = [
    /(?:under|below|less than|max(?:imum)?|within|up to)\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:egp|pounds?|le|جنيه)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const captured = match?.[1];
    if (captured) {
      const value = Number.parseFloat(captured);
      if (Number.isFinite(value) && value > 0) {
        // Guard: "under 20 minutes" must not be read as a 20 EGP budget.
        const isTime = /minutes?|mins?|hours?|hrs?/i.test(text.slice(match?.index ?? 0));
        if (!isTime || CURRENCY_WORDS.test(text)) {
          return fromMajor(value, currency).amountMinor;
        }
      }
    }
  }
  return null;
}

function extractMinutes(text: string): number | null {
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
  const hourValue = hourMatch?.[1];
  if (hourValue) {
    const hours = Number.parseFloat(hourValue);
    if (Number.isFinite(hours)) return Math.round(hours * 60);
  }
  const match = text.match(/(\d+)\s*(?:minutes?|mins?|min|دقيقة|دقائق)/i);
  const captured = match?.[1];
  if (captured) {
    const value = Number.parseInt(captured, 10);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function extractServings(text: string): number | null {
  const match = text.match(/for\s+(\w+)\s*(?:people|persons?|of us)?/i);
  const captured = match?.[1];
  if (!captured) return null;
  const numeric = Number.parseInt(captured, 10);
  if (Number.isFinite(numeric) && numeric > 0 && numeric <= 20) return numeric;
  const word = NUMBER_WORDS[captured.toLowerCase()];
  return word ?? null;
}

/**
 * The ingredients a query mentions.
 *
 * Two passes, because two different things count as "mentioning" one.
 *
 * The first matches a name the catalogue owns — canonical, Arabic or alias —
 * and yields that ingredient's name.
 *
 * The second handles a FAMILY WORD: one that names several rows and therefore
 * none of them, like `chicken` or `فراخ`. It yields the WORD, not the family,
 * and that distinction is the whole point. These names travel on to
 * `requiredIngredients`, which is an AND — expanding `chicken` to all six cuts
 * would build the query "contains breast AND thigh AND wings AND liver AND
 * gizzards AND a whole bird", which no recipe satisfies. Left as a word, it
 * reaches `recipeContains`, which knows a family word matches any member.
 *
 * A family word is skipped when the first pass already named one of its
 * members, so "chicken breast" asks for chicken breast rather than for chicken
 * breast and, redundantly, chicken.
 */
function extractIngredients(text: string): string[] {
  const normalisedText = ` ${normaliseIngredientName(text)} `;
  const found: string[] = [];

  for (const ingredient of INGREDIENT_CATALOGUE) {
    const candidates = [ingredient.name, ingredient.nameAr, ...ingredient.aliases];
    const hit = candidates.some((candidate) => {
      const key = normaliseIngredientName(candidate);
      // Require a whole-token match so "ice" does not match "rice".
      return key.length >= 3 && normalisedText.includes(` ${key} `);
    });
    if (hit) found.push(ingredient.name);
  }

  const named = new Set(found);
  for (const token of new Set(normalisedText.trim().split(' '))) {
    const family = ingredientFamily(token);
    if (family.length < 2) continue;
    if (family.some((ingredient) => named.has(ingredient.name))) continue;
    found.push(token);
  }

  return [...new Set(found)];
}

/**
 * Phrases that turn what follows into an exclusion.
 *
 * "something without chicken" is a different request from "something with
 * chicken", and reading only the ingredient names would invert it.
 */
const NEGATION_PATTERNS = [
  /\bwithout\s+([^,.;]+)/gi,
  /\bno\s+([^,.;]+)/gi,
  /\bnot?\s+with\s+([^,.;]+)/gi,
  /\bhold\s+the\s+([^,.;]+)/gi,
  /\bfree\s+of\s+([^,.;]+)/gi,
  /بدون\s+([^,.;،]+)/g,
  /من\s*غير\s+([^,.;،]+)/g,
];

/**
 * Splits a query into the part that asks for things and the part that rules
 * them out, so the same extractor can run over each.
 */
function splitNegations(text: string): { positive: string; negative: string } {
  let negative = '';
  let positive = text;

  for (const pattern of NEGATION_PATTERNS) {
    positive = positive.replace(pattern, (_match, captured: string) => {
      negative += ` ${captured} `;
      return ' ';
    });
  }

  return { positive, negative };
}

/**
 * Words that carry no dish in them.
 *
 * Only the connectives an interpreted query leaves behind — this is not a
 * general stopword list, and it must not grow into one: a word removed here is
 * a word nobody can ever search for.
 */
const RESIDUAL_NOISE = new Set([
  'a', 'an', 'and', 'any', 'for', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on',
  'or', 'please', 'quick', 'quickly', 'something', 'that', 'the', 'to', 'want',
  'with', 'within',
  'عايز', 'عاوز', 'اكل', 'أكل', 'حاجة', 'في', 'من', 'مع', 'و',
]);

/**
 * The query minus everything the interpreter understood.
 *
 * Removes the negation clauses, the recognised ingredient names, the numeric
 * phrases and every keyword table's entries, then drops the connectives. What
 * survives is a dish name or nothing.
 */
function residualKeywords(
  text: string,
  matched: { negative: string; ingredients: readonly string[] },
): string {
  let rest = ` ${text.toLowerCase()} `;

  // Whole negation clauses, not just the ingredient inside them: "without" is
  // as much a part of what we understood as "bell pepper" is.
  for (const pattern of NEGATION_PATTERNS) rest = rest.replace(pattern, ' ');

  // Every spelling of every ingredient we matched, so an alias the user typed
  // ("capsicum") is removed as surely as the canonical name.
  for (const name of matched.ingredients) {
    const entry = INGREDIENT_CATALOGUE.find((candidate) => candidate.name === name);
    // A family word is not a catalogue entry and has only one spelling, but it
    // was still understood, so it must not survive into the title search.
    if (!entry) {
      rest = rest.replaceAll(name.toLowerCase(), ' ');
      continue;
    }
    for (const spelling of [entry.name, entry.nameAr, ...entry.aliases]) {
      if (spelling.length < 3) continue;
      rest = rest.replaceAll(spelling.toLowerCase(), ' ');
    }
  }

  for (const table of [CUISINE_KEYWORDS, MEAL_KEYWORDS, TAG_KEYWORDS]) {
    for (const keyword of Object.keys(table)) rest = rest.replaceAll(keyword, ' ');
  }

  // Numbers and the units they came with: "under 30 minutes", "150 EGP",
  // "for 4". Leaving the bare digits behind would match nothing anyway.
  rest = rest
    .replace(/\b(under|below|less than|max|maximum|up to|within|over|at least)\b/gi, ' ')
    .replace(/\b(minutes?|mins?|hours?|hrs?|people|persons?|servings?|egp|sar|aed|gbp|usd|pounds?|جنيه|دقيقة|دقايق|ساعة|أفراد|اشخاص|أشخاص)\b/gi, ' ')
    .replace(/\b(high|low)[- ]?(protein|cal|calorie|calories)\b/gi, ' ')
    .replace(/[\d٠-٩]+/g, ' ');

  return rest
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1 && !RESIDUAL_NOISE.has(word))
    .join(' ')
    .trim();
}

function findKeyword<T>(text: string, table: Record<string, T>): T | null {
  const haystack = ` ${text.toLowerCase()} `;
  for (const [keyword, value] of Object.entries(table)) {
    if (haystack.includes(` ${keyword} `) || haystack.includes(`${keyword} `)) return value;
  }
  return null;
}

function findAllTags(text: string): string[] {
  const haystack = ` ${text.toLowerCase()} `;
  const tags = new Set<string>();
  for (const [keyword, tag] of Object.entries(TAG_KEYWORDS)) {
    if (haystack.includes(keyword)) tags.add(tag);
  }
  return [...tags];
}

/** Parses a free-text query into structured constraints. */
/**
 * Rewrites Arabic-Indic digits as ASCII.
 *
 * Every number pattern below is `\d`, which in JavaScript matches ASCII only.
 * An Arabic keyboard produces ١٥٠, so "أقل من ١٥٠ جنيه" parsed to nothing at
 * all — the budget, the cooking time and the serving count all silently
 * disappeared for anyone typing in their own numerals.
 */
function toAsciiDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) => {
    const code = digit.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

export function interpretQuery(query: string, currency: CurrencyCode): Interpretation {
  const text = toAsciiDigits(query.trim());

  const budgetMinor = extractBudget(text, currency);
  const maxMinutes = extractMinutes(text);
  const servings = extractServings(text);
  const cuisine = findKeyword(text, CUISINE_KEYWORDS);
  const mealType = findKeyword(text, MEAL_KEYWORDS);
  // Exclusions are lifted out first so "without chicken" cannot be read as a
  // request FOR chicken by the positive extractor.
  const { positive, negative } = splitNegations(text);
  const ingredients = extractIngredients(positive);
  const excludedIngredients = extractIngredients(negative);
  const tags = findAllTags(text);

  const highProtein = /high[- ]?protein|protein[- ]?rich|بروتين/i.test(text);
  const lowCalorie = /low[- ]?cal|light|diet|سعرات/i.test(text);

  // Confidence is "how much of this did we actually understand?".
  const signals = [
    budgetMinor !== null,
    maxMinutes !== null,
    servings !== null,
    cuisine !== null,
    mealType !== null,
    ingredients.length > 0,
    excludedIngredients.length > 0,
    tags.length > 0,
    highProtein,
    lowCalorie,
  ].filter(Boolean).length;

  return {
    budgetMinor,
    maxMinutes,
    minProteinGrams: highProtein ? 30 : null,
    maxCalories: lowCalorie ? 500 : null,
    servings,
    mealType,
    cuisine,
    ingredients,
    excludedIngredients,
    tags,
    keywords: residualKeywords(text, { negative, ingredients }),
    confidence: Math.min(1, signals / 3),
  };
}

/** Applies an interpretation on top of a base request. */
export function applyInterpretation(
  base: MealRequest,
  interpretation: Interpretation,
  query: string,
): MealRequest {
  return {
    ...base,
    mode: 'search',
    // The RESIDUAL, not the raw query. `query` becomes a title filter
    // downstream, and no recipe is called "chicken without bell pepper" — so
    // passing the raw string returns nothing for any query with structure in
    // it. The `query` argument is kept for the caller's own display.
    query: interpretation.keywords || null,
    ingredients: interpretation.ingredients.length > 0 ? interpretation.ingredients : base.ingredients,
    // An exclusion the user typed is a constraint for this search, so it joins
    // the disliked list the ranker already filters on — allergies and diet
    // still apply on top, never instead.
    dislikedIngredients: [
      ...new Set([...base.dislikedIngredients, ...interpretation.excludedIngredients]),
    ],
    budgetMinor: interpretation.budgetMinor ?? base.budgetMinor,
    maxMinutes: interpretation.maxMinutes ?? base.maxMinutes,
    minProteinGrams: interpretation.minProteinGrams ?? base.minProteinGrams,
    maxCalories: interpretation.maxCalories ?? base.maxCalories,
    servings: interpretation.servings ?? base.servings,
    mealType: interpretation.mealType ?? base.mealType,
    cuisine: interpretation.cuisine ?? base.cuisine,
  };
}

/** Human-readable summary of what we understood, shown back to the user. */
export function describeInterpretation(
  interpretation: Interpretation,
  labels: {
    money: (minor: number) => string;
    minutes: (count: number) => string;
    servings: (count: number) => string;
    meal: (meal: MealType) => string;
    cuisine: (cuisine: Cuisine) => string;
    highProtein: string;
    /** Renders an exclusion, e.g. "no chicken". */
    without: (ingredient: string) => string;
  },
): string[] {
  const parts: string[] = [];
  if (interpretation.budgetMinor !== null) parts.push(labels.money(interpretation.budgetMinor));
  if (interpretation.maxMinutes !== null) parts.push(labels.minutes(interpretation.maxMinutes));
  if (interpretation.mealType) parts.push(labels.meal(interpretation.mealType));
  if (interpretation.cuisine) parts.push(labels.cuisine(interpretation.cuisine));
  if (interpretation.servings !== null) parts.push(labels.servings(interpretation.servings));
  if (interpretation.minProteinGrams !== null) parts.push(labels.highProtein);
  parts.push(...interpretation.ingredients);
  // Shown like every other chip so an exclusion the user typed is visible and
  // removable rather than an invisible filter.
  parts.push(...interpretation.excludedIngredients.map(labels.without));
  return parts;
}
