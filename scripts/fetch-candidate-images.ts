/**
 * Acquires candidate photography for dishes that are NOT yet recipes.
 *
 *     npm run images:fetch-candidates                    # every batch
 *     npm run images:fetch-candidates -- --batch batch-1 # one of them
 *     npm run images:fetch-candidates -- --force         # re-acquire
 *
 * WHY THIS EXISTS. The honest order of work is: pick the dishes, find out
 * whether legitimate photography exists for them, then write the recipes for
 * the ones it does. The production path cannot do that — `images:fetch` reads
 * `RECIPE_CATALOGUE`, and `images:check` refuses a manifest entry naming a
 * recipe the catalogue does not have. Both of those are correct and neither
 * was weakened: a production manifest that can name a recipe that does not
 * exist is a production manifest that can name anything.
 *
 * So this is a second DRIVER over the same acquisition. Identical licence
 * allowlist, identical minimum size, identical pork-and-alcohol refusal,
 * identical relevance ordering, identical human-rejection memory — because all
 * of that lives in `lib/commons-photography.ts` and neither driver has its own
 * copy.
 *
 * WHAT IS DIFFERENT IS ONLY WHERE THINGS LAND. Candidate photographs go to
 * `assets/recipe-candidates/` and `data/images/candidate-manifest.json`. They
 * are not bundled, not indexed for Metro, and not visible to the app. Nothing
 * here promotes anything: a staged photograph enters production only through
 * `npm run images:promote`, by name, once its recipe genuinely exists.
 *
 * It runs in `.github/workflows/candidate-images.yml`, because the development
 * sandbox's egress proxy blocks every Wikimedia host.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { INGREDIENT_CATALOGUE } from '../src/features/ingredients/catalogue.ts';

import {
  acquirePhotograph,
  rejectedTitles,
  type AcquiredPhoto,
  type PhotoSubject,
} from './lib/commons-photography.ts';

const ROOT = join(import.meta.dirname, '..');
const ASSET_DIR = join(ROOT, 'assets', 'recipe-candidates');
const CANDIDATE_DIR = join(ROOT, 'data', 'recipe-candidates');
const MANIFEST = join(ROOT, 'data', 'images', 'candidate-manifest.json');
const PRODUCTION_MANIFEST = join(ROOT, 'data', 'images', 'manifest.json');
const REJECTED = join(ROOT, 'data', 'images', 'rejected.json');

/**
 * A proposed dish, before anybody has written a recipe for it.
 *
 * The minimum needed to look for a photograph and to judge one, and
 * deliberately no more: quantities, steps and nutrition are the expensive part
 * of a recipe and writing them before knowing whether the dish can be
 * illustrated is what put 94 recipes on a branded fallback.
 */
export type RecipeCandidate = {
  /** Kebab-case, and the slug the recipe will carry if it is written. */
  slug: string;
  /** English dish name. */
  name: string;
  /** Egyptian Arabic dish name. */
  nameAr: string;
  cuisine: string;
  /**
   * Catalogue slugs the dish is actually built from. Validated against the
   * ingredient catalogue, which is also the cheapest possible proof that the
   * recipe is writable at all — a candidate naming an ingredient we do not
   * have is a recipe that cannot be imported later.
   */
  coreIngredients: string[];
  /** Further names Commons might file the dish under. */
  searchNames?: string[];
  /** Why this dish is on the list. Read by a human, not by code. */
  note?: string;
};

type Batch = { batch: string; intent: string; candidates: RecipeCandidate[] };

export type CandidateImageRecord = AcquiredPhoto & { candidateSlug: string; batch: string };

type CandidateManifest = {
  comment: string;
  images: CandidateImageRecord[];
  skipped: { candidateSlug: string; batch: string; reason: string }[];
  /**
   * Reviewed, photograph fine, dish not writable yet.
   *
   * CARRIED THROUGH RATHER THAN REBUILT. This driver rewrites the whole
   * manifest on every run, and it used to write only `comment`, `images` and
   * `skipped` — so the batch-4 acquisition silently deleted the hold on
   * `black-bean-soup` that a human had placed a batch earlier. The photograph
   * stayed staged, the hold did not, and the next `images:promote --batch`
   * would have shipped it. A decision a person made has to survive a machine
   * re-running.
   */
  held?: { candidateSlug: string; batch: string; reason: string }[];
  /** Resolved duplicates, carried through for the same reason as `held`. */
  retired?: { candidateSlug: string; batch: string; reason: string }[];
};

const MANIFEST_COMMENT =
  'Photography STAGED against dishes that are not yet recipes. Nothing here is ' +
  'visible to the app: these files are not bundled and not indexed. A staged ' +
  'photograph reaches production only through `npm run images:promote`, by name, ' +
  'after its recipe exists — and a human has looked at the picture. Provenance is ' +
  'recorded to the same standard as production because the licence obligations ' +
  'attach on acquisition, not on promotion.';

function readBatches(only: string | null): Batch[] {
  if (!existsSync(CANDIDATE_DIR)) return [];
  return readdirSync(CANDIDATE_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(CANDIDATE_DIR, name), 'utf8')) as Batch)
    .filter((batch) => only === null || batch.batch === only);
}

function readManifest(): CandidateManifest {
  if (!existsSync(MANIFEST)) return { comment: MANIFEST_COMMENT, images: [], skipped: [], held: [] };
  return JSON.parse(readFileSync(MANIFEST, 'utf8')) as CandidateManifest;
}

