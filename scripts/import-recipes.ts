/**
 * Turns the recipe dataset into the app's bundled catalogue.
 *
 *     npm run recipes:import              # data/recipes/*.json -> generated TS
 *     npm run recipes:import -- --check   # verify the generated file is current
 *
 * The catalogue is DATA. Adding a recipe is a JSON object in
 * `data/recipes/<cuisine>.json`, never a TypeScript literal wired into a
 * component. That is the whole point: 150 hand-written objects scattered
 * through the app cannot be validated, cannot be seeded into Postgres, and
 * cannot be edited by anyone who does not write TypeScript.
 *
 * Validation is strict because every failure here is silent at runtime:
 *
 *   - a duplicate slug quietly shadows a recipe,
 *   - an unknown ingredient slug breaks matching, pricing AND the "can I cook
 *     this?" answer, all without an error,
 *   - a missing allergen is a safety bug,
 *   - two near-identical titles are how a catalogue pads its count.
 *
 * Ids are UUIDv5 of the slug, so the same recipe carries the same primary key
 * in the bundle and in Postgres. Ingredient and step ids derive from the
 * recipe id, so re-importing never churns them.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INGREDIENT_CATALOGUE } from '../src/features/ingredients/catalogue.ts';
import { resolveIngredient } from '../src/features/ingredients/matching.ts';
import {
  ALLERGENS,
  APPLIANCES,
  CUISINES,
  DIETARY_PREFERENCES,
  DIFFICULTIES,
  MEAL_TYPES,
  RECIPE_IMAGE_SOURCES,
  UNITS,
} from '../src/types/domain.ts';
import { uuidv5 } from './uuid.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(ROOT, 'data/recipes');
const OUTPUT = join(ROOT, 'src/features/recipes/catalogue.generated.ts');
const IMAGE_MANIFEST = join(ROOT, 'data/images/manifest.json');

class ImportError extends Error {}

// --- The dataset's shape ---------------------------------------------------

type RawIngredient = {
  slug: string;
  quantity?: number | null;
  unit?: string | null;
  /**
   * English only, and deliberately. The Arabic lives in
   * `PREPARATION_AR` in `features/recipes/localise.ts`, because it is
   * SHARED vocabulary: a hundred-odd ingredient lines use a few dozen
   * phrases, and writing the Arabic out per line guarantees they drift.
   * A `prepAr` field was accepted here for a while and never emitted —
   * silently dropped — so it is gone rather than left as a trap.
   */
  prep?: string | null;
  optional?: boolean;
  garnish?: boolean;
  staple?: boolean;
  notes?: string | null;
  notesAr?: string | null;
};

type RawStep = {
  text: string;
  textAr: string;
  minutes?: number | null;
  uses?: string[];
  safety?: string | null;
  safetyAr?: string | null;
};

type RawImage = {
  path: string;
  source: string;
  creator?: string | null;
  license: string;
  attribution?: string | null;
  sourceUrl?: string | null;
};

type RawRecipe = {
  slug: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  cuisine: string;
  mealTypes: string[];
  difficulty: string;
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  nutrition: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fiber: number | null;
  };
  dietTags: string[];
  allergens: string[];
  appliances: string[];
  tags: string[];
  image: RawImage | null;
  ingredients: RawIngredient[];
  steps: RawStep[];
};

// --- Bounds ----------------------------------------------------------------

/**
 * Ranges a real recipe lives inside. Anything outside is a typo, and a typo in
 * this data reaches the user as a recipe that claims to take four minutes or
 * to contain nine thousand calories.
 */
const BOUNDS = {
  prepMinutes: [0, 240],
  cookMinutes: [0, 480],
  totalMinutes: [1, 600],
  servings: [1, 12],
  calories: [40, 2000],
  protein: [0, 200],
  carbs: [0, 300],
  fat: [0, 200],
  fiber: [0, 80],
  steps: [2, 14],
  ingredients: [2, 24],
} as const;

/** Titles this similar are the same recipe wearing a different hat. */
const TITLE_SIMILARITY_LIMIT = 0.86;

const ARABIC = /[؀-ۿ]/;

// --- Helpers ---------------------------------------------------------------

const CATALOGUE_BY_SLUG = new Map(INGREDIENT_CATALOGUE.map((entry) => [entry.slug, entry]));

function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(with|and|the|a|an|of|in|on|for)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dice coefficient over character bigrams — cheap and good enough for titles. */
function similarity(a: string, b: string): number {
  const bigrams = (value: string) => {
    const set = new Set<string>();
    for (let i = 0; i < value.length - 1; i += 1) set.add(value.slice(i, i + 2));
    return set;
  };
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.size === 0 || right.size === 0) return a === b ? 1 : 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

