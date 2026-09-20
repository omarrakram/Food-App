/**
 * Acquires openly-licensed photography for the recipes in the catalogue.
 *
 *     npm run images:fetch              # every recipe without a photo
 *     npm run images:fetch -- --limit 5 # a few, for a trial run
 *     npm run images:fetch -- --force   # re-acquire even where one exists
 *
 * WHY THIS IS A SCRIPT AND NOT A HOTLINK. A `<img src="https://upload.wikimedia
 * .org/...">` is somebody else's bandwidth, somebody else's uptime, and a
 * silent breakage the day the file is renamed. This downloads the bytes, keeps
 * them in the repository, and records where each one came from — so the app
 * serves its own assets and the licence obligations travel with them.
 *
 * THE ACQUISITION ITSELF LIVES IN `lib/commons-photography.ts`, shared with
 * the candidate fetcher. This file is the part that is specific to recipes
 * that already exist: which ones still need a photograph, in what order, and
 * how the result is written into the production manifest.
 *
 * It runs in `.github/workflows/recipe-images.yml`, because the development
 * sandbox's egress proxy blocks every Wikimedia host.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { RECIPE_CATALOGUE } from '../src/features/recipes/catalogue.generated.ts';
import { COLLECTIONS } from '../src/features/recipes/collections.ts';

import {
  acquirePhotograph,
  rejectedTitles,
  type AcquiredPhoto,
  type PhotoSubject,
} from './lib/commons-photography.ts';

const ROOT = join(import.meta.dirname, '..');
const ASSET_DIR = join(ROOT, 'assets', 'recipes');
const MANIFEST = join(ROOT, 'data', 'images', 'manifest.json');
const REJECTED = join(ROOT, 'data', 'images', 'rejected.json');
const CANDIDATE_MANIFEST = join(ROOT, 'data', 'images', 'candidate-manifest.json');

export type ImageRecord = AcquiredPhoto & { recipeSlug: string };

type Manifest = { images: ImageRecord[]; skipped: { recipeSlug: string; reason: string }[] };

function readManifest(): Manifest {
  if (!existsSync(MANIFEST)) return { images: [], skipped: [] };
  return JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
}

/**
 * Photographs already staged against a candidate dish.
 *
 * Read so the no-duplicate rule spans both manifests. A candidate that has
 * been staged for `ful-medames` must not have its picture taken out from under
 * it by a production run for a different recipe — the two would then be
 * promoted into the same catalogue showing the same photograph, which is
 * exactly the failure the rule exists to prevent.
 */
function stagedOriginalUrls(): string[] {
  if (!existsSync(CANDIDATE_MANIFEST)) return [];
  const parsed = JSON.parse(readFileSync(CANDIDATE_MANIFEST, 'utf8')) as {
    images: { originalUrl: string }[];
  };
  return parsed.images.map((entry) => entry.originalUrl);
}

/**
 * Which recipes are worth a photograph FIRST.
 *
 * Coverage will never be 100% and chasing it is the wrong goal: a recipe with
 * no sufficiently relevant openly-licensed image keeps the branded fallback,
 * and attaching a photograph of a different dish tells the user something
 * false about what they are cooking. So the question is not how many, it is
 * WHICH — and the answer is the ones people actually see.
 *
 * Four proxies, all of them for "appears on a screen somebody is looking at":
 *
 *   MENA CUISINE — this is an Egyptian product. These are the dishes on Home
 *   and the ones people search for by name.
 *
 *   FEW ESSENTIAL INGREDIENTS — the strongest predictor of showing up in Cook
 *   results, because a short list is a list a real pantry can satisfy. A
 *   fourteen-ingredient braise is a recipe almost nobody is ever offered.
 *
 *   IN A DISCOVER COLLECTION — surfaced by name on a browsing screen, where a
 *   grid of gradient fallbacks is most obvious.
 *
 *   EASY — correlates with both of the above and breaks ties sensibly.
 */
