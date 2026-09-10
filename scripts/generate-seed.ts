/**
 * Compiles the bundled TypeScript catalogues into `supabase/seed.sql`.
 *
 * The ingredient catalogue and the curated recipe set are authored once, in
 * TypeScript, because the app needs them at runtime for offline matching and
 * pricing. This script is what keeps the database in step with them, so there
 * is never a second copy to drift.
 *
 * Run:  npm run seed:generate
 * Then: commit the regenerated supabase/seed.sql.
 *
 * Implementation note: executed with Node's type-stripping loader, which is
 * why `catalogue.ts` and `fixtures.ts` are restricted to `import type`.
 */
import { writeFileSync } from 'node:fs';

import { INGREDIENT_CATALOGUE } from '../src/features/ingredients/catalogue.ts';
import { RECIPE_FIXTURES } from '../src/features/recipes/fixtures.ts';

import { uuidv5 } from './uuid.mjs';

/** Country and currency the bundled price estimates are quoted for. */
const SEED_COUNTRY = 'EG';
const SEED_CURRENCY = 'EGP';

/** Date the bundled price estimates were last reviewed. */
const PRICE_REVIEW_DATE = '2026-08-01';

/** Escapes a value as a SQL literal. Nulls become the keyword NULL. */
function lit(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${value.replace(/'/g, "''")}'`;
}

/** Escapes a string[] as a Postgres text[] literal. */
function textArray(values: readonly string[]): string {
  if (values.length === 0) return `'{}'`;
  const inner = values.map((value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return `'{${inner.join(',')}}'`;
}

const lines: string[] = [];

lines.push(
  '-- ---------------------------------------------------------------------------',
  '-- Akla — seed data.',
  '--',
  '-- GENERATED FILE. Do not edit by hand.',
  '--   source: src/features/ingredients/catalogue.ts',
  '--           src/features/recipes/fixtures.ts',
  '--   regenerate: npm run seed:generate',
  '--',
  '-- Idempotent: every statement upserts on a natural key, so re-running it',
  '-- against a populated database refreshes rather than duplicates.',
  '--',
  '-- PRICES IN THIS FILE ARE ESTIMATES, not live store prices. They reflect',
  `-- typical ${SEED_COUNTRY} supermarket shelf prices as reviewed on ${PRICE_REVIEW_DATE}`,
  '-- and must always be surfaced to users with the estimate treatment.',
  '-- ---------------------------------------------------------------------------',
  '',
  'begin;',
  '',
);

// --- Ingredients -----------------------------------------------------------

lines.push('-- === Ingredients ===========================================================', '');

for (const ingredient of INGREDIENT_CATALOGUE) {
  const id = uuidv5(`ingredient:${ingredient.slug}`);
  lines.push(
    `insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)`,
    `values (${lit(id)}, ${lit(ingredient.slug)}, ${lit(ingredient.name)}, ${lit(ingredient.nameAr)}, ${lit(ingredient.category)}, ${lit(ingredient.defaultUnit)}, ${lit(ingredient.gramsPerPiece)}, ${lit(ingredient.isCommonStaple)}, ${lit(ingredient.isPerishable)})`,
    `on conflict (slug) do update set`,
    `  name = excluded.name,`,
    `  name_ar = excluded.name_ar,`,
    `  category = excluded.category,`,
    `  default_unit = excluded.default_unit,`,
    `  grams_per_piece = excluded.grams_per_piece,`,
    `  is_common_staple = excluded.is_common_staple,`,
    `  is_perishable = excluded.is_perishable;`,
    '',
  );

  for (const allergen of ingredient.allergens) {
    lines.push(
      `insert into public.ingredient_allergens (ingredient_id, allergen)`,
      `values (${lit(id)}, ${lit(allergen)}) on conflict do nothing;`,
    );
  }

  for (const alias of ingredient.aliases) {
    lines.push(
      `insert into public.ingredient_aliases (ingredient_id, alias)`,
      `values (${lit(id)}, ${lit(alias)}) on conflict do nothing;`,
    );
  }

  lines.push(
    `insert into public.ingredient_price_estimates (`,
    `  ingredient_id, country, currency, unit, quantity,`,
    `  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)`,
    `values (${lit(id)}, ${lit(SEED_COUNTRY)}, ${lit(SEED_CURRENCY)}, ${lit(ingredient.priceUnit)}, ${lit(ingredient.priceQuantity)},`,
    `  ${lit(ingredient.priceLowMinor)}, ${lit(ingredient.priceAvgMinor)}, ${lit(ingredient.priceHighMinor)}, 'bundled_seed', ${lit(PRICE_REVIEW_DATE)})`,
    `on conflict (ingredient_id, country, unit, quantity) do update set`,
    `  estimated_low_minor = excluded.estimated_low_minor,`,
    `  estimated_avg_minor = excluded.estimated_avg_minor,`,
    `  estimated_high_minor = excluded.estimated_high_minor,`,
    `  last_updated = excluded.last_updated;`,
    '',
  );
}

// --- Recipes ---------------------------------------------------------------

lines.push('-- === Recipes ===============================================================', '');

for (const recipe of RECIPE_FIXTURES) {
  lines.push(
    `-- ${recipe.title}`,
    `insert into public.recipes (`,
    `  id, slug, title, description, image_url, source, cuisine, difficulty,`,
    `  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,`,
    `  created_by, is_public)`,
    `values (${lit(recipe.id)}, ${lit(recipe.slug)}, ${lit(recipe.title)}, ${lit(recipe.description)},`,
    `  ${lit(recipe.imageUrl)}, ${lit(recipe.source)}, ${lit(recipe.cuisine)}, ${lit(recipe.difficulty)},`,
    `  ${lit(recipe.prepMinutes)}, ${lit(recipe.cookMinutes)}, ${lit(recipe.baseServings)},`,
    `  ${lit(recipe.nutrition.calories)}, ${lit(recipe.nutrition.proteinGrams)}, ${lit(recipe.nutrition.carbsGrams)},`,
    `  ${lit(recipe.nutrition.fatGrams)}, ${lit(recipe.nutrition.fiberGrams)}, null, true)`,
    `on conflict (id) do update set`,
    `  title = excluded.title,`,
    `  description = excluded.description,`,
    `  image_url = excluded.image_url,`,
    `  cuisine = excluded.cuisine,`,
    `  difficulty = excluded.difficulty,`,
    `  prep_minutes = excluded.prep_minutes,`,
    `  cook_minutes = excluded.cook_minutes,`,
    `  base_servings = excluded.base_servings,`,
    `  calories = excluded.calories,`,
    `  protein_g = excluded.protein_g,`,
    `  carbs_g = excluded.carbs_g,`,
    `  fat_g = excluded.fat_g,`,
    `  fiber_g = excluded.fiber_g,`,
    `  is_public = excluded.is_public;`,
    '',
  );

  // Facets are replaced wholesale so removing a tag in TypeScript removes it
  // from the database too.
  for (const [table, column, values] of [
    ['recipe_meal_types', 'meal_type', recipe.mealTypes],
    ['recipe_diet_tags', 'diet', recipe.dietTags],
    ['recipe_allergens', 'allergen', recipe.allergens],
    ['recipe_appliances', 'appliance', recipe.requiredAppliances],
    ['recipe_tags', 'tag', recipe.tags],
  ] as const) {
    lines.push(`delete from public.${table} where recipe_id = ${lit(recipe.id)};`);
    for (const value of values) {
      lines.push(
        `insert into public.${table} (recipe_id, ${column}) values (${lit(recipe.id)}, ${lit(value)});`,
      );
    }
  }
  lines.push('');

  lines.push(`delete from public.recipe_ingredients where recipe_id = ${lit(recipe.id)};`);
  for (const ingredient of recipe.ingredients) {
    const ingredientId = ingredient.ingredientId
      ? lit(uuidv5(`ingredient:${ingredient.ingredientId}`))
      : `(select id from public.ingredients where name = ${lit(ingredient.name)} limit 1)`;
    lines.push(
      `insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)`,
      `values (${lit(ingredient.id)}, ${lit(recipe.id)}, ${ingredientId}, ${lit(ingredient.name)}, ${lit(ingredient.quantity)}, ${lit(ingredient.unit)}, ${lit(ingredient.preparation)}, ${lit(ingredient.isOptional)}, ${lit(ingredient.sortOrder)});`,
    );
  }
  lines.push('');

  lines.push(`delete from public.recipe_steps where recipe_id = ${lit(recipe.id)};`);
  for (const step of recipe.steps) {
    lines.push(
      `insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)`,
      `values (${lit(step.id)}, ${lit(recipe.id)}, ${lit(step.stepNumber)}, ${lit(step.instruction)}, ${lit(step.durationMinutes)}, ${lit(step.safetyNote)}, ${textArray(step.ingredientRefs)});`,
    );
  }
  lines.push('');
}

// --- Grocery providers -----------------------------------------------------

lines.push(
  '-- === Grocery providers =====================================================',
  '--',
  '-- The mock provider exists so the adapter layer can be exercised end to end',
  '-- in development. It is seeded DISABLED: no client can see it, and no real',
  '-- provider is registered because none has a commercial agreement yet.',
  '-- See PROJECT_STATUS.md § Required credentials.',
  '',
  `insert into public.grocery_providers (id, slug, name, country, is_enabled, integration)`,
  `values (${lit(uuidv5('provider:mock'))}, 'mock', 'Mock Provider (development only)', 'EG', false, 'mock')`,
  `on conflict (slug) do update set name = excluded.name, is_enabled = excluded.is_enabled;`,
  '',
  'commit;',
  '',
);

const output = `${lines.join('\n')}`;
writeFileSync(new URL('../supabase/seed.sql', import.meta.url), output);

console.log(
  `seed.sql written: ${INGREDIENT_CATALOGUE.length} ingredients, ${RECIPE_FIXTURES.length} recipes, ${output.split('\n').length} lines`,
);
