/**
 * Core domain vocabulary.
 *
 * These types are the contract between the UI, the local engines (matching,
 * pricing), the Supabase schema and the AI edge functions. Enum-like unions
 * mirror the Postgres enums declared in `supabase/migrations/` — changing one
 * without the other is a bug.
 */

// --- Money & markets -------------------------------------------------------

/** ISO-3166-1 alpha-2. Egypt is the launch market; the list grows over time. */
export const COUNTRY_CODES = ['EG', 'SA', 'AE', 'GB', 'US'] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

/** ISO-4217. */
export type CurrencyCode = 'EGP' | 'SAR' | 'AED' | 'USD' | 'GBP';

/**
 * Money is stored in minor units (piastres for EGP) as an integer to avoid
 * float drift when we sum dozens of ingredient costs.
 */
export type Money = {
  /** Integer amount in the currency's minor unit. 12550 EGP-minor = 125.50 EGP. */
  amountMinor: number;
  currency: CurrencyCode;
};

/**
 * Where a price came from. The UI MUST show estimates differently from live
 * store prices; see `formatMoney` / `PriceTag`.
 */
export type PriceSource = 'estimate' | 'live';

/**
 * How much of a total we were actually able to price.
 *
 * This is the difference between "this costs 85 pounds" and "the part we can
 * price costs 85 pounds". A total assembled from incomplete data can only ever
 * grow, so it may never be presented as a finished figure.
 */
export type EstimateCompleteness = 'complete' | 'partial' | 'unavailable';

export type PricedAmount = {
  money: Money;
  source: PriceSource;
  /** Present when `source === 'live'`. Human-readable store name. */
  storeName?: string;
  /** ISO date the underlying price data was last refreshed. */
  lastUpdated?: string;
  /** True when we had no price data at all and fell back to a category default. */
  isFallback?: boolean;
  /**
   * Whether every required input had a price. Absent means complete — live
   * store prices are complete by construction.
   */
  completeness?: EstimateCompleteness;
  /** How many required items had no price. Drives "1 item has no estimate". */
  unpricedCount?: number;
};

// --- Preferences -----------------------------------------------------------

/**
 * Diet is two independent things, and collapsing them into one list was wrong.
 *
 * An eating style says which foods are off the table, and the four values are
 * genuinely exclusive: you are not vegan *and* pescatarian. Halal and keto are
 * orthogonal — a halal keto vegetarian is an ordinary person, not an edge
 * case — so they are flags that coexist with any style and with each other.
 *
 * `DIETARY_PREFERENCES` remains the union of both, because a recipe's
 * `dietTags` legitimately carries "vegan" and "halal" side by side, and the
 * database column and the model contract are both typed on it.
 */
export const EATING_STYLES = ['none', 'vegetarian', 'vegan', 'pescatarian'] as const;
export type EatingStyle = (typeof EATING_STYLES)[number];

export const DIET_FLAGS = ['halal', 'keto'] as const;
export type DietFlag = (typeof DIET_FLAGS)[number];

export const DIETARY_PREFERENCES = [
  'none',
  'vegetarian',
  'vegan',
  'pescatarian',
  'halal',
  'keto',
  'other',
] as const;
export type DietaryPreference = (typeof DIETARY_PREFERENCES)[number];

/** Narrows a stored value written before styles and flags were separated. */
export function toEatingStyle(value: string | null | undefined): EatingStyle {
  return (EATING_STYLES as readonly string[]).includes(value ?? '')
    ? (value as EatingStyle)
    : 'none';
}

/** Recovers flags from a legacy single-choice value such as 'halal'. */
export function toDietFlags(value: string | null | undefined): DietFlag[] {
  return (DIET_FLAGS as readonly string[]).includes(value ?? '') ? [value as DietFlag] : [];
}