function surfacingScore(recipe: (typeof RECIPE_CATALOGUE)[number]): number {
  const MENA: readonly string[] = ['egyptian', 'levantine', 'turkish'];
  const COLLECTION_TAGS: readonly string[] = COLLECTIONS.map((entry) => entry.tag);

  const essentials = recipe.ingredients.filter(
    (line) => !line.isOptional && !line.isGarnish && !line.isPantryStaple,
  ).length;

  let score = 0;
  if (MENA.includes(recipe.cuisine ?? '')) score += 3;
  if (essentials <= 4) score += 3;
  else if (essentials <= 6) score += 2;
  if (recipe.tags.some((tag) => COLLECTION_TAGS.includes(tag))) score += 2;
  if (recipe.difficulty === 'easy') score += 1;
  return score;
}

/** What the acquisition needs to know about a recipe, and nothing more. */
function subjectFor(recipe: (typeof RECIPE_CATALOGUE)[number]): PhotoSubject {
  return {
    slug: recipe.slug!,
    title: recipe.title,
    ingredientText: recipe.ingredients.map((line) => line.name.toLowerCase()).join(' '),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex === -1 ? Infinity : Number(args[limitIndex + 1] ?? '0');

  mkdirSync(ASSET_DIR, { recursive: true });
  const manifest = readManifest();
  const have = new Set(manifest.images.map((entry) => entry.recipeSlug));
  const refused = rejectedTitles(REJECTED);

  // No photograph may illustrate two dishes. Seeded from both manifests as
  // well as this run, so a partial re-acquisition cannot reintroduce a
  // duplicate the last one already placed — which is how the same bowl of rice
  // pudding came to be both roz bel laban and sutlac.
  const usedFiles = new Set([
    ...manifest.images.map((entry) => entry.originalUrl),
    ...stagedOriginalUrls(),
  ]);

  const todo = RECIPE_CATALOGUE.filter(
    (recipe) => recipe.slug !== null && (force || !have.has(recipe.slug)),
  )
    .sort((a, b) => surfacingScore(b) - surfacingScore(a))
    .slice(0, limit === Infinity ? undefined : limit);

  console.log(`${todo.length} recipe(s) to look for.\n`);

  const found: ImageRecord[] = [];
  const skipped: { recipeSlug: string; reason: string }[] = [];

  for (const recipe of todo) {
    const slug = recipe.slug!;
    const result = await acquirePhotograph(subjectFor(recipe), {
      assetDir: ASSET_DIR,
      refused,
      used: usedFiles,
      log: (line) => console.log(line),
    });

    if ('reason' in result) {
      skipped.push({ recipeSlug: slug, reason: result.reason });
      console.log(`  ✗ ${slug} — ${result.reason}`);
      continue;
    }
    found.push({ recipeSlug: slug, ...result.photo });
  }

  // Merged rather than replaced, because a `--limit 5` run knows nothing about
  // the other hundred and fifty recipes and must not erase what the last full
  // run recorded about them. A recipe this run photographed stops being skipped;
  // one it looked at and failed gets its new reason; the rest are left alone.
  const touched = new Set(todo.map((recipe) => recipe.slug!));
  const merged: Manifest = {
    images: [
      ...manifest.images.filter((entry) => !found.some((f) => f.recipeSlug === entry.recipeSlug)),
      ...found,
    ].sort((a, b) => a.recipeSlug.localeCompare(b.recipeSlug)),
    skipped: [
      ...manifest.skipped.filter((entry) => !touched.has(entry.recipeSlug)),
      ...skipped,
    ]
      .filter((entry) => !found.some((f) => f.recipeSlug === entry.recipeSlug))
      .sort((a, b) => a.recipeSlug.localeCompare(b.recipeSlug)),
  };

  writeFileSync(MANIFEST, `${JSON.stringify(merged, null, 2)}\n`);

  console.log(
    `\n${found.length} acquired, ${skipped.length} left on the branded fallback.\n` +
      `${merged.images.length} of ${RECIPE_CATALOGUE.length} recipes now have a photograph.`,
  );
}

void main();
