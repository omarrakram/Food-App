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
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { RECIPE_CATALOGUE } from '../src/features/recipes/catalogue.generated.ts';
import { commonsKey } from './lib/commons-photography.ts';

/**
 * What the bytes actually are, read from their own header.
 *
 * Deliberately duplicated from the fetcher rather than shared: this is the
 * GATE, and a gate that imports its rule from the thing it is checking can
 * only ever agree with it.
 */
function imageKindOf(bytes: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (bytes.byteLength < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png';
  }
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

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
      // The extension is a claim; the header is the fact. A WebP written into
      // a `.jpg` decodes nowhere, and an HTML error page saved as an image is
      // a file of the right size containing no picture at all — both are
      // failures that only appear when a user opens the screen.
      const declared = imageKindOf(readFileSync(file));
      const claimed = image.path.slice(image.path.lastIndexOf('.') + 1).toLowerCase();
      if (declared === null) {
        problems.push(`${where}: ${image.path} does not begin like an image file`);
      } else if (declared !== (claimed === 'jpeg' ? 'jpg' : claimed)) {
        problems.push(`${where}: ${image.path} is really a ${declared}`);
      }
      if (size !== image.bytes) {
        // Already reported above; the sha is the stronger statement.
      } else if (createHash('sha256').update(readFileSync(file)).digest('hex') !== image.sha256) {
        problems.push(`${where}: ${image.path} does not match its recorded SHA-256`);
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

  // A photograph refused on review must never come back — including by hand.
  const rejectedPath = join(ROOT, 'data', 'images', 'rejected.json');
  if (existsSync(rejectedPath)) {
    // `commonsKey` is shared with the fetcher on purpose. These two used to
    // normalise differently — the validator to underscores, the fetcher not at
    // all — and the disagreement made 15 refusals inert in acquisition while
    // still failing here, which costs a whole run to discover.
    const refused = new Map(
      (
        JSON.parse(readFileSync(rejectedPath, 'utf8')) as {
          files: { title: string; reason: string }[];
        }
      ).files.map((entry) => [commonsKey(entry.title), entry.reason]),
    );
    for (const image of manifest.images) {
      const reason = refused.get(commonsKey(image.originalUrl.split('/').pop() ?? ''));
      if (reason) {
        problems.push(`${image.recipeSlug}: uses a photograph refused on review — ${reason}`);
      }
    }
  }

  // One photograph, one recipe. Two cards in a feed showing the same picture
  // makes the catalogue look fabricated, and it was: the same bowl of rice
  // pudding illustrated both roz bel laban and sutlac.
  const byFile = new Map<string, string[]>();
  for (const image of manifest.images) {
    byFile.set(image.sha256, [...(byFile.get(image.sha256) ?? []), image.recipeSlug]);
  }
  for (const [, slugs] of byFile) {
    if (slugs.length > 1) {
      problems.push(`the same photograph illustrates ${slugs.join(' and ')}`);
    }
  }

  // THE GENERATED DATA MUST SAY WHAT THE MANIFEST SAYS.
  //
  // The app was always right — `imageAttribution()` reads the bundled manifest
  // first, so the credits screen never showed a wrong name. The generated
  // catalogue and the SEED were not: every photographed recipe described a
  // Wikimedia CC-BY-SA photograph as "generated", "Akla kitchen", CC0-1.0, and
  // a seed is what a database persists. The false claim was one `db push` away
  // from being the system of record.
  //
  // `import-recipes.ts` now derives this block from the manifest. This is the
  // gate that proves it, and it compares against the manifest rather than
  // against the importer's own rule — a gate that asks the code what the code
  // thinks can only ever agree with it.
  const photographed = new Map(manifest.images.map((image) => [image.recipeSlug, image]));
  for (const recipe of RECIPE_CATALOGUE) {
    const photo = recipe.slug === null ? undefined : photographed.get(recipe.slug);
    if (!photo) continue;

    const where = `${recipe.slug}: generated image metadata`;
    const image = recipe.image;
    if (!image) {
      problems.push(`${where} is null, but a photograph is recorded for it`);
      continue;
    }
    if (image.source !== 'openly_licensed') {
      problems.push(`${where} claims source "${image.source}" for a Wikimedia photograph`);
    }
    if (image.creator !== photo.creator) {
      problems.push(`${where} credits "${image.creator}", manifest says "${photo.creator}"`);
    }
    if (image.license !== photo.license) {
      problems.push(`${where} says ${image.license}, manifest says ${photo.license}`);
    }
    if ((image.attribution ?? null) !== (photo.attribution ?? null)) {
      problems.push(`${where} carries a different attribution line from the manifest`);
    }
    if (image.sourceUrl !== photo.sourcePage) {
      problems.push(`${where} points at a different source page from the manifest`);
    }
    // The path must name the file that actually exists: the fetcher names it
    // after the BYTES, so a photograph served as WebP is `.webp` and a
    // hand-written `.jpg` points at nothing.
    if (image.path !== `curated/${photo.path}`) {
      problems.push(`${where} path is "${image.path}", the file is "${photo.path}"`);
    }
  }

  // AND THE OTHER DIRECTION: A RECIPE WITH NO PHOTOGRAPH MUST NOT CLAIM ONE.
  //
  // This used to read `recipe.image?.source === 'openly_licensed'`, which made
  // the SOURCE FIELD the pass mark — and `generated` was the value that walked
  // straight past it. Ninety-four recipes shipped `curated/<slug>.jpg`,
  // "generated", "Akla kitchen", CC0, naming an asset that has never been in
  // this repository. An invented Wikimedia credit failed; an invented Akla one
  // did not, and the second is the easier lie to tell because nobody has to be
  // named in it.
  //
  // The claim is what matters, not who it credits. A non-null `image` says
  // "there is a picture at this path", `resolveRecipeImageUrl` turns that into
  // a Storage URL the moment a Supabase project is configured, and
  // `RecipeImage` prefers a URL over the branded fallback. So the gate is now:
  // a curated image block must correspond to a manifest entry AND to bytes on
  // disk, whatever it says about itself.
  for (const recipe of RECIPE_CATALOGUE) {
    const image = recipe.image;
    if (!image) continue;
    // Community uploads live in the database, not in this repository; the
    // bundled catalogue is curated end to end.
    if (!image.path.startsWith('curated/')) continue;

    const photo = recipe.slug === null ? undefined : photographed.get(recipe.slug);
    if (photo) continue; // the block-by-block comparison above already ran

    problems.push(
      `${recipe.slug}: claims "${image.path}" (source "${image.source}", ` +
        `credited to ${image.creator ?? 'nobody'}) but no photograph is in the manifest. ` +
        'A recipe on the branded fallback has image: null.',
    );
  }

  // Belt and braces: every curated path a recipe claims must be a real file.
  // The manifest check above proves the manifest's own entries exist; this
  // proves the RECIPE's claim does, which is the statement that reaches the
  // seed and, through it, a database.
  for (const recipe of RECIPE_CATALOGUE) {
    const image = recipe.image;
    if (!image?.path.startsWith('curated/')) continue;
    const file = join(ASSET_DIR, image.path.slice('curated/'.length));
    if (!existsSync(file)) {
      problems.push(`${recipe.slug}: claims "${image.path}", which is not a file in assets/recipes`);
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
