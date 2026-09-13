/**
 * Dataset quality report.
 *
 *     npm run recipes:audit
 *
 * `recipes:import` is the GATE — it refuses to emit a dataset with a broken
 * reference or an undeclared allergen. This is the different question the gate
 * cannot answer: is the catalogue any good?
 *
 * A hundred and fifty recipes that are all chicken traybakes pass every
 * structural check and make the product useless, because "what can I cook"
 * gets the same answer whatever the user has. So this measures spread —
 * across cuisines, meals, proteins, ingredient counts — and looks for the
 * clusters that indicate padding.
 *
 * It reports rather than fails: the numbers are a judgement call, and a build
 * that breaks because a cuisine gained a recipe helps nobody.
 */
import {
  INGREDIENT_CATALOGUE,
  SUGGESTED_KITCHEN_BASICS,
  UNIVERSAL_BASICS,
} from '../src/features/ingredients/catalogue.ts';
import { RECIPE_CATALOGUE } from '../src/features/recipes/catalogue.generated.ts';

type Recipe = (typeof RECIPE_CATALOGUE)[number];

const BY_SLUG = new Map(INGREDIENT_CATALOGUE.map((entry) => [entry.slug, entry]));

function tally<T extends string>(values: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return new Map([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

function bar(count: number, max: number, width = 28): string {
  return '█'.repeat(Math.max(1, Math.round((count / max) * width)));
}

function section(title: string): void {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function printTally(counts: Map<string, number>, indent = '  '): void {
  const max = Math.max(...counts.values(), 1);
  for (const [key, count] of counts) {
    console.log(`${indent}${key.padEnd(18)} ${String(count).padStart(4)}  ${bar(count, max)}`);
  }
}

/** Ingredient slugs a recipe actually needs — not optional, not a garnish. */
function essentialSlugs(recipe: Recipe): string[] {
  return recipe.ingredients
    .filter((line) => !line.isOptional && !line.isGarnish)
    .map((line) => line.slug)
    .filter((slug): slug is string => slug !== null);
}

/**
 * How alike are two recipes, by what goes in them?
 *
 * Jaccard over essential ingredients. Two dishes sharing most of their
 * ingredients are either the same dish twice or a variant pretending to be a
 * second recipe — and either way the catalogue is smaller than it claims.
 */
function similarity(a: Recipe, b: Recipe): number {
  const left = new Set(essentialSlugs(a));
  const right = new Set(essentialSlugs(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const slug of left) if (right.has(slug)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function main(): void {
  const recipes = RECIPE_CATALOGUE;
  console.log(`\n\x1b[1mAkla recipe dataset — ${recipes.length} recipes\x1b[0m`);

  // `?? 'unknown'` throughout: the Recipe type allows nulls for AI-generated
  // recipes, and a report that crashes on one is a report nobody runs.
  section('Cuisine');
  printTally(tally(recipes.map((r) => r.cuisine ?? 'unknown')));

  section('Meal type (a recipe may serve several)');
  printTally(tally(recipes.flatMap((r) => r.mealTypes)));

  section('Difficulty');
  printTally(tally(recipes.map((r) => r.difficulty ?? 'unknown')));

  section('Ingredient count per recipe');
  const sizes = recipes.map((r) => r.ingredients.length);
  const buckets = tally(
    sizes.map((n) => (n <= 5 ? '2-5' : n <= 8 ? '6-8' : n <= 11 ? '9-11' : '12+')),
  );
  printTally(new Map([...buckets.entries()].sort()));
  console.log(
    `  min ${Math.min(...sizes)}, max ${Math.max(...sizes)}, ` +
      `mean ${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)}`,
  );

  section('Diet');
  const vegetarian = recipes.filter((r) => r.dietTags.includes('vegetarian')).length;
  const vegan = recipes.filter((r) => r.dietTags.includes('vegan')).length;
  const MENA_CUISINES: readonly string[] = ['egyptian', 'levantine', 'turkish'];
  const mena = recipes.filter((r) => MENA_CUISINES.includes(r.cuisine ?? '')).length;
  console.log(`  vegetarian         ${String(vegetarian).padStart(4)}`);
  console.log(`  vegan              ${String(vegan).padStart(4)}`);
  console.log(`  Egyptian/MENA      ${String(mena).padStart(4)}`);

  section('Primary protein');
  const PROTEINS: Record<string, string[]> = {
    chicken: ['chicken-breast', 'chicken-thigh', 'chicken-whole', 'chicken-wings'],
    beef: ['ground-beef', 'beef-stew', 'beef-steak', 'veal'],
    lamb: ['lamb', 'lamb-chops'],
    fish: ['tilapia', 'sea-bass', 'sea-bream', 'mullet', 'tuna-can', 'salmon', 'sardines',
      'mackerel', 'herring', 'salted-fish', 'anchovy'],
    seafood: ['shrimp', 'calamari', 'mussels', 'crab'],
    eggs: ['eggs', 'egg-white'],
    legumes: ['lentils', 'red-lentils', 'green-lentils', 'chickpeas', 'fava-beans',
      'white-beans', 'kidney-beans', 'black-eyed-peas'],
    dairyLed: ['halloumi', 'feta', 'white-cheese', 'labneh'],
  };
  const proteinCounts = new Map<string, number>();
  for (const [label, slugs] of Object.entries(PROTEINS)) {
    const set = new Set(slugs);
    proteinCounts.set(
      label,
      recipes.filter((r) => essentialSlugs(r).some((slug) => set.has(slug))).length,
    );
  }
  const noProtein = recipes.filter(
    (r) => !essentialSlugs(r).some((slug) => BY_SLUG.get(slug)?.category === 'protein'),
  ).length;
  printTally(new Map([...proteinCounts.entries()].sort((a, b) => b[1] - a[1])));
  console.log(`  (no protein line)  ${String(noProtein).padStart(4)}`);

  section('Ingredient coverage');
  const used = new Set(
    recipes
      .flatMap((r) => r.ingredients.map((l) => l.slug))
      .filter((slug): slug is string => slug !== null),
  );
  console.log(`  distinct ingredients used   ${used.size} of ${INGREDIENT_CATALOGUE.length}`);
  const unused = INGREDIENT_CATALOGUE.filter((entry) => !used.has(entry.slug));
  console.log(`  never used                  ${unused.length}`);

  section('Most-used ingredients');
  const usage = tally(
    recipes.flatMap((r) => essentialSlugs(r)).map((slug) => BY_SLUG.get(slug)?.name ?? slug),
  );
  printTally(new Map([...usage.entries()].slice(0, 15)));

  section('Ingredients excused from the missing count');
  // WHAT THIS ANSWERS. A line marked `staple` in the recipe data is excused
  // from "what am I still missing" — so an overbroad flag makes a dish look
  // more cookable than it is. That is exactly the complaint this audit exists
  // to catch: a cook holding rice and tomatoes was told Tomato Rice was one
  // ingredient away.
  //
  // Three verdicts, and only the first is free:
  //   implicit    — water and salt. Assumed for everybody, forever.
  //   configured  — offered on the onboarding basics screen. Counts only for
  //                 a user who ticked it.
  //   ORDINARY    — neither. Excusing it hides a real shopping trip.
  const stapleLines = new Map<string, number>();
  for (const recipe of recipes) {
    for (const line of recipe.ingredients) {
      if (!line.isPantryStaple || !line.slug) continue;
      stapleLines.set(line.slug, (stapleLines.get(line.slug) ?? 0) + 1);
    }
  }
  const verdictOf = (slug: string): string => {
    if (UNIVERSAL_BASICS.has(slug)) return 'implicit';
    if (SUGGESTED_KITCHEN_BASICS.includes(slug)) return 'configured';
    return 'ORDINARY';
  };
  const ranked = [...stapleLines.entries()].sort((a, b) => b[1] - a[1]);
  console.log('  recipes   ingredient           verdict     category');
  for (const [slug, count] of ranked) {
    const entry = BY_SLUG.get(slug);
    console.log(
      `  ${String(count).padStart(7)}   ${slug.padEnd(20)} ${verdictOf(slug).padEnd(11)} ` +
        `${entry?.category ?? '?'}`,
    );
  }
  const ordinary = ranked.filter(([slug]) => verdictOf(slug) === 'ORDINARY');
  console.log(
    `\n  ${stapleLines.size} distinct ingredients excused across ` +
      `${[...stapleLines.values()].reduce((a, b) => a + b, 0)} lines; ` +
      `${ordinary.length} of them are ORDINARY ingredients.`,
  );
  if (ordinary.length > 0) {
    console.log(
      '  Each ORDINARY row is a required ingredient being hidden from the\n' +
        '  missing count. Either the flag is wrong, or it belongs on the\n' +
        '  suggested-basics list where a user can decide for themselves.',
    );
  }

  section('What the app assumes, for everybody, with nobody asked');
  console.log(`  ${[...UNIVERSAL_BASICS].sort().join(', ')}`);
  console.log(`  offered but never assumed: ${SUGGESTED_KITCHEN_BASICS.join(', ')}`);

  section('Near-duplicate check (Jaccard over essential ingredients)');
  const SIMILAR = 0.7;
  const pairs: { a: string; b: string; score: number }[] = [];
  for (let i = 0; i < recipes.length; i += 1) {
    for (let j = i + 1; j < recipes.length; j += 1) {
      const score = similarity(recipes[i]!, recipes[j]!);
      if (score >= SIMILAR) {
        pairs.push({
          a: recipes[i]!.slug ?? recipes[i]!.id,
          b: recipes[j]!.slug ?? recipes[j]!.id,
          score,
        });
      }
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  if (pairs.length === 0) {
    console.log('  no pair shares 70% or more of its essential ingredients');
  } else {
    console.log(`  ${pairs.length} suspiciously similar pair(s):`);
    for (const pair of pairs.slice(0, 20)) {
      console.log(`    ${pair.score.toFixed(2)}  ${pair.a}  ~  ${pair.b}`);
    }
  }

  section('Recipes reachable from a small kitchen (approximate)');
  // The product question. If almost nothing is reachable from three or four
  // common ingredients, the catalogue cannot answer "what can I cook".
  //
  // APPROXIMATE on purpose: this script cannot import the matching engine
  // (the module graph reaches expo-constants, which will not load under the
  // type-stripping loader), so the assumption set is restated here. The
  // authoritative numbers come from `dataset.test.ts`, which runs the real
  // filter. If the two disagree, this one is wrong.
  const KITCHENS: Record<string, string[]> = {
    'chicken, rice, tomato': ['chicken-breast', 'rice', 'tomatoes'],
    'eggs, cheese, tomato': ['eggs', 'white-cheese', 'tomatoes'],
    'banana, oats, milk': ['banana', 'oats', 'milk'],
    'beef, pasta, tomato': ['ground-beef', 'pasta', 'tomatoes'],
    'lentils, rice, onion': ['red-lentils', 'rice', 'onions'],
  };
  const assumed = new Set(
    INGREDIENT_CATALOGUE.filter(
      (i) =>
        !i.isPerishable &&
        (i.category === 'spices' ||
          ['water', 'olive-oil', 'sunflower-oil', 'corn-oil', 'vinegar', 'onions', 'garlic',
            'sugar', 'flour', 'stock-cube', 'yeast', 'baking-powder', 'tomato-paste'].includes(
            i.slug,
          )),
    ).map((i) => i.slug),
  );

  for (const [label, have] of Object.entries(KITCHENS)) {
    const available = new Set([...assumed, ...have]);
    const counts = recipes.map(
      (r) =>
        r.ingredients.filter(
          (l) => !l.isOptional && !l.isGarnish && !l.isPantryStaple &&
            !(l.slug && available.has(l.slug)),
        ).length,
    );
    const at = (n: number) => counts.filter((c) => c <= n).length;
    console.log(
      `  ${label.padEnd(24)} exact ${String(at(0)).padStart(3)}   ` +
        `miss<=1 ${String(at(1)).padStart(3)}   miss<=2 ${String(at(2)).padStart(3)}`,
    );
  }

  console.log('');
}

main();
