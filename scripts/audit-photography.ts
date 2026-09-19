/**
 * Which missing photographs actually cost us something.
 *
 * 94 of 161 recipes have no picture. Shooting or licensing all 94 is a large
 * spend, and most of it would be wasted: a recipe nobody is ever served does
 * not need a photograph. What matters is EXPOSURE — how often a recipe reaches
 * a screen — and exposure is not uniform.
 *
 * This ranks the unphotographed recipes by how likely they are to be seen,
 * from the same signals the app itself ranks and filters on, so the answer is
 * derived from the product's real behaviour rather than from taste:
 *
 *   PANTRY REACH   the share of a recipe's required ingredients that are
 *                  kitchen basics or common staples. This dominates, because
 *                  "cook with what I have" only ever surfaces recipes whose
 *                  ingredients someone plausibly has, and Home's rail is that
 *                  same query with no pantry at all.
 *   SPEED          Home's rail asks for <= 30 minutes, and "Fastest" is a sort
 *                  mode. A slow recipe is structurally rarer on screen.
 *   FEW INGREDIENTS shorter lists match more often and miss less often.
 *   LAUNCH MARKET  Egyptian and Levantine dishes carry the brand in the launch
 *                  market and are over-represented in Discover's collections.
 *   COLLECTIONS    membership in the tag sets Discover renders as rows.
 *
 * Output is a markdown report at PHOTOGRAPHY_BACKLOG.md. It changes no app
 * behaviour and ships nothing to users.
 *
 *     npm run audit:photos
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

import {
  COMMON_STAPLE_SLUGS,
  SUGGESTED_KITCHEN_BASICS,
  UNIVERSAL_BASICS,
} from '../src/features/ingredients/catalogue.ts';
import { RECIPE_CATALOGUE } from '../src/features/recipes/catalogue.generated.ts';

/**
 * Which recipes have a picture, read off disk.
 *
 * Not from `image-assets.generated.ts`: that file is a list of Metro `require`
 * calls and cannot be imported by Node. The directory is the ground truth the
 * manifest is generated FROM, so reading it is both possible and more honest —
 * it cannot drift from reality the way a stale manifest could.
 */
const PHOTOGRAPHED = new Set(
  readdirSync(resolve(import.meta.dirname, '..', 'assets', 'recipes'))
    .filter((file) => ['.jpg', '.jpeg', '.png', '.webp'].includes(extname(file).toLowerCase()))
    .map((file) => file.slice(0, -extname(file).length)),
);

/**
 * What counts as "probably in the kitchen already".
 *
 * Taken from the app's own definitions rather than a list typed here: these
 * are the exact sets the matching engine treats as available, so the ranking
 * below reflects what the product will really do rather than what this script
 * guesses it does.
 */
const COMMON_STAPLES = new Set<string>([
  ...SUGGESTED_KITCHEN_BASICS,
  ...COMMON_STAPLE_SLUGS,
  ...UNIVERSAL_BASICS,
]);

/** Tag sets Discover renders as its own rows. */
const COLLECTION_TAGS = new Set(['quick', 'high-protein', 'budget', 'healthy', 'vegetarian']);

type Scored = {
  slug: string;
  title: string;
  cuisine: string | null;
  minutes: number;
  required: number;
  reach: number;
  score: number;
  why: string[];
};

const scored: Scored[] = [];