function oneOf(value: string, allowed: readonly string[], field: string, where: string): string {
  if (!allowed.includes(value)) {
    throw new ImportError(`${where}: ${field} "${value}" is not one of ${allowed.join(', ')}`);
  }
  return value;
}

function inRange(
  value: number | null,
  [min, max]: readonly [number, number],
  field: string,
  where: string,
): void {
  if (value === null) return;
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ImportError(`${where}: ${field} is ${value}, outside ${min}–${max}`);
  }
}

function ts(value: string | null): string {
  return value === null ? 'null' : `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

// --- Load ------------------------------------------------------------------

function loadDataset(): { file: string; recipe: RawRecipe }[] {
  const files = readdirSync(SOURCE_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();

  if (files.length === 0) throw new ImportError(`No recipe files in ${SOURCE_DIR}`);

  const loaded: { file: string; recipe: RawRecipe }[] = [];
  for (const file of files) {
    const raw = readFileSync(join(SOURCE_DIR, file), 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new ImportError(`${file}: not valid JSON — ${(error as Error).message}`);
    }
    if (!Array.isArray(parsed)) throw new ImportError(`${file}: expected an array of recipes`);
    for (const recipe of parsed as RawRecipe[]) loaded.push({ file, recipe });
  }
  return loaded;
}

// --- What the clock promises -----------------------------------------------

/**
 * WHAT THE TIME FIELDS MEAN. Documented here because until Stage 3P.2 nothing
 * said, and the corpus showed it: only 27 of 182 recipes had step minutes that
 * summed to their stated total, 46 claimed LESS time than their own steps, and
 * 109 claimed more.
 *
 *   prepMinutes   Everything that is not active cooking, INCLUDING the waiting
 *                 the cook has to plan around — soaking, marinating, proofing,
 *                 resting, chilling, cooling. A 20-minute fridge wait is 20
 *                 minutes of the evening whether or not anyone is stirring.
 *
 *   cookMinutes   Time the food spends cooking: on the heat, in the oven, in
 *                 the air fryer.
 *
 *   the total     prep + cook, and it promises ELAPSED time from starting to
 *                 eating for a cook who overlaps what can sensibly be
 *                 overlapped.
 *
 * STEP MINUTES MAY LEGITIMATELY SUM TO MORE THAN THE TOTAL, which is why there
 * is no `sum === total` rule. Steps overlap: you boil the eggs in the pan
 * already boiling the potatoes, you heat the oven while the dough proves. A
 * gate demanding they match would be wrong about a third of the catalogue and
 * would push authors to falsify step durations to satisfy it.
 *
 * So only the one-sided failure is caught — the recipe that takes materially
 * LONGER than it claims:
 *
 *   NO SINGLE STEP may exceed the whole stated total. Unarguable, and it found
 *   `caprese-stack`, which claimed 8 minutes and opened with a 20-minute wait.
 *
 *   THE SUM may exceed the total by at most 25% plus 5 minutes. Generous on
 *   purpose, because overlap is real. Measured over the corpus before it was
 *   adopted: at this tolerance it flagged 2 recipes and both were genuinely
 *   wrong; at 10% it also flagged `tabbouleh`, where the bulgur soaks while the
 *   parsley is chopped, which is exactly the overlap this must tolerate.
 */
function timingProblems(recipe: RawRecipe): string[] {
  const total = recipe.prepMinutes + recipe.cookMinutes;
  const minutes = recipe.steps.map((step) => step.minutes ?? 0);
  const problems: string[] = [];
  if (total <= 0) return problems;

  const longest = Math.max(0, ...minutes);
  if (longest > total) {
    problems.push(
      `a single step takes ${longest} minutes but the recipe claims ${total} in total. ` +
        'Waiting — soaking, proofing, resting, cooling — belongs in prepMinutes.',
    );
  }

  const sum = minutes.reduce((carry, value) => carry + value, 0);
  const allowed = total * 1.25 + 5;
  if (sum > allowed) {
    problems.push(
      `the steps add up to ${sum} minutes against a stated ${total}. Overlap is ` +
        `expected and tolerated up to ${Math.round(allowed)}; beyond that the total is ` +
        'understating what the cook is in for.',
    );
  }
  return problems;
}

/**
 * Tags that are a claim about the recipe rather than a theme.
 *
 * Read off the corpus rather than invented. `beginner` was already
 * `difficulty: easy` in 80 of the 82 recipes carrying it.
 *
 * `quick` WAS SET AT 40 AND THAT WAS THE WRONG NUMBER. The Stage 3P.2 audit
 * that chose it measured a median of 18 minutes and a 90th percentile of 30,
 * then wrote the threshold at 40 — far enough out to admit every existing tag
 * without argument, which is the definition of a rule fitted to the data
 * rather than to the promise.
 *
 * Thirty is the number the product already uses. `quick` is not an internal
 * label: it is the ⚡ Quick collection on Discover, and Home's own rail asks
 * the engine for `maxMinutes: 30`. So the app was offering a 35-minute recipe
 * under a heading its own fast rail would have excluded.
 *
 * Re-measured over all 192 recipes at ≤30: 82 of the 86 quick-tagged recipes
 * already qualified, min 5, median 18, p90 28. The four that did not —
 * avgolemono, baked-salmon-vegetables, beef-tacos, shawarma-chicken — all sat
 * at exactly 35 and lost the tag. Losing 4.7% of a collection is not an
 * unreasonable removal; promising thirty minutes and taking thirty-five is.
 */
const QUICK_MINUTES = 30;

function tagProblems(recipe: RawRecipe): string[] {
  const problems: string[] = [];
  const total = recipe.prepMinutes + recipe.cookMinutes;
  if (recipe.tags.includes('quick') && total > QUICK_MINUTES) {
    problems.push(`tagged quick but takes ${total} minutes; quick means ${QUICK_MINUTES} or under`);
  }
  if (recipe.tags.includes('beginner') && recipe.difficulty !== 'easy') {
    problems.push(`tagged beginner but difficulty is "${recipe.difficulty}"`);
  }
  return problems;
}

// --- Ingredients hidden in prose -------------------------------------------

/**
 * A quantity in a step must belong to an ingredient on the list.
 *
 * `lokmet-el-qadi` shipped claiming to be a five-line recipe and then asked for
 * "250ml of warm water" in step one. The water was real, measured and required,
 * and it was nowhere the shopping list, the pantry match or the ≤5 count could
 * see it. Looking for the same shape across the dataset found THIRTY-TWO MORE,
 * every one of them water in a soup or a rice pot.
 *
 * "The app assumes water" is true for a splash and false for 1.2 litres. If the
 * recipe measures it, the cook needs it, and the line count is a claim about
 * what the cook needs.
 *
 * TWO THINGS KEEP THIS FROM CRYING WOLF, both measured against the real corpus
 * rather than guessed:
 *
 *   "two tablespoons of THE oil" is a back-reference to a line already on the
 *   list, so an explicit `the` is skipped.
 *
 *   "2 tbsp oil" in a recipe that lists OLIVE oil is shorthand for that line,
 *   not a second oil. A phrase that appears as a whole word inside a listed
 *   ingredient's name is treated the same way.
 *
 * With both, the false-positive rate over 172 recipes is zero.
 *
 * It only sees what it can resolve, so it is a floor and not a proof. An
 * unmeasured ingredient in prose still gets through, and catching that needs a
 * person reading the steps.
 */
const MEASURED_IN_PROSE =
  /(\d+(?:[.,]\d+)?)\s*(ml|l|g|kg|tbsp|tsp|cups?|tablespoons?|teaspoons?)\b\s*(?:of\s+)?(the\s+)?([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2})/gi;

function ingredientsHiddenInProse(recipe: RawRecipe): string[] {
  const listed = new Set(recipe.ingredients.map((line) => line.slug));
  const listedNames = [...listed].map((slug) =>
    (CATALOGUE_BY_SLUG.get(slug)?.name ?? slug).toLowerCase(),
  );
  const problems: string[] = [];

  for (const [index, step] of recipe.steps.entries()) {
    for (const match of step.text.matchAll(MEASURED_IN_PROSE)) {
      if (match[3]) continue;
      const words = (match[4] ?? '').trim().split(/\s+/).filter(Boolean);
      // Longest phrase first, so "warm water" is preferred over "warm".
      for (let take = Math.min(3, words.length); take >= 1; take -= 1) {
        const phrase = words.slice(0, take).join(' ');
        const resolved = resolveIngredient(phrase);
        if (!resolved) continue;
        if (listed.has(resolved.slug)) break;
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (listedNames.some((name) => new RegExp(`\\b${escaped}\\b`).test(name))) break;
        problems.push(
          `step ${index + 1} measures "${match[0].trim()}" but "${resolved.slug}" is not an ` +
            'ingredient line. A measured ingredient belongs on the list, not only in prose.',
        );
        break;
      }
    }
  }
  return problems;
}

// --- Photography provenance ------------------------------------------------

/**
 * THE IMAGE MANIFEST IS AUTHORITATIVE for any recipe that has a photograph.
 *
 * The recipe JSON carries an `image` block describing the BRANDED PLACEHOLDER —
 * "generated", "Akla kitchen", CC0 — which is true right up until a real
 * photograph is acquired for that recipe, and false the moment one is. All 79
 * photographed recipes were describing a Wikimedia CC-BY-SA photograph as our
 * own CC0 work.
 *
 * The app never saw it: `imageAttribution()` reads the bundled manifest first,
 * so the credits screen was always right. The generated SEED was not, and a
 * seed is what a database would persist — so the false claim was one apply
 * away from being the system of record.
 *
 * Fixed here rather than in eleven JSON files, because the same thing is true
 * of the other sixty-eight and of every recipe photographed from now on. The
 * path is derived too, not just the credit: the fetcher names the file after
 * the BYTES it received, so a photograph that came back as WebP is
 * `sahlab.webp`, and a hand-written `curated/sahlab.jpg` would point at
 * nothing.
 *
 * AND THE CONVERSE, ADDED IN STAGE 3P.3. A recipe with NO photograph must
 * carry `image: null`, not a placeholder block. Ninety-four did carry one —
 * `curated/<slug>.jpg`, "generated", "Akla kitchen", CC0 — naming an asset
 * that has never existed. The first gate only refused a `generated` claim
 * where a photograph WAS recorded, so a phantom claim where none was recorded
 * passed every check.
 *
 * That is not only a false statement in the seed. `resolveRecipeImageUrl`
 * builds a Storage URL from `image.path` the moment a Supabase project is
 * configured, and `RecipeImage` prefers any URL over the branded fallback —
 * so ninety-four cards in a production build would have requested an object
 * that is not in the bucket and rendered a grey box, which is precisely the
 * state that function's own comment says it exists to prevent.
 *
 * The rule is now simple enough to state in one line: the manifest decides
 * whether a recipe has a photograph, and the JSON never gets a vote.
 */
type PhotoProvenance = {
  recipeSlug: string;
  path: string;
  sourcePage: string;
  creator: string;
  license: string;
  attribution: string | null;
};

function photographyBySlug(): Map<string, PhotoProvenance> {
  if (!existsSync(IMAGE_MANIFEST)) return new Map();
  const manifest = JSON.parse(readFileSync(IMAGE_MANIFEST, 'utf8')) as {
    images: PhotoProvenance[];
  };
  return new Map(manifest.images.map((entry) => [entry.recipeSlug, entry]));
}

function applyPhotographyProvenance(entries: { file: string; recipe: RawRecipe }[]): string[] {
  const photos = photographyBySlug();
  const overridden: string[] = [];

  for (const { recipe } of entries) {
    const photo = photos.get(recipe.slug);

    if (!photo) {
      // No photograph, so no image block — whatever `source` it claims. A
      // "generated"/"Akla kitchen"/CC0 block naming `curated/<slug>.jpg` is a
      // claim about a file that does not exist, and the app turns it into a
      // Storage URL as soon as one is configured.
      if (recipe.image) {
        overridden.push(
          `${recipe.slug}: carries an image block (${recipe.image.source}, ` +
            `"${recipe.image.path}") but no photograph is recorded in the manifest. ` +
            'A recipe on the branded fallback has image: null.',
        );
      }
      continue;
    }

    // A recipe may not CLAIM a photograph it did not take. The overlay would
    // correct it silently, and a dataset that is wrong-but-corrected is a
    // dataset the next author copies the wrong half of.
    if (recipe.image && (recipe.image.source === 'generated' || recipe.image.source === 'owned')) {
      overridden.push(
        `${recipe.slug}: image.source is "${recipe.image.source}" but the photograph is ` +
          `${photo.creator}, ${photo.license}. Set image to null and let the manifest say so.`,
      );
      continue;
    }

    recipe.image = {
      // The bucket convention is `curated/<file>`; the file name comes from the
      // manifest so the extension follows the bytes actually downloaded.
      path: `curated/${photo.path}`,
      source: 'openly_licensed',
      creator: photo.creator,
      license: photo.license,
      attribution: photo.attribution,
      sourceUrl: photo.sourcePage,
    };
  }

  return overridden;
}

// --- Validate --------------------------------------------------------------

/**
 * Allergens the recipe's own ingredients imply.
 *
 * SAFETY-CRITICAL. A recipe that lists mozzarella and forgets to declare
 * `dairy` would pass every other check and reach someone with an allergy, so
 * the declaration is not trusted — it is checked against the catalogue and the
 * import fails on a gap.
 */
function impliedAllergens(recipe: RawRecipe): Set<string> {
  const found = new Set<string>();
  for (const line of recipe.ingredients) {
    const entry = CATALOGUE_BY_SLUG.get(line.slug);
    // INTRINSIC ONLY, deliberately. `possibleAllergens` is brand-dependent
    // risk, and forcing a recipe to DECLARE it would turn "the box might have
    // barley malt in it" into "this dish contains gluten" — a claim about the
    // food rather than about the shelf. Allergy filtering still excludes on
    // it (see `violatesAllergens`); the declaration is a different question.
    entry?.allergens.forEach((allergen) => found.add(allergen));
  }
  return found;
}

/** Diet tags the ingredients contradict. */
function dietContradictions(recipe: RawRecipe): string[] {
  const problems: string[] = [];
  const categories = new Set<string>();
  const allergens = impliedAllergens(recipe);
  for (const line of recipe.ingredients) {
    const entry = CATALOGUE_BY_SLUG.get(line.slug);
    if (entry) categories.add(entry.category);
  }

  const hasMeatOrFish = recipe.ingredients.some((line) => {
    const entry = CATALOGUE_BY_SLUG.get(line.slug);
    return entry?.category === 'protein' && !VEGETARIAN_PROTEINS.has(line.slug);
  });

  if (recipe.dietTags.includes('vegetarian') && hasMeatOrFish) {
    problems.push('tagged vegetarian but contains meat or fish');
  }
  if (recipe.dietTags.includes('vegan')) {
    if (hasMeatOrFish) problems.push('tagged vegan but contains meat or fish');
    for (const animal of ['dairy', 'eggs'] as const) {
      if (allergens.has(animal)) problems.push(`tagged vegan but contains ${animal}`);
    }
    // Honey has no allergen and is not meat, so nothing above catches it. A
    // recipe that declares itself vegan is TRUSTED by `satisfiesDiet` — the
    // declaration short-circuits the inference — so this is the only place a
    // false vegan claim can be stopped.
    for (const line of recipe.ingredients) {
      if (NON_VEGAN_SLUGS.has(line.slug)) {
        problems.push(`tagged vegan but contains ${line.slug}`);
      }
    }
  }
  if (recipe.dietTags.includes('vegetarian')) {
    for (const line of recipe.ingredients) {
      if (NON_VEGETARIAN_SLUGS.has(line.slug)) {
        problems.push(`tagged vegetarian but contains ${line.slug}`);
      }
    }
  }
  if (recipe.dietTags.includes('pescatarian')) {
    const hasLandMeat = recipe.ingredients.some((line) => {
      const entry = CATALOGUE_BY_SLUG.get(line.slug);
      return entry?.category === 'protein' && LAND_MEAT.has(line.slug);
    });
    if (hasLandMeat) problems.push('tagged pescatarian but contains land meat');
  }
  if (recipe.dietTags.includes('keto') && (recipe.nutrition.carbs ?? 0) > 25) {
    problems.push(`tagged keto but has ${recipe.nutrition.carbs}g carbs per serving`);
  }
  return problems;
}

/**
 * Animal products with no allergen and no meat category.
 *
 * Must stay in step with `NON_VEGAN_SLUGS` in `features/recipes/safety.ts`,
 * which is where the runtime inference lives. Two copies because they answer
 * different questions — that one decides what to SHOW a vegan, this one
 * decides what a recipe may CLAIM — and a gate that imports its rule from the
 * thing it is checking can only ever agree with it.
 */
const NON_VEGAN_SLUGS = new Set(['honey', 'honeycomb', 'gelatin']);
const NON_VEGETARIAN_SLUGS = new Set(['gelatin']);

/** Catalogue proteins that are not animal flesh. */
const VEGETARIAN_PROTEINS = new Set([
  'eggs',
  'tofu',
  'chickpeas',
  'lentils',
  'green-lentils',
  'split-peas',
  'white-beans',
  'kidney-beans',
  'black-eyed-peas',
  'fava-beans',
  'soybeans',
  'edamame',
  'falafel-mix',
]);

const SEAFOOD = new Set([
  'tilapia',
  'shrimp',
  'tuna-can',
  'salmon',
  'sea-bass',
  'sea-bream',
  'mullet',
  'mackerel',
  'sardines',
  'herring',
  'salted-fish',
  'calamari',
  'crab',
  'mussels',
  'anchovy',
]);

const LAND_MEAT = new Set(
  INGREDIENT_CATALOGUE.filter(
    (entry) =>
      entry.category === 'protein' &&
      !VEGETARIAN_PROTEINS.has(entry.slug) &&
      !SEAFOOD.has(entry.slug),
  ).map((entry) => entry.slug),
);

function validate(entries: { file: string; recipe: RawRecipe }[]): void {
  const problems: string[] = [];
  const seenSlugs = new Map<string, string>();
  const seenIds = new Map<string, string>();
  const seenTitles: { slug: string; normalised: string }[] = [];

  for (const { file, recipe } of entries) {
    const where = `${file}:${recipe.slug ?? '(no slug)'}`;
    const fail = (message: string) => problems.push(`${where} — ${message}`);

    try {
      // Identity
      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(recipe.slug ?? '')) {
        fail(`slug "${recipe.slug}" must be lowercase kebab-case`);
        continue;
      }
      const previous = seenSlugs.get(recipe.slug);
      if (previous) fail(`duplicate slug, already defined in ${previous}`);
      seenSlugs.set(recipe.slug, file);

      const id = uuidv5(`recipe:${recipe.slug}`);
      const clash = seenIds.get(id);
      if (clash) fail(`id collides with ${clash}`);
      seenIds.set(id, recipe.slug);

      // Text
      for (const [field, value] of [
        ['title', recipe.title],
        ['titleAr', recipe.titleAr],
        ['description', recipe.description],
        ['descriptionAr', recipe.descriptionAr],
      ] as const) {
        if (typeof value !== 'string' || value.trim().length === 0) fail(`${field} is empty`);
      }
      if (recipe.titleAr && !ARABIC.test(recipe.titleAr)) {
        fail(`titleAr "${recipe.titleAr}" contains no Arabic`);
      }
      if (recipe.descriptionAr && !ARABIC.test(recipe.descriptionAr)) {
        fail('descriptionAr contains no Arabic');
      }

      const normalised = normaliseTitle(recipe.title);
      for (const seen of seenTitles) {
        const score = similarity(normalised, seen.normalised);
        if (score >= TITLE_SIMILARITY_LIMIT) {
          fail(`title is ${(score * 100).toFixed(0)}% similar to "${seen.slug}"`);
        }
      }
      seenTitles.push({ slug: recipe.slug, normalised });

      // Vocabularies
      oneOf(recipe.cuisine, CUISINES, 'cuisine', where);
      oneOf(recipe.difficulty, DIFFICULTIES, 'difficulty', where);
      if (recipe.mealTypes.length === 0) fail('needs at least one meal type');
      recipe.mealTypes.forEach((value) => oneOf(value, MEAL_TYPES, 'mealType', where));
      recipe.dietTags.forEach((value) => oneOf(value, DIETARY_PREFERENCES, 'dietTag', where));
      recipe.allergens.forEach((value) => oneOf(value, ALLERGENS, 'allergen', where));
      recipe.appliances.forEach((value) => oneOf(value, APPLIANCES, 'appliance', where));
      recipe.tags.forEach((tag) => {
        if (!/^[a-z0-9-]+$/.test(tag)) fail(`tag "${tag}" must be lowercase kebab-case`);
      });

      // Numbers
      inRange(recipe.prepMinutes, BOUNDS.prepMinutes, 'prepMinutes', where);
      inRange(recipe.cookMinutes, BOUNDS.cookMinutes, 'cookMinutes', where);
      inRange(recipe.prepMinutes + recipe.cookMinutes, BOUNDS.totalMinutes, 'total time', where);
      inRange(recipe.servings, BOUNDS.servings, 'servings', where);
      if (!Number.isInteger(recipe.servings)) fail('servings must be a whole number');
      inRange(recipe.nutrition.calories, BOUNDS.calories, 'calories', where);
      inRange(recipe.nutrition.protein, BOUNDS.protein, 'protein', where);
      inRange(recipe.nutrition.carbs, BOUNDS.carbs, 'carbs', where);
      inRange(recipe.nutrition.fat, BOUNDS.fat, 'fat', where);
      inRange(recipe.nutrition.fiber, BOUNDS.fiber, 'fiber', where);

      // Ingredients — the foreign key that matters most.
      if (
        recipe.ingredients.length < BOUNDS.ingredients[0] ||
        recipe.ingredients.length > BOUNDS.ingredients[1]
      ) {
        fail(`has ${recipe.ingredients.length} ingredients, outside 2–24`);
      }
      const seenIngredients = new Set<string>();
      for (const line of recipe.ingredients) {
        if (!CATALOGUE_BY_SLUG.has(line.slug)) {
          fail(`ingredient "${line.slug}" is not in the ingredient catalogue`);
          continue;
        }
        if (seenIngredients.has(line.slug)) fail(`ingredient "${line.slug}" listed twice`);
        seenIngredients.add(line.slug);
        if (line.unit != null) oneOf(line.unit, UNITS, `unit for ${line.slug}`, where);
        if (line.quantity != null && (!Number.isFinite(line.quantity) || line.quantity <= 0)) {
          fail(`quantity for ${line.slug} is ${line.quantity}`);
        }
      }
      const cookable = recipe.ingredients.filter(
        (line) => !line.optional && !line.garnish && !line.staple,
      );
      if (cookable.length === 0) fail('every ingredient is optional, garnish or staple');

      // Steps
      if (recipe.steps.length < BOUNDS.steps[0] || recipe.steps.length > BOUNDS.steps[1]) {
        fail(`has ${recipe.steps.length} steps, outside 2–14`);
      }
      recipe.steps.forEach((step, index) => {
        if (!step.text?.trim()) fail(`step ${index + 1} has no text`);
        if (!step.textAr?.trim()) fail(`step ${index + 1} has no Arabic text`);
        else if (!ARABIC.test(step.textAr)) fail(`step ${index + 1} Arabic contains no Arabic`);
        if (step.safety && !step.safetyAr) fail(`step ${index + 1} safety note is not translated`);
        for (const used of step.uses ?? []) {
          if (!seenIngredients.has(used)) {
            fail(`step ${index + 1} references "${used}", which the recipe does not list`);
          }
        }
      });

      // Allergens — declared must cover implied.
      const implied = impliedAllergens(recipe);
      const declared = new Set(recipe.allergens);
      for (const allergen of implied) {
        if (!declared.has(allergen)) {
          fail(`contains ${allergen} through its ingredients but does not declare it`);
        }
      }

      // Diet tags
      dietContradictions(recipe).forEach(fail);

      // Nothing required may live only in the instructions.
      ingredientsHiddenInProse(recipe).forEach(fail);

      // The clock, and the tags that make a claim about it.
      timingProblems(recipe).forEach(fail);
      tagProblems(recipe).forEach(fail);

      // Image metadata
      if (recipe.image) {
        oneOf(recipe.image.source, RECIPE_IMAGE_SOURCES, 'image.source', where);
        if (!recipe.image.path?.trim()) fail('image has no path');
        if (!recipe.image.license?.trim()) fail('image has no licence');
        if (recipe.image.source === 'openly_licensed' && !recipe.image.sourceUrl) {
          fail('an openly licensed image must record where it came from');
        }
      }
    } catch (error) {
      if (error instanceof ImportError) problems.push(error.message);
      else throw error;
    }
  }

  if (problems.length > 0) {
    throw new ImportError(
      `${problems.length} problem(s) in the recipe dataset:\n` +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    );
  }
}

// --- Emit ------------------------------------------------------------------

function emitIngredient(recipeId: string, line: RawIngredient, index: number): string {
  const entry = CATALOGUE_BY_SLUG.get(line.slug)!;
  const id = uuidv5(`recipe-ingredient:${recipeId}:${line.slug}`);
  // The SAME derivation the seed generator uses, so a bundled recipe line and
  // its Postgres row agree on which catalogue ingredient they mean. The
  // catalogue's natural key is the slug; the uuid is derived from it.
  const ingredientId = uuidv5(`ingredient:${entry.slug}`);
  return (
    `    { id: '${id}', ingredientId: '${ingredientId}', slug: '${entry.slug}', ` +
    `name: ${ts(entry.name)}, quantity: ${line.quantity ?? 'null'}, ` +
    `unit: ${ts(line.unit ?? null)}, preparation: ${ts(line.prep ?? null)}, ` +
    `isOptional: ${Boolean(line.optional)}, isGarnish: ${Boolean(line.garnish)}, ` +
    `isPantryStaple: ${Boolean(line.staple)}, ` +
    `notes: ${ts(line.notes ?? null)}, sortOrder: ${index + 1} }`
  );
}

function emitStep(recipeId: string, step: RawStep, index: number): string {
  const id = uuidv5(`recipe-step:${recipeId}:${index + 1}`);
  const uses = (step.uses ?? []).map((slug) => ts(CATALOGUE_BY_SLUG.get(slug)!.name)).join(', ');
  return (
    `    { id: '${id}', stepNumber: ${index + 1}, instruction: ${ts(step.text)}, ` +
    `instructionAr: ${ts(step.textAr)}, durationMinutes: ${step.minutes ?? 'null'}, ` +
    `ingredientRefs: [${uses}], safetyNote: ${ts(step.safety ?? null)}, ` +
    `safetyNoteAr: ${ts(step.safetyAr ?? null)} }`
  );
}

function emitImage(image: RawImage | null): string {
  if (!image) return 'null';
  return (
    `{ path: ${ts(image.path)}, source: '${image.source}', ` +
    `creator: ${ts(image.creator ?? null)}, license: ${ts(image.license)}, ` +
    `attribution: ${ts(image.attribution ?? null)}, sourceUrl: ${ts(image.sourceUrl ?? null)} }`
  );
}

function emitRecipe(recipe: RawRecipe): string {
  const id = uuidv5(`recipe:${recipe.slug}`);
  const strings = (values: string[]) => `[${values.map((value) => `'${value}'`).join(', ')}]`;

  return [
    '  {',
    `    id: '${id}',`,
    `    slug: '${recipe.slug}',`,
    `    title: ${ts(recipe.title)},`,
    `    titleAr: ${ts(recipe.titleAr)},`,
    `    description: ${ts(recipe.description)},`,
    `    descriptionAr: ${ts(recipe.descriptionAr)},`,
    `    imageUrl: null,`,
    `    image: ${emitImage(recipe.image)},`,
    `    source: 'curated',`,
    `    cuisine: '${recipe.cuisine}',`,
    `    mealTypes: ${strings(recipe.mealTypes)},`,
    `    difficulty: '${recipe.difficulty}',`,
    `    prepMinutes: ${recipe.prepMinutes},`,
    `    cookMinutes: ${recipe.cookMinutes},`,
    `    baseServings: ${recipe.servings},`,
    `    nutrition: { calories: ${recipe.nutrition.calories}, proteinGrams: ${recipe.nutrition.protein}, ` +
      `carbsGrams: ${recipe.nutrition.carbs}, fatGrams: ${recipe.nutrition.fat}, fiberGrams: ${recipe.nutrition.fiber} },`,
    `    allergens: ${strings(recipe.allergens)},`,
    `    dietTags: ${strings(recipe.dietTags)},`,
    `    requiredAppliances: ${strings(recipe.appliances)},`,
    `    tags: ${strings(recipe.tags)},`,
    `    createdAt: '2026-01-01T00:00:00.000Z',`,
    '    ingredients: [',
    ...recipe.ingredients.map((line, index) => `${emitIngredient(id, line, index)},`),
    '    ],',
    '    steps: [',
    ...recipe.steps.map((step, index) => `${emitStep(id, step, index)},`),
    '    ],',
    '  },',
  ].join('\n');
}

function emit(entries: { file: string; recipe: RawRecipe }[]): string {
  const recipes = entries.map(({ recipe }) => recipe).sort((a, b) => a.slug.localeCompare(b.slug));

  return [
    '// GENERATED BY scripts/import-recipes.ts — DO NOT EDIT.',
    '// Source: data/recipes/*.json. Run `npm run recipes:import` after editing it.',
    '//',
    '// Ids are UUIDv5 of the slug, so a recipe carries the same primary key in',
    '// this bundle and in Postgres — which is what lets a guest save a recipe',
    '// offline and still resolve it after signing in.',
    "import type { Recipe } from '@/types/domain';",
    '',
    `/** ${recipes.length} curated recipes. */`,
    'export const RECIPE_CATALOGUE: Recipe[] = [',
    ...recipes.map(emitRecipe),
    '];',
    '',
  ].join('\n');
}

// --- Main ------------------------------------------------------------------

/**
 * Formats the generated source with the repository's own Prettier config.
 *
 * Without this, `npm run format` reformats the generated file and
 * `recipes:import --check` then reports drift that is not drift — two CI
 * checks contradicting each other, with no change to the data behind either.
 */
async function format(source: string): Promise<string> {
  const prettier = await import('prettier');
  const config = await prettier.resolveConfig(OUTPUT);
  return prettier.format(source, { ...config, filepath: OUTPUT, parser: 'typescript' });
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');

  let entries: { file: string; recipe: RawRecipe }[];
  try {
    entries = loadDataset();
    // Before validation, so the rules below see the provenance that will
    // actually be emitted rather than the placeholder it replaced.
    const falseClaims = applyPhotographyProvenance(entries);
    if (falseClaims.length > 0) {
      throw new ImportError(
        `${falseClaims.length} recipe(s) describe a photograph that is not theirs or ` +
          `is not there:\n${falseClaims.map((claim) => `  - ${claim}`).join('\n')}`,
      );
    }
    validate(entries);
  } catch (error) {
    if (error instanceof ImportError) {
      console.error(`Recipe import failed.\n${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const output = await format(emit(entries));

  if (check) {
    const current = readFileSync(OUTPUT, 'utf8');
    if (current !== output) {
      console.error(
        'catalogue.generated.ts is out of step with data/recipes/*.json.\n' +
          'Run `npm run recipes:import` and commit the result.',
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Recipe catalogue is current (${entries.length} recipes).`);
    return;
  }

  writeFileSync(OUTPUT, output, 'utf8');

  const cuisines = new Map<string, number>();
  for (const { recipe } of entries) {
    cuisines.set(recipe.cuisine, (cuisines.get(recipe.cuisine) ?? 0) + 1);
  }
  const spread = [...cuisines.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cuisine, count]) => `${cuisine} ${count}`)
    .join(', ');

  console.log(`Imported ${entries.length} recipes into catalogue.generated.ts`);
  console.log(`  ${spread}`);
}

void main();
