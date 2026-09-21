/**
 * Moves a reviewed photograph out of staging and onto a real recipe.
 *
 *     npm run images:promote -- ful-medames tameya
 *     npm run images:promote -- --batch batch-1-small-pantry
 *
 * THE ONE DOOR between the staging area and production, and it is deliberately
 * manual and by name. Automatic promotion would make the staging area a
 * formality: every photograph that passed the mechanical checks would end up
 * on a card, which is the state this whole preflight exists to avoid. The
 * checks cannot see the picture; a person has to, and promoting by name is
 * what that person's decision looks like in a command.
 *
 * It refuses to promote a photograph for a recipe that does not exist, which
 * is the same rule `images:check` enforces and the reason candidates could not
 * simply be written into the production manifest in the first place.
 *
 * Afterwards, run `npm run images:index` and `npm run images:check`.
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { RECIPE_CATALOGUE } from '../src/features/recipes/catalogue.generated.ts';

const ROOT = join(import.meta.dirname, '..');
const STAGED_DIR = join(ROOT, 'assets', 'recipe-candidates');
const ASSET_DIR = join(ROOT, 'assets', 'recipes');
const CANDIDATE_MANIFEST = join(ROOT, 'data', 'images', 'candidate-manifest.json');
const MANIFEST = join(ROOT, 'data', 'images', 'manifest.json');
const CANDIDATE_DIR = join(ROOT, 'data', 'recipe-candidates');

type Photo = {
  path: string;
  sourcePage: string;
  originalUrl: string;
  creator: string;
  license: string;
  attribution: string | null;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  acquiredAt: string;
};
type CandidateRecord = Photo & { candidateSlug: string; batch: string };
type CandidateManifest = {
  comment: string;
  images: CandidateRecord[];
  skipped: { candidateSlug: string; batch: string; reason: string }[];
  /**
   * Reviewed, photograph is fine, dish cannot be written yet.
   *
   * `--batch` promotes everything staged, so a hold has to be enforced here
   * or the next batch promotion quietly undoes the decision that made it.
   */
  held?: { candidateSlug: string; batch: string; reason: string }[];
  /** Resolved duplicates. Terminal — these never become promotable. */
  retired?: { candidateSlug: string; batch: string; reason: string }[];
};
type Manifest = {
  images: (Photo & { recipeSlug: string })[];
  skipped: { recipeSlug: string; reason: string }[];
};

function slugsInBatch(name: string): string[] {
  if (!existsSync(CANDIDATE_DIR)) return [];
  for (const file of readdirSync(CANDIDATE_DIR).filter((entry) => entry.endsWith('.json'))) {
    const batch = JSON.parse(readFileSync(join(CANDIDATE_DIR, file), 'utf8')) as {
      batch: string;
      candidates: { slug: string }[];
    };
    if (batch.batch === name) return batch.candidates.map((entry) => entry.slug);
  }
  return [];
}

function main(): void {
  const args = process.argv.slice(2);
  const batchIndex = args.indexOf('--batch');
  const wanted =
    batchIndex === -1
      ? args.filter((arg) => !arg.startsWith('--'))
      : slugsInBatch(args[batchIndex + 1] ?? '');

  if (wanted.length === 0) {
    console.error('Name the candidate slugs to promote, or a --batch.');
    process.exitCode = 1;
    return;
  }

  if (!existsSync(CANDIDATE_MANIFEST)) {
    console.error('No candidate manifest — there is nothing staged to promote.');
    process.exitCode = 1;
    return;
  }

  const staged = JSON.parse(readFileSync(CANDIDATE_MANIFEST, 'utf8')) as CandidateManifest;
  const live: Manifest = existsSync(MANIFEST)
    ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest)
    : { images: [], skipped: [] };

  const recipeSlugs = new Set(
    RECIPE_CATALOGUE.map((recipe) => recipe.slug).filter((slug): slug is string => slug !== null),
  );
  const byCandidate = new Map(staged.images.map((entry) => [entry.candidateSlug, entry]));
  const alreadyLive = new Set(live.images.map((entry) => entry.recipeSlug));
  const held = new Map((staged.held ?? []).map((entry) => [entry.candidateSlug, entry.reason]));
  const retired = new Map(
    (staged.retired ?? []).map((entry) => [entry.candidateSlug, entry.reason]),
  );

  const promoted: string[] = [];
  const problems: string[] = [];

  for (const slug of wanted) {
    const record = byCandidate.get(slug);
    if (!record) {
      // Not an error: a batch promotes what survived review, and the ones with
      // no acceptable image are exactly what this preflight is for.
      console.log(`  – ${slug}: nothing staged, skipping`);
      continue;
    }
    const gone = retired.get(slug);
    if (gone) {
      console.log(`  – ${slug}: retired, skipping — ${gone}`);
      continue;
    }
    const hold = held.get(slug);
    if (hold) {
      console.log(`  – ${slug}: held, skipping — ${hold}`);
      continue;
    }
    if (!recipeSlugs.has(slug)) {
      problems.push(`${slug}: no recipe by that slug — write the recipe before promoting it`);
      continue;
    }
    if (alreadyLive.has(slug)) {
      problems.push(`${slug}: already has a published photograph`);
      continue;
    }

    const from = join(STAGED_DIR, record.path);
    if (!existsSync(from)) {
      problems.push(`${slug}: ${record.path} is in the candidate manifest but not on disk`);
      continue;
    }
    // The bytes are re-hashed on the way through. The provenance recorded at
    // acquisition describes a specific file, and this is the moment to prove
    // it is still that file.
    const bytes = readFileSync(from);
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== record.sha256) {
      problems.push(`${slug}: staged file no longer matches its recorded SHA-256`);
      continue;
    }

    copyFileSync(from, join(ASSET_DIR, record.path));
    rmSync(from);

    const { candidateSlug: _candidateSlug, batch: _batch, ...photo } = record;
    live.images.push({ recipeSlug: slug, ...photo });
    promoted.push(slug);
    console.log(`  ✓ ${slug}  ${record.license}  ${record.creator}`);
  }

  if (problems.length > 0) {
    console.error(`\nRefused ${problems.length} promotion(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  if (promoted.length === 0) {
    console.log('Nothing to promote.');
    return;
  }

  const done = new Set(promoted);
  live.images.sort((a, b) => a.recipeSlug.localeCompare(b.recipeSlug));
  live.skipped = live.skipped.filter((entry) => !done.has(entry.recipeSlug));
  writeFileSync(MANIFEST, `${JSON.stringify(live, null, 2)}\n`);

  staged.images = staged.images.filter((entry) => !done.has(entry.candidateSlug));
  writeFileSync(CANDIDATE_MANIFEST, `${JSON.stringify(staged, null, 2)}\n`);

  console.log(
    `\n${promoted.length} photograph(s) promoted. ` +
      `${live.images.length} of ${recipeSlugs.size} recipes now have one.\n` +
      'Run `npm run images:index` and `npm run images:check`.',
  );
}

main();