export const ALLERGENS = [
  'nuts',
  'peanuts',
  'dairy',
  'eggs',
  'gluten',
  'shellfish',
  'fish',
  'soy',
  'sesame',
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const GOALS = [
  'cheaper',
  'healthier',
  'high_protein',
  'lose_weight',
  'gain_muscle',
  'cook_faster',
  'good_food',
] as const;
export type Goal = (typeof GOALS)[number];

export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const APPLIANCES = [
  'stove',
  'oven',
  'air_fryer',
  'microwave',
  'grill',
  'blender',
  'kettle',
  'other',
] as const;
export type Appliance = (typeof APPLIANCES)[number];

export const CUISINES = [
  'egyptian',
  'levantine',
  'italian',
  'asian',
  'indian',
  'mexican',
  'american',
  'mediterranean',
  'turkish',
] as const;
export type Cuisine = (typeof CUISINES)[number];

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type UserPreferences = {
  displayName: string | null;
  country: CountryCode;
  city: string | null;
  currency: CurrencyCode;
  householdSize: number;
  /** Exclusive: vegetarian, vegan and pescatarian cannot combine. */
  dietaryPreference: EatingStyle;
  /** Independent of the style and of each other: halal, keto. */
  dietFlags: DietFlag[];
  /** Hard constraints. Never relaxed, never overridden by the model. */
  allergens: Allergen[];
  /** Soft constraints — free-text ingredient names the user avoids. */
  dislikedIngredients: string[];
  /**
   * Ingredient names this user says they always have.
   *
   * The honest half of "do I have what this recipe needs". The app assumes
   * only water and salt on anybody's behalf; everything else a cook always
   * keeps — oil, onions, garlic, cumin — is a fact about that cook, chosen on
   * a screen they can see and change. Empty by default, deliberately: an
   * app that guesses this is an app that tells you you can cook things you
   * cannot.
   */
  alwaysAvailableIngredients: string[];
  primaryGoal: Goal;
  preferredCuisines: Cuisine[];
  skillLevel: SkillLevel;
  appliances: Appliance[];
  /** Optional daily nutrition targets used for ranking, not hard filtering. */
  dailyCalorieTarget: number | null;
  dailyProteinTarget: number | null;
  /** Typical spend per meal, in minor units. Seeds the budget screen. */
  typicalBudgetMinor: number | null;
  /** Opt-in personalisation. When false we stop recording interaction signals. */
  personalisationEnabled: boolean;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  displayName: null,
  country: 'EG',
  city: null,
  currency: 'EGP',
  householdSize: 2,
  dietaryPreference: 'none',
  dietFlags: [],
  allergens: [],
  dislikedIngredients: [],
  alwaysAvailableIngredients: [],
  primaryGoal: 'good_food',
  preferredCuisines: [],
  skillLevel: 'intermediate',
  appliances: ['stove'],
  dailyCalorieTarget: null,
  dailyProteinTarget: null,
  typicalBudgetMinor: null,
  personalisationEnabled: true,
};

// --- Ingredients & pantry --------------------------------------------------

export const INGREDIENT_CATEGORIES = [
  'protein',
  'vegetables',
  'fruit',
  'dairy',
  'carbs',
  'spices',
  'sauces',
  'frozen',
  'bakery',
  'pantry',
  'other',
] as const;
export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

/** Units we can convert between deterministically. */
export const UNITS = [
  'g',
  'kg',
  'ml',
  'l',
  'piece',
  'clove',
  'slice',
  'bunch',
  'can',
  'pack',
  'tbsp',
  'tsp',
  'cup',
  'pinch',
  'to_taste',
] as const;
export type Unit = (typeof UNITS)[number];

export type Ingredient = {
  id: string;
  /** Canonical English name, lowercase. */
  name: string;
  nameAr: string | null;
  category: IngredientCategory;
  /** Allergens inherent to this ingredient (e.g. milk -> dairy). */
  allergens: Allergen[];
  /** Alternative spellings/translations used for matching user input. */
  aliases: string[];
  /** Default unit used when the user does not specify one. */
  defaultUnit: Unit;
  /** Grams per `piece`, when the ingredient is countable. Enables unit maths. */
  gramsPerPiece: number | null;
  /** True for salt/pepper/oil-type items assumed present unless stated otherwise. */
  isCommonStaple: boolean;
  /** Highly perishable items get stricter expiry handling. */
  isPerishable: boolean;
  imageUrl: string | null;
};

export type PantryItem = {
  id: string;
  userId: string;
  ingredientId: string;
  /** Denormalised for display; authoritative name lives on `Ingredient`. */
  ingredientName: string;
  category: IngredientCategory;
  quantity: number | null;
  unit: Unit | null;
  /** ISO date (YYYY-MM-DD). Null means "no date entered". */
  expiresOn: string | null;
  /** Staples are always considered available regardless of quantity. */
  isStaple: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Derived freshness bucket. Computed locally so it stays correct as time passes. */
export type FreshnessStatus = 'fresh' | 'expiring_soon' | 'expires_today' | 'expired' | 'unknown';

// --- Recipes ---------------------------------------------------------------

export type RecipeIngredient = {
  id: string;
  /** Null when the AI proposed an ingredient we have not canonicalised yet. */
  ingredientId: string | null;
  /**
   * Canonical catalogue slug. Present for every curated and community recipe;
   * null only for an AI-proposed ingredient we could not resolve.
   *
   * This — not `name` — is what exclusion, requirement and pantry matching key
   * off, so "bell pepper", "capsicum" and «فلفل ألوان» are one thing.
   */
  slug: string | null;
  name: string;
  quantity: number | null;
  unit: Unit | null;
  /** e.g. "finely chopped". Shown after the name. */
  preparation: string | null;
  /**
   * Optional ingredients do not count against the match percentage and are not
   * added to the shopping list by default.
   */
  isOptional: boolean;
  /** A finishing touch. Never required to consider the dish cookable. */
  isGarnish: boolean;
  /**
   * Salt, oil, pepper — assumed present unless the user says otherwise.
   *
   * Separate from `isOptional` because a staple genuinely IS in the dish; it
   * just should not stop someone being told they can cook it tonight.
   */
  isPantryStaple: boolean;
  /** Free-text note shown under the line, e.g. a substitution hint. */
  notes: string | null;
  /** Ordering within the recipe. */
  sortOrder: number;
};

export type RecipeStep = {
  id: string;
  stepNumber: number;
  instruction: string;
  /**
   * Arabic instruction.
   *
   * Null for a recipe the model generated: it answers in one language, and
   * machine-translating a cooking step — where "simmer" and "boil" are
   * different instructions — is not something to do silently. The renderer
   * falls back to `instruction`.
   */
  instructionAr: string | null;
  /** Minutes this step takes, when the recipe specifies it. */
  durationMinutes: number | null;
  /** Ingredient names relevant to this step; surfaced in cooking mode. */
  ingredientRefs: string[];
  /** Food-safety note attached to this step (temperatures, handling). */
  safetyNote: string | null;
  /** Arabic safety note. SAFETY-CRITICAL: hand-written, never generated. */
  safetyNoteAr: string | null;
};

export type NutritionPerServing = {
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  fiberGrams: number | null;
};

export type RecipeSource = 'curated' | 'ai_generated' | 'user';

/**
 * Where a recipe's photograph came from, and what using it requires.
 *
 * Carried with the recipe rather than kept in a side table because the
 * obligation travels with the image: anything rendered has to be able to
 * answer "who took this and what does the licence require?" without a join.
 */
export type RecipeImageMeta = {
  /**
   * Path inside the recipe-images bucket, e.g. `curated/koshari.jpg`.
   * Resolved to a URL at render time so the same row works against Supabase
   * Storage, a CDN, or the bundled preview assets.
   */
  path: string;
  source: RecipeImageSource;
  /** Photographer or illustrator, when the licence requires naming them. */
  creator: string | null;
  /** SPDX identifier where one exists, e.g. `CC0-1.0`, or `proprietary`. */
  license: string;
  /** The exact string that must be displayed, when one is required. */
  attribution: string | null;
  sourceUrl: string | null;
};

export const RECIPE_IMAGE_SOURCES = [
  /** Rendered by us for this catalogue. */
  'generated',
  /** Photographed by or for us; we hold the rights. */
  'owned',
  /** Public domain or an open licence that permits this use. */
  'openly_licensed',
  /** Uploaded by a user with a submission. */
  'community',
] as const;
export type RecipeImageSource = (typeof RECIPE_IMAGE_SOURCES)[number];

export type Recipe = {
  id: string;
  slug: string | null;
  title: string;
  /** Arabic title. Null for AI recipes; the renderer falls back to `title`. */
  titleAr: string | null;
  description: string;
  /** Arabic description. Null for AI recipes. */
  descriptionAr: string | null;
  /**
   * Resolved URL for the hero photograph, or null to draw the branded
   * fallback. Derived from `image` at load time — never authored directly.
   */
  imageUrl: string | null;
  /** Provenance and licence for `imageUrl`. Null when there is no photo. */
  image: RecipeImageMeta | null;
  source: RecipeSource;
  cuisine: Cuisine | null;
  mealTypes: MealType[];
  difficulty: Difficulty;
  prepMinutes: number;
  cookMinutes: number;
  /** Servings the quantities in `ingredients` are written for. */
  baseServings: number;
  nutrition: NutritionPerServing;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  /** Allergens present anywhere in the recipe. Used for hard filtering. */
  allergens: Allergen[];
  /** Diets this recipe satisfies, e.g. ['vegetarian', 'halal']. */
  dietTags: DietaryPreference[];
  /** Appliances required to cook it. */
  requiredAppliances: Appliance[];
  /** Free-form tags powering Discover collections. */
  tags: string[];
  createdAt: string;
};

export function totalMinutes(recipe: Pick<Recipe, 'prepMinutes' | 'cookMinutes'>): number {
  return recipe.prepMinutes + recipe.cookMinutes;
}

// --- Matching & results ----------------------------------------------------

export type IngredientMatch = {
  recipeIngredientId: string;
  name: string;
  /** True when the user's pantry (or supplied list) covers this ingredient. */
  isAvailable: boolean;
  /** How the NAME matched — exact, or through an alias the user typed. */
  matchedVia: 'exact' | 'alias' | null;
  /**
   * WHERE the availability came from, which is a different question.
   *
   * The screen must never claim more than this says. "Assumed" is only
   * honest for water and salt; anything else the cook has is either in their
   * pantry, typed into this search, or on the always-have list they wrote.
   */
  availableVia: 'pantry' | 'typed' | 'user_staple' | 'universal_basic' | null;
  /** Set when we deliberately refused to count a pantry item. */
  excludedReason: 'expired' | 'out_of_stock' | null;
  isOptional: boolean;
};

export type RecipeMatch = {
  recipe: Recipe;
  /** 0–100, counting required ingredients only. */
  matchPercent: number;
  haveCount: number;
  requiredCount: number;
  missingIngredients: IngredientMatch[];
  availableIngredients: IngredientMatch[];
  /** Deterministically computed by the pricing engine — never by the model. */
  /** What the whole dish costs to make, ignoring what the cook owns. */
  estimatedCost: PricedAmount | null;
  /**
   * What this cook still has to buy. Equal to `estimatedCost` when the pantry
   * is unknown. This — not the full cost — is what a budget is judged against.
   */
  estimatedSpend: PricedAmount | null;
  /** Pantry items this recipe would use up before they expire. */
  usesExpiringItems: string[];
  /** Composite ranking score; higher is better. */
  score: number;
};

// --- Shopping list ---------------------------------------------------------

/**
 * Shaped now for a future where each line maps onto a real store product.
 * The `store*` fields stay null until a `GroceryProvider` fills them in.
 */
/** Stock state a store reports for a product. */
export type Availability = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';

export type ShoppingListItem = {
  id: string;
  listId: string;
  ingredientId: string | null;
  name: string;
  quantity: number | null;
  unit: Unit | null;
  category: IngredientCategory;
  isChecked: boolean;
  /** Recipe(s) that contributed this line, for "why is this here?". */
  sourceRecipeIds: string[];
  /** Deterministic estimate for this line. */
  estimatedCost: PricedAmount | null;

  // --- Reserved for grocery-provider integration (all null in V1) ---
  supermarketId: string | null;
  storeProductId: string | null;
  sku: string | null;
  livePriceMinor: number | null;
  availability: Availability | null;

  createdAt: string;
  updatedAt: string;
};

export type ShoppingList = {
  id: string;
  userId: string;
  name: string;
  items: ShoppingListItem[];
  createdAt: string;
  updatedAt: string;
};

// --- Search / request constraints -----------------------------------------

/**
 * The structured form of any user request, whether it came from the budget
 * screen, the ingredient screen, or natural-language search. Everything
 * downstream (matching, pricing, AI prompt) consumes this shape only.
 */
/**
 * A request from one of the app's entry points.
 *
 * This is the UI-level shape. `toConstraints()` in
 * `features/recipes/request-params` turns it into the canonical
 * `RecipeConstraints`, which is what every filter and query actually reads —
 * see `features/recipes/constraints.ts`.
 */
export type MealRequest = {
  mode: 'ingredients' | 'budget' | 'search';
  /** Ingredient names the user says they have. */
  ingredients: string[];
  /**
   * The user's configured always-have list, carried from preferences.
   *
   * Separate from `ingredients` because these are not part of the question —
   * nobody searches for "what can I make with the oil I always have".
   */
  alwaysAvailableIngredients: string[];
  /**
   * Ingredients the result MUST contain. A requirement, not a preference:
   * "something with chicken and rice" returns nothing without both.
   */
  requiredIngredients: string[];
  /**
   * Ingredients to keep out, each with its own severity. Allergies and hard
   * avoids are absolute; dislikes can be overridden by the user.
   */
  excludedIngredients: {
    slug: string | null;
    label: string;
    severity: 'allergy' | 'hard_avoid' | 'dislike';
  }[];
  /**
   * How strictly the pantry limits results. `strict` means every returned
   * recipe is cookable right now.
   */
  pantryMode: 'off' | 'partial' | 'strict';
  /**
   * How many essential ingredients a result may be missing.
   *
   * Null defers to `pantryMode`. Set it to make "allow 1 missing" mean one.
   */
  maxMissingIngredients: number | null;
  /** Set when the user has chosen to see recipes containing a disliked food. */
  allowDislikedIngredients: boolean;
  /** Budget ceiling in minor units. */
  budgetMinor: number | null;
  currency: CurrencyCode;
  country: CountryCode;
  servings: number;
  mealType: MealType | null;
  cuisine: Cuisine | null;
  maxMinutes: number | null;
  minProteinGrams: number | null;
  maxCalories: number | null;
  /** Free-text query, present for `mode === 'search'`. */
  query: string | null;
  /** Copied from preferences at request time so results are reproducible. */
  dietaryPreference: EatingStyle;
  dietFlags: DietFlag[];
  allergens: Allergen[];
  dislikedIngredients: string[];
  appliances: Appliance[];
  skillLevel: SkillLevel;
};

// --- Profiles ---------------------------------------------------------------

export const PROFILE_VISIBILITIES = ['public', 'friends', 'private'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

/**
 * A user's public identity.
 *
 * Deliberately small, and deliberately separate from `Preferences`. Everything
 * that could describe someone's health — allergens, dietary preference,
 * calorie and protein targets, what is in their kitchen — lives in
 * preferences and the pantry, is never joined onto this, and has no route to
 * another account. The database enforces that with a hand-enumerated view;
 * this type is the client-side half of the same promise.
 */
/**
 * One 1-to-1 thread, as a list row needs it.
 *
 * `partner` rather than `members`: the schema enforces exactly two people per
 * conversation, so "the other one" is always well defined and every screen
 * wants it rather than an array it has to filter itself.
 */
export type Conversation = {
  id: string;
  partner: PublicProfile;
  /** Denormalised by a trigger so a list of threads is one query. */
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unread: number;
};

/** How far a message has got. Local-only; the server has no such column. */
export type MessageDelivery = 'sent' | 'sending' | 'failed';

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  /**
   * A shared recipe travels as a REFERENCE, never as copied content — so the
   * card renders the recipe as it is now, and one later made private stops
   * rendering instead of leaving a stale copy in someone's chat log.
   */
  sharedRecipeId: string | null;
  createdAt: string;
  editedAt: string | null;
  /**
   * Present only for messages this device is still trying to deliver. A
   * message that came back from the server never carries anything but 'sent',
   * which is what keeps an optimistic bubble distinguishable from a real one.
   */
  delivery?: MessageDelivery;
};

/** A page of messages, newest first, with a cursor for older ones. */
export type MessagePage = {
  messages: Message[];
  /** Opaque; null when the thread has no more history. */
  nextCursor: string | null;
};

export type PublicProfile = {
  id: string;
  /** Handle as the user typed it. Null until they claim one. */
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  country: CountryCode;
  /** Null unless the owner opted into showing it. */
  city: string | null;
  joinedAt: string;
};

/** The owner's view of their own profile: the public half plus the settings. */
export type OwnProfile = PublicProfile & {
  visibility: ProfileVisibility;
  showCity: boolean;
};

/** Everything a user may change about their public identity. */
export type ProfileEdit = {
  username?: string | null;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  country?: CountryCode;
  city?: string | null;
  visibility?: ProfileVisibility;
  showCity?: boolean;
};

// --- Friends ----------------------------------------------------------------

export const FRIEND_REQUEST_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'cancelled',
] as const;
export type FriendRequestStatus = (typeof FRIEND_REQUEST_STATUSES)[number];

/**
 * A request, from the point of view of whoever is looking at it.
 *
 * `direction` rather than raw sender/recipient ids because every screen that
 * renders one needs to know which of the two it is — an incoming request
 * offers Accept and Decline, an outgoing one offers Cancel — and deriving that
 * at each render site is how one of them ends up offering the wrong buttons.
 */
export type FriendRequest = {
  id: string;
  direction: 'incoming' | 'outgoing';
  /** The OTHER person. Never the viewer. */
  person: PublicProfile;
  status: FriendRequestStatus;
  createdAt: string;
  respondedAt: string | null;
};

export type Friend = {
  person: PublicProfile;
  friendsSince: string;
};
