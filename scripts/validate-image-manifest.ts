/**
 * Image manifest validation.
 *
 *     npm run images:check
 *
 * Runs in CI. An image manifest is exactly the kind of file that rots quietly:
 * a recipe is renamed, an asset is deleted, an attribution is dropped in a
 * merge — and nothing fails until somebody opens the app and sees a grey box,
 * or worse, a photograph published with no licence recorded.
 *
 * The licence checks are the ones that matter. The others are hygiene; that
 * one is the difference between using a photograph and taking it.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { RECIPE_CATALOGUE } from '../src/features/recipes/catalogue.generated.ts';

const ROOT = join(import.meta.dirname, '..');
const ASSET_DIR = join(ROOT, 'assets', 'recipes');
const MANIFEST = join(ROOT, 'data', 'images', 'manifest.json');

type ImageRecord = {
  recipeSlug: string;
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

/** Licences the project has decided it can publish under. */
const ALLOWED_LICENCES = new Set([
  'CC0-1.0',
  'CC-BY-1.0',
  'CC-BY-2.0',
  'CC-BY-2.5',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC-BY-SA-1.0',
  'CC-BY-SA-2.0',
  'CC-BY-SA-2.5',
  'CC-BY-SA-3.0',
  'CC-BY-SA-4.0',
]);

/** Anything that needs a credit must carry one. CC0 is the only exemption. */
const NEEDS_ATTRIBUTION = (licence: string) => licence !== 'CC0-1.0';

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MIN_WIDTH = 480;
const MAX_BYTES = 6 * 1024 * 1024;

function main(): void {
  if (!existsSync(MANIFEST)) {
    console.log('No image manifest yet — nothing to validate.');
    return;
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
    images: ImageRecord[];
    skipped: { recipeSlug: string; reason: string }[];
  };

  const recipeSlugs = new Set(
    RECIPE_CATALOGUE.map((recipe) => recipe.slug).filter((slug): slug is string => slug !== null),
  );
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const image of manifest.images) {
    const where = image.recipeSlug || '(no slug)';

    if (!recipeSlugs.has(image.recipeSlug)) {
      problems.push(`${where}: names a recipe that is not in the catalogue`);
    }
    if (seen.has(image.recipeSlug)) {
      problems.push(`${where}: appears twice`);
    }
    seen.add(image.recipeSlug);

    const file = join(ASSET_DIR, image.path);
    if (!existsSync(file)) {
      problems.push(`${where}: ${image.path} is in the manifest but not on disk`);
    } else {
      const size = statSync(file).size;
      if (size !== image.bytes) {
        problems.push(`${where}: ${image.path} is ${size} bytes, manifest says ${image.bytes}`);
      }
      if (size > MAX_BYTES) {
        problems.push(`${where}: ${image.path} is ${(size / 1e6).toFixed(1)}MB, over the cap`);
      }
    }

    const extension = image.path.slice(image.path.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      problems.push(`${where}: ${extension} is not a supported image format`);
    }
    if (image.path.includes('..') || image.path.startsWith('/')) {
      problems.push(`${where}: path escapes the asset directory`);
    }

    if (!ALLOWED_LICENCES.has(image.license)) {
      // The one that stops a publication we cannot defend.
      problems.push(`${where}: "${image.license}" is not a licence this project may publish under`);
    }
    if (NEEDS_ATTRIBUTION(image.license) && !image.attribution) {
      problems.push(`${where}: ${image.license} requires attribution and none is recorded`);
    }
    if (!image.creator?.trim()) {
      problems.push(`${where}: no creator recorded`);
    }
    if (!image.sourcePage?.startsWith('https://')) {
      problems.push(`${where}: no source page recorded, so the licence cannot be verified`);
    }
    if (!image.originalUrl?.startsWith('https://')) {
      problems.push(`${where}: no original URL recorded`);
    }

    if (!Number.isFinite(image.width) || image.width < MIN_WIDTH) {
      problems.push(`${where}: ${image.width}px wide is too small to be a hero image`);
    }
    if (!Number.isFinite(image.height) || image.height < 1) {
      problems.push(`${where}: implausible height`);
    }
  }

  const covered = manifest.images.length;
  const total = recipeSlugs.size;

  if (problems.length > 0) {
    console.error(`Image manifest has ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Image manifest is valid: ${covered} of ${total} recipes have a photograph ` +
      `(${((covered / total) * 100).toFixed(0)}%), ${manifest.skipped.length} on the branded fallback.`,
  );
}

main();