/** Photographs already illustrating a published recipe. */
function productionRecords(): { recipeSlug: string; originalUrl: string }[] {
  if (!existsSync(PRODUCTION_MANIFEST)) return [];
  const parsed = JSON.parse(readFileSync(PRODUCTION_MANIFEST, 'utf8')) as {
    images: { recipeSlug: string; originalUrl: string }[];
  };
  return parsed.images;
}

const NAME_BY_SLUG = new Map(INGREDIENT_CATALOGUE.map((entry) => [entry.slug, entry.name]));

/**
 * What the acquisition needs to know about a candidate.
 *
 * `ingredientText` is built from the catalogue's own English names rather than
 * from the slugs, because the rule it feeds compares against words like
 * "chicken" and "shrimp" that appear in a Commons file title — and the
 * catalogue name is what those words are.
 */
function subjectFor(candidate: RecipeCandidate): PhotoSubject {
  const names = candidate.coreIngredients
    .map((slug) => NAME_BY_SLUG.get(slug) ?? slug)
    .join(' ')
    .toLowerCase();
  return {
    slug: candidate.slug,
    title: candidate.name,
    searchNames: candidate.searchNames,
    ingredientText: names,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const batchIndex = args.indexOf('--batch');
  const only = batchIndex === -1 ? null : (args[batchIndex + 1] ?? null);

  const batches = readBatches(only);
  if (batches.length === 0) {
    console.error(only ? `No candidate batch named "${only}".` : 'No candidate batches.');
    process.exitCode = 1;
    return;
  }

  // A candidate naming an ingredient the catalogue does not have is a recipe
  // that cannot be imported, so it is caught here rather than after a
  // photograph has been acquired for it.
  const unknown: string[] = [];
  for (const batch of batches) {
    for (const candidate of batch.candidates) {
      for (const slug of candidate.coreIngredients) {
        if (!NAME_BY_SLUG.has(slug)) unknown.push(`${candidate.slug}: "${slug}"`);
      }
    }
  }
  if (unknown.length > 0) {
    console.error('Candidates name ingredients the catalogue does not have:');
    for (const line of unknown) console.error(`  - ${line}`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(ASSET_DIR, { recursive: true });
  const manifest = readManifest();
  const refused = rejectedTitles(REJECTED);

  // Already answered: staged and waiting for review, OR already promoted.
  //
  // The second half matters and is easy to miss. Promotion REMOVES a candidate
  // from this manifest, so without it a re-run of the batch would go looking
  // for a second photograph for eleven dishes that already have one on a card.
  const promoted = new Set(
    productionRecords().map((entry) => entry.recipeSlug),
  );
  const have = new Set([
    ...manifest.images.map((entry) => entry.candidateSlug),
    ...promoted,
  ]);

  // The no-duplicate rule spans BOTH manifests. A candidate must not be staged
  // with the photograph already illustrating a published recipe: promote it and
  // two cards in the same feed show the same picture.
  const usedFiles = new Set([
    ...manifest.images.map((entry) => entry.originalUrl),
    ...productionRecords().map((entry) => entry.originalUrl),
  ]);

  const found: CandidateImageRecord[] = [];
  const skipped: { candidateSlug: string; batch: string; reason: string }[] = [];
  const touched = new Set<string>();

  for (const batch of batches) {
    const todo = batch.candidates.filter((entry) => force || !have.has(entry.slug));
    console.log(`\n${batch.batch}: ${todo.length} candidate(s) to look for.`);

    for (const candidate of todo) {
      touched.add(candidate.slug);
      const result = await acquirePhotograph(subjectFor(candidate), {
        assetDir: ASSET_DIR,
        refused,
        used: usedFiles,
        log: (line) => console.log(line),
      });

      if ('reason' in result) {
        skipped.push({ candidateSlug: candidate.slug, batch: batch.batch, reason: result.reason });
        console.log(`  ✗ ${candidate.slug} — ${result.reason}`);
        continue;
      }
      found.push({ candidateSlug: candidate.slug, batch: batch.batch, ...result.photo });
    }
  }

  // Merged on the same reasoning as production: a one-batch run knows nothing
  // about the other batches and must not erase what they recorded.
  const merged: CandidateManifest = {
    comment: MANIFEST_COMMENT,
    images: [
      ...manifest.images.filter(
        (entry) => !found.some((f) => f.candidateSlug === entry.candidateSlug),
      ),
      ...found,
    ].sort((a, b) => a.candidateSlug.localeCompare(b.candidateSlug)),
    skipped: [
      ...manifest.skipped.filter((entry) => !touched.has(entry.candidateSlug)),
      ...skipped,
    ]
      .filter((entry) => !found.some((f) => f.candidateSlug === entry.candidateSlug))
      .sort((a, b) => a.candidateSlug.localeCompare(b.candidateSlug)),
    // Every hold survives, except for a dish that has since been published —
    // that one is resolved, and keeping it would contradict the manifest.
    held: (manifest.held ?? []).sort((a, b) => a.candidateSlug.localeCompare(b.candidateSlug)),
    retired: (manifest.retired ?? []).sort((a, b) =>
      a.candidateSlug.localeCompare(b.candidateSlug),
    ),
  };

  writeFileSync(MANIFEST, `${JSON.stringify(merged, null, 2)}\n`);

  const considered = batches.reduce((sum, batch) => sum + batch.candidates.length, 0);
  console.log(
    `\n${found.length} staged, ${skipped.length} with no acceptable image.\n` +
      `${merged.images.length} of ${considered} candidate(s) now have a photograph to review.\n` +
      'NOTHING IS PUBLISHED. A human reviews PHOTO_CANDIDATE_REVIEW.md, and a ' +
      'recipe batch promotes what survives.',
  );
}

void main();
