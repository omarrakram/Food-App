/**
 * Candidate image manifest validation.
 *
 *     npm run images:check-candidates
 *
 * Runs in CI, beside `images:check` and to the same standard. A staged
 * photograph is one we have already downloaded and committed, so the licence
 * obligations are already live — "it is only a candidate" is not a defence for
 * publishing a file whose licence nobody recorded.
 *
 * TWO THINGS THIS CHECKS THAT PRODUCTION CANNOT.
 *
 * Every staged photograph must belong to a real candidate in
 * `data/recipe-candidates/`. Otherwise the staging area becomes a place where
 * an image with no owner can sit indefinitely, which is exactly the hole that
 * would have been opened by relaxing `images:check` instead of building this.
 *
 * And no staged photograph may be the same file as a published one. The
 * fetchers already refuse to take a picture the other manifest holds, but a
 * refusal in the acquisition is a rule that can be edited; this is the gate.
 * Two cards in one feed showing the same picture is how a catalogue starts
 * looking fabricated — and it once was, with the same bowl of rice pudding
 * illustrating both roz bel laban and sutlac.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
const ASSET_DIR = join(ROOT, 'assets', 'recipe-candidates');
const MANIFEST = join(ROOT, 'data', 'images', 'candidate-manifest.json');
const PRODUCTION_MANIFEST = join(ROOT, 'data', 'images', 'manifest.json');
const CANDIDATE_DIR = join(ROOT, 'data', 'recipe-candidates');
const REJECTED = join(ROOT, 'data', 'images', 'rejected.json');

type CandidateImageRecord = {
  candidateSlug: string;
  batch: string;
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

type Batch = { batch: string; candidates: { slug: string }[] };

function declaredCandidates(): Map<string, string> {
  const byslug = new Map<string, string>();
  if (!existsSync(CANDIDATE_DIR)) return byslug;
  for (const name of readdirSync(CANDIDATE_DIR).filter((file) => file.endsWith('.json'))) {
    const batch = JSON.parse(readFileSync(join(CANDIDATE_DIR, name), 'utf8')) as Batch;
    for (const candidate of batch.candidates) byslug.set(candidate.slug, batch.batch);
  }
  return byslug;
}

function main(): void {
  if (!existsSync(MANIFEST)) {
    console.log('No candidate image manifest yet — nothing to validate.');
    return;
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
    images: CandidateImageRecord[];
    skipped: { candidateSlug: string; reason: string }[];
    held?: { candidateSlug: string; batch: string; reason: string }[];
    retired?: { candidateSlug: string; batch: string; reason: string }[];
  };

  const declared = declaredCandidates();
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const image of manifest.images) {
    const where = image.candidateSlug || '(no slug)';

    const batch = declared.get(image.candidateSlug);
    if (batch === undefined) {
      problems.push(`${where}: no candidate by that slug in data/recipe-candidates/`);
    } else if (batch !== image.batch) {
      problems.push(`${where}: recorded under batch "${image.batch}" but declared in "${batch}"`);
    }
    if (seen.has(image.candidateSlug)) problems.push(`${where}: appears twice`);
    seen.add(image.candidateSlug);

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
      // a file of the right size containing no picture at all.
      const declaredKind = imageKindOf(readFileSync(file));
      const claimed = image.path.slice(image.path.lastIndexOf('.') + 1).toLowerCase();
      if (declaredKind === null) {
        problems.push(`${where}: ${image.path} does not begin like an image file`);
      } else if (declaredKind !== (claimed === 'jpeg' ? 'jpg' : claimed)) {
        problems.push(`${where}: ${image.path} is really a ${declaredKind}`);
      }
      if (
        size === image.bytes &&
        createHash('sha256').update(readFileSync(file)).digest('hex') !== image.sha256
      ) {
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
    if (!image.creator?.trim()) problems.push(`${where}: no creator recorded`);
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

  // HELD candidates: a third outcome, and the manifest has to be able to say
  // it. Batch 3 found a good photograph of black bean soup for a dish the
  // ingredient catalogue cannot express — there is no black-bean row — so the
  // recipe would have been a kidney-bean soup wearing it. That is neither a
  // refusal of the file nor a dish waiting to be looked at, and with only two
  // states to choose from the review page reported it as unreviewed.
  //
  // A hold is only meaningful while the photograph is still staged and still
  // unpublished, so both are checked: a hold on a promoted dish is a
  // contradiction, and a hold on nothing is a note about a file that is gone.
  for (const hold of manifest.held ?? []) {
    const where = hold.candidateSlug || '(no slug)';
    if (!declared.has(hold.candidateSlug)) {
      problems.push(`${where}: held, but no candidate by that slug in data/recipe-candidates/`);
    }
    if (!seen.has(hold.candidateSlug)) {
      problems.push(`${where}: held, but nothing is staged for it`);
    }
    if (!hold.reason?.trim()) {
      problems.push(`${where}: held with no reason recorded`);
    }
  }

  // RETIRED candidates: the terminal outcome, and the opposite of a hold.
  //
  // A hold says "not yet": the photograph is fine and the catalogue cannot
  // carry the dish, so it becomes promotable when the catalogue changes.
  // `eish-baladi` was one and is now a recipe. A RETIREMENT says "not ever":
  // `eggah-bel-batates` is potatoes, eggs, onions, oil and salt, which is
  // `tortilla-espanola` line for line, and no amount of catalogue growth makes
  // that a different dish.
  //
  // Collapsing the two would have been the easy thing and the wrong one. A
  // retirement left in `held` reads as a backlog item, and the next person to
  // look would try to unblock it; put in `rejected.json` it would bar a
  // perfectly good photograph from every future batch. So a retired entry
  // keeps its provenance, keeps nothing staged, and is checked for both.
  for (const gone of manifest.retired ?? []) {
    const where = gone.candidateSlug || '(no slug)';
    if (!declared.has(gone.candidateSlug)) {
      problems.push(`${where}: retired, but no candidate by that slug in data/recipe-candidates/`);
    }
    if (seen.has(gone.candidateSlug)) {
      problems.push(`${where}: retired, but a photograph is still staged for it`);
    }
    if (manifest.held?.some((hold) => hold.candidateSlug === gone.candidateSlug)) {
      problems.push(`${where}: cannot be both held and retired`);
    }
    if (!gone.reason?.trim()) problems.push(`${where}: retired with no reason recorded`);
  }

  // A photograph refused on review must never come back — including by hand,
  // and including through the candidate door.
  if (existsSync(REJECTED)) {
    // Shared with the fetcher and the production validator; see `commonsKey`.
    const refused = new Map(
      (
        JSON.parse(readFileSync(REJECTED, 'utf8')) as { files: { title: string; reason: string }[] }
      ).files.map((entry) => [commonsKey(entry.title), entry.reason]),
    );
    for (const image of manifest.images) {
      const reason = refused.get(commonsKey(image.originalUrl.split('/').pop() ?? ''));
      if (reason) {
        problems.push(`${image.candidateSlug}: uses a photograph refused on review — ${reason}`);
      }
    }
  }

  // One photograph, one dish — within the staging area…
  const byFile = new Map<string, string[]>();
  for (const image of manifest.images) {
    byFile.set(image.sha256, [...(byFile.get(image.sha256) ?? []), image.candidateSlug]);
  }
  for (const [, slugs] of byFile) {
    if (slugs.length > 1) {
      problems.push(`the same photograph is staged for ${slugs.join(' and ')}`);
    }
  }

  // …and across the line into production, which is the case the staging area
  // creates and production alone cannot see.
  if (existsSync(PRODUCTION_MANIFEST)) {
    const live = JSON.parse(readFileSync(PRODUCTION_MANIFEST, 'utf8')) as {
      images: { recipeSlug: string; sha256: string; originalUrl: string }[];
    };
    const bySha = new Map(live.images.map((entry) => [entry.sha256, entry.recipeSlug]));
    const byUrl = new Map(live.images.map((entry) => [entry.originalUrl, entry.recipeSlug]));
    for (const image of manifest.images) {
      const sameFile = bySha.get(image.sha256);
      if (sameFile) {
        problems.push(
          `${image.candidateSlug}: is the same photograph already published on ${sameFile}`,
        );
      }
      const sameSource = byUrl.get(image.originalUrl);
      if (sameSource && sameSource !== sameFile) {
        problems.push(
          `${image.candidateSlug}: came from the Commons file already published on ${sameSource}`,
        );
      }
    }
  }

  if (problems.length > 0) {
    console.error(`Candidate image manifest has ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }

  const held = manifest.held?.length ?? 0;
  const retired = manifest.retired?.length ?? 0;
  console.log(
    `Candidate image manifest is valid: ${manifest.images.length} staged of ` +
      `${declared.size} declared candidate(s), ${manifest.skipped.length} with no acceptable image` +
      `${held > 0 ? `, ${held} held` : ''}${retired > 0 ? `, ${retired} retired` : ''}. ` +
      'None of them is published.',
  );
}

main();
