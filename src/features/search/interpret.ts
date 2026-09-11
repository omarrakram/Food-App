import { INGREDIENT_CATALOGUE } from '@/features/ingredients/catalogue';
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
export function interpretQuery(query: string, currency: CurrencyCode): Interpretation {
  const text = query.trim();

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
    query,
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
