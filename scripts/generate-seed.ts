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
import { PRICE_DATA, PRICE_DATA_DATE } from '../src/features/pricing/price-data.ts';
// Read the GENERATED catalogue, not fixtures.ts: this runs under Node's
// type-stripping loader, and fixtures.ts binds the data to runtime concerns
// (image URL resolution) that pull in Expo modules Node cannot load. The seed
// stores image PATHS anyway — resolving them is the app's job, not the
// database's.
import { RECIPE_CATALOGUE } from '../src/features/recipes/catalogue.generated.ts';

import { uuidv5 } from './uuid.mjs';

/** Country and currency the bundled price estimates are quoted for. */
const SEED_COUNTRY = 'EG';
const SEED_CURRENCY = 'EGP';

/** Date the bundled price estimates were last reviewed. */

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
  `-- typical ${SEED_COUNTRY} supermarket shelf prices as reviewed on ${PRICE_DATA_DATE}`,
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

  // Prices come from the imported survey, not the catalogue. An ingredient
  // with no row simply gets no price estimate — the app renders that honestly,
  // and seeding a fabricated one would be the only way to break it.
  const price = PRICE_DATA[ingredient.slug];
  if (price) {
    lines.push(
      `insert into public.ingredient_price_estimates (`,
      `  ingredient_id, country, currency, unit, quantity,`,
      `  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)`,
      `values (${lit(id)}, ${lit(SEED_COUNTRY)}, ${lit(SEED_CURRENCY)}, ${lit(price.unit)}, ${lit(price.quantity)},`,
      `  ${lit(price.lowMinor)}, ${lit(price.avgMinor)}, ${lit(price.highMinor)}, 'bundled_seed', ${lit(PRICE_DATA_DATE)})`,
      `on conflict (ingredient_id, country, unit, quantity) do update set`,
      `  estimated_low_minor = excluded.estimated_low_minor,`,
      `  estimated_avg_minor = excluded.estimated_avg_minor,`,
      `  estimated_high_minor = excluded.estimated_high_minor,`,
      `  last_updated = excluded.last_updated;`,
      '',
    );
  }
}

// --- Recipes ---------------------------------------------------------------

lines.push('-- === Recipes ===============================================================', '');

for (const recipe of RECIPE_CATALOGUE) {
  lines.push(
    `-- ${recipe.title}`,
    `insert into public.recipes (`,
    `  id, slug, title, title_ar, description, description_ar,`,
    `  image_path, image_source, image_creator, image_license, image_attribution, image_source_url,`,
    `  image_url, source, cuisine, difficulty,`,
    `  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,`,
    `  created_by, is_public)`,
    `values (${lit(recipe.id)}, ${lit(recipe.slug)}, ${lit(recipe.title)}, ${lit(recipe.titleAr)},`,
    `  ${lit(recipe.description)}, ${lit(recipe.descriptionAr)},`,
    `  ${lit(recipe.image?.path ?? null)}, ${lit(recipe.image?.source ?? null)}, ${lit(recipe.image?.creator ?? null)},`,
    `  ${lit(recipe.image?.license ?? null)}, ${lit(recipe.image?.attribution ?? null)}, ${lit(recipe.image?.sourceUrl ?? null)},`,
    `  ${lit(recipe.imageUrl)}, ${lit(recipe.source)}, ${lit(recipe.cuisine)}, ${lit(recipe.difficulty)},`,
    `  ${lit(recipe.prepMinutes)}, ${lit(recipe.cookMinutes)}, ${lit(recipe.baseServings)},`,
    `  ${lit(recipe.nutrition.calories)}, ${lit(recipe.nutrition.proteinGrams)}, ${lit(recipe.nutrition.carbsGrams)},`,
    `  ${lit(recipe.nutrition.fatGrams)}, ${lit(recipe.nutrition.fiberGrams)}, null, true)`,
    `on conflict (id) do update set`,
    `  title = excluded.title,`,
    `  title_ar = excluded.title_ar,`,
    `  description = excluded.description,`,
    `  description_ar = excluded.description_ar,`,
    `  image_path = excluded.image_path,`,
    `  image_source = excluded.image_source,`,
    `  image_creator = excluded.image_creator,`,
    `  image_license = excluded.image_license,`,
    `  image_attribution = excluded.image_attribution,`,
    `  image_source_url = excluded.image_source_url,`,
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
    // The importer already resolved every curated ingredient to a catalogue
    // row, so the slug is the reliable key. The name lookup stays as a
    // fallback for an AI-proposed ingredient with no slug.
    const ingredientId = ingredient.slug
      ? `(select id from public.ingredients where slug = ${lit(ingredient.slug)} limit 1)`
      : `(select id from public.ingredients where name = ${lit(ingredient.name)} limit 1)`;
    lines.push(
      `insert into public.recipe_ingredients (id, recipe_id, ingredient_id, slug, name, quantity, unit, preparation, is_optional, is_garnish, is_pantry_staple, notes, sort_order)`,
      `values (${lit(ingredient.id)}, ${lit(recipe.id)}, ${ingredientId}, ${lit(ingredient.slug)}, ${lit(ingredient.name)}, ${lit(ingredient.quantity)}, ${lit(ingredient.unit)}, ${lit(ingredient.preparation)}, ${lit(ingredient.isOptional)}, ${lit(ingredient.isGarnish)}, ${lit(ingredient.isPantryStaple)}, ${lit(ingredient.notes)}, ${lit(ingredient.sortOrder)});`,
    );
  }
  lines.push('');

  lines.push(`delete from public.recipe_steps where recipe_id = ${lit(recipe.id)};`);
  for (const step of recipe.steps) {
    lines.push(
      `insert into public.recipe_steps (id, recipe_id, step_number, instruction, instruction_ar, duration_minutes, safety_note, safety_note_ar, ingredient_refs)`,
      `values (${lit(step.id)}, ${lit(recipe.id)}, ${lit(step.stepNumber)}, ${lit(step.instruction)}, ${lit(step.instructionAr)}, ${lit(step.durationMinutes)}, ${lit(step.safetyNote)}, ${lit(step.safetyNoteAr)}, ${textArray(step.ingredientRefs)});`,
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
  `seed.sql written: ${INGREDIENT_CATALOGUE.length} ingredients, ${RECIPE_CATALOGUE.length} recipes, ${output.split('\n').length} lines`,
);