for (const recipe of RECIPE_CATALOGUE) {
  // `slug` is nullable on `Recipe` because an AI-generated recipe has no
  // catalogue entry. Such a recipe cannot appear in this backlog at all: there
  // is no `assets/recipes/<slug>` for a photograph to be filed at. The curated
  // catalogue has no null slugs today, so this skips nothing in practice.
  const slug = recipe.slug;
  if (slug === null) continue;
  if (PHOTOGRAPHED.has(slug)) continue; // already photographed
  if (recipe.imageUrl) continue; // has a remote image

  const required = recipe.ingredients.filter((i) => !i.isOptional && !i.isGarnish);
  // An ingredient with no slug is one the AI proposed and we never
  // canonicalised, so it is by definition not a staple we stock.
  const staples = required.filter((i) => i.slug !== null && COMMON_STAPLES.has(i.slug)).length;
  const reach = required.length > 0 ? staples / required.length : 0;
  const minutes = recipe.prepMinutes + recipe.cookMinutes;

  const why: string[] = [];
  let score = 0;

  score += reach * 50;
  if (reach >= 0.6) why.push(`${Math.round(reach * 100)}% staple ingredients`);

  if (minutes <= 30) {
    score += 20;
    why.push(`${minutes} min — inside Home's 30-minute rail`);
  } else if (minutes <= 45) {
    score += 8;
  }

  if (required.length <= 6) {
    score += 12;
    why.push(`only ${required.length} required ingredients`);
  }

  if (recipe.cuisine === 'egyptian') {
    score += 15;
    why.push('Egyptian — launch market');
  } else if (recipe.cuisine === 'levantine') {
    score += 8;
    why.push('Levantine');
  }

  const collections = (recipe.tags ?? []).filter((tag) => COLLECTION_TAGS.has(tag));
  if (collections.length > 0) {
    score += collections.length * 5;
    why.push(`in Discover: ${collections.join(', ')}`);
  }

  scored.push({
    slug,
    title: recipe.title,
    cuisine: recipe.cuisine,
    minutes,
    required: required.length,
    reach,
    score,
    why,
  });
}

scored.sort((a, b) => b.score - a.score);
const top = scored.slice(0, 30);

const total = RECIPE_CATALOGUE.length;
const photographed = RECIPE_CATALOGUE.filter(
  (r) => r.slug !== null && PHOTOGRAPHED.has(r.slug),
).length;

const lines: string[] = [
  '# Photography backlog',
  '',
  '**Generated by `npm run audit:photos`. Do not edit by hand.**',
  '',
  `| | |`,
  `|---|---|`,
  `| Recipes in the catalogue | ${total} |`,
  `| With a photograph | ${photographed} (${Math.round((photographed / total) * 100)}%) |`,
  `| Without | ${scored.length} (${Math.round((scored.length / total) * 100)}%) |`,
  '',
  'Shooting all of them is a large spend and most of it would be wasted — a',
  'recipe nobody is served does not need a picture. These 30 are the ones that',
  'reach a screen most often, ranked by the same signals the app ranks on:',
  'pantry reach, speed, ingredient count, launch market and Discover',
  'collections. See `scripts/audit-photography.ts` for the weighting.',
  '',
  '## The 30 to shoot first',
  '',
  '| # | Recipe | Slug | Cuisine | Time | Req. | Staple reach | Why it surfaces |',
  '|---|---|---|---|---|---|---|---|',
];

top.forEach((entry, index) => {
  lines.push(
    `| ${index + 1} | ${entry.title} | \`${entry.slug}\` | ${entry.cuisine ?? '—'} | ` +
      `${entry.minutes} min | ${entry.required} | ${Math.round(entry.reach * 100)}% | ` +
      `${entry.why.join('; ') || '—'} |`,
  );
});

lines.push(
  '',
  '## How to use this',
  '',
  '1. Shoot or license these 30 in order. The ranking is exposure, so the top',
  '   of the list changes what most users see on their first session.',
  '2. Drop files at `assets/recipes/<slug>.jpg`, then run `npm run images:index`',
  '   to regenerate the manifest.',
  '3. Re-run `npm run audit:photos`. Photographed recipes drop out and the next',
  '   30 surface.',
  '',
  `_${scored.length - top.length} further unphotographed recipes fall below this cut._`,
  '',
);

const out = resolve(import.meta.dirname, '..', 'PHOTOGRAPHY_BACKLOG.md');
writeFileSync(out, lines.join('\n'));
console.log(`Ranked ${scored.length} unphotographed recipes; wrote the top ${top.length}.`);
console.log(`-> ${out}`);
