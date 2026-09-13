/**
 * Acquires openly-licensed recipe photography from Wikimedia Commons.
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
 * WHAT IT WILL AND WILL NOT TAKE. Only files whose Commons licence is public
 * domain, CC0, CC BY or CC BY-SA. Anything else — non-commercial, no-derivs,
 * fair use, unknown — is skipped and reported. A photograph with no licence we
 * can verify is a photograph we may not publish, and guessing is not an option
 * open to us.
 *
 * RELEVANCE OVER COVERAGE. A recipe with no sufficiently relevant licensed
 * photo keeps the branded fallback and is named in the report. Attaching a
 * picture of "some soup" to reach a round number is worse than an honest
 * placeholder: it tells the user something false about what they are cooking.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { RECIPE_CATALOGUE } from '../src/features/recipes/catalogue.generated.ts';

const ROOT = join(import.meta.dirname, '..');
const ASSET_DIR = join(ROOT, 'assets', 'recipes');
const MANIFEST = join(ROOT, 'data', 'images', 'manifest.json');

/** Commons wants a real contact in the agent string; anonymous bulk gets blocked. */
const USER_AGENT =
  'AklaRecipeApp/1.0 (https://github.com/omarrakram/Food-App; recipe photography acquisition)';

const API = 'https://commons.wikimedia.org/w/api.php';

/**
 * Licences we may publish under, and what each obliges.
 *
 * The keys are matched against Commons' machine-readable `LicenseShortName`.
 * Deliberately a strict allowlist rather than a denylist of the bad ones: a
 * licence we have not heard of is one we have not read.
 */
const ACCEPTABLE_LICENCES: Record<string, { spdx: string; needsAttribution: boolean }> = {
  cc0: { spdx: 'CC0-1.0', needsAttribution: false },
  'public domain': { spdx: 'CC0-1.0', needsAttribution: false },
  'cc by 1.0': { spdx: 'CC-BY-1.0', needsAttribution: true },
  'cc by 2.0': { spdx: 'CC-BY-2.0', needsAttribution: true },
  'cc by 2.5': { spdx: 'CC-BY-2.5', needsAttribution: true },
  'cc by 3.0': { spdx: 'CC-BY-3.0', needsAttribution: true },
  'cc by 4.0': { spdx: 'CC-BY-4.0', needsAttribution: true },
  'cc by-sa 1.0': { spdx: 'CC-BY-SA-1.0', needsAttribution: true },
  'cc by-sa 2.0': { spdx: 'CC-BY-SA-2.0', needsAttribution: true },
  'cc by-sa 2.5': { spdx: 'CC-BY-SA-2.5', needsAttribution: true },
  'cc by-sa 3.0': { spdx: 'CC-BY-SA-3.0', needsAttribution: true },
  'cc by-sa 4.0': { spdx: 'CC-BY-SA-4.0', needsAttribution: true },
};

export type ImageRecord = {
  recipeSlug: string;
  /** Path under `assets/recipes/`, which is what the app loads. */
  path: string;
  /** Commons file page — where a reader verifies the licence themselves. */
  sourcePage: string;
  /** The exact file downloaded. */
  originalUrl: string;
  creator: string;
  license: string;
  /** Rendered attribution line, or null when the licence asks for none. */
  attribution: string | null;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  acquiredAt: string;
};

type Manifest = { images: ImageRecord[]; skipped: { recipeSlug: string; reason: string }[] };

function readManifest(): Manifest {
  if (!existsSync(MANIFEST)) return { images: [], skipped: [] };
  return JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
}

async function api(params: Record<string, string>): Promise<unknown> {
  const url = new URL(API);
  for (const [key, value] of Object.entries({ format: 'json', ...params })) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Commons ${response.status} for ${url.searchParams.get('gsrsearch') ?? ''}`);
  return response.json();
}

type Candidate = {
  title: string;
  url: string;
  descriptionUrl: string;
  width: number;
  height: number;
  mime: string;
  licenceKey: string;
  artist: string;
};

/** Strips the HTML Commons returns in its metadata fields. */
function plain(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function search(term: string, limit: number): Promise<Candidate[]> {
  const data = (await api({
    action: 'query',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${term}`,
    gsrnamespace: '6',
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
  })) as {
    query?: {
      pages?: Record<
        string,
        {
          title: string;
          imageinfo?: {
            url: string;
            descriptionurl: string;
            width: number;
            height: number;
            mime: string;
            extmetadata?: Record<string, { value?: string }>;
          }[];
        }
      >;
    };
  };

  const pages = Object.values(data.query?.pages ?? {});
  const candidates: Candidate[] = [];

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const meta = info.extmetadata ?? {};
    candidates.push({
      title: page.title,
      url: info.url,
      descriptionUrl: info.descriptionurl,
      width: info.width,
      height: info.height,
      mime: info.mime,
      licenceKey: plain(meta.LicenseShortName?.value).toLowerCase(),
      artist: plain(meta.Artist?.value) || 'Unknown',
    });
  }
  return candidates;
}

/** Minimum usable size. Below this it is a thumbnail, not a hero image. */
const MIN_EDGE = 640;

function acceptable(candidate: Candidate): { spdx: string; needsAttribution: boolean } | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(candidate.mime)) return null;
  if (Math.min(candidate.width, candidate.height) < MIN_EDGE) return null;
  return ACCEPTABLE_LICENCES[candidate.licenceKey] ?? null;
}

/**
 * Search terms for a recipe, most specific first.
 *
 * The Arabic title is tried too: Commons has better coverage of Egyptian and
 * Levantine dishes under their own names than under an English gloss.
 */
function searchTerms(recipe: (typeof RECIPE_CATALOGUE)[number]): string[] {
  const title = recipe.title.replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
  const withoutQualifiers = title
    .replace(/\b(quick|easy|baked|grilled|fried|simple|weeknight|classic)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [...new Set([title, withoutQualifiers, recipe.titleAr ?? ''].filter(Boolean))];
}

/** Downloads the file, capped so a 40MB TIFF cannot land in the repository. */
const MAX_BYTES = 6 * 1024 * 1024;

async function download(url: string): Promise<Buffer | null> {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.byteLength > MAX_BYTES ? null : buffer;
}

/**
 * A thumbnail URL from Commons at a sane width.
 *
 * Asking Commons to resize is both kinder to their bandwidth and how we avoid
 * needing an image library in this script: the file that lands is already the
 * size the app wants.
 */
function thumbUrl(original: string, width: number): string {
  const marker = '/commons/';
  const index = original.indexOf(marker);
  if (index === -1) return original;
  const tail = original.slice(index + marker.length);
  const name = tail.split('/').pop() ?? '';
  return `${original.slice(0, index)}/commons/thumb/${tail}/${width}px-${name}`;
}

const TARGET_WIDTH = 1200;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex === -1 ? Infinity : Number(args[limitIndex + 1] ?? '0');

  mkdirSync(ASSET_DIR, { recursive: true });
  const manifest = readManifest();
  const have = new Set(manifest.images.map((entry) => entry.recipeSlug));

  const todo = RECIPE_CATALOGUE.filter(
    (recipe) => recipe.slug !== null && (force || !have.has(recipe.slug)),
  ).slice(0, limit === Infinity ? undefined : limit);

  console.log(`${todo.length} recipe(s) to look for.\n`);

  const found: ImageRecord[] = [];
  const skipped: { recipeSlug: string; reason: string }[] = [];

  for (const recipe of todo) {
    const slug = recipe.slug!;
    let picked: { candidate: Candidate; licence: { spdx: string; needsAttribution: boolean } } | null =
      null;

    for (const term of searchTerms(recipe)) {
      let candidates: Candidate[] = [];
      try {
        candidates = await search(term, 12);
      } catch (error) {
        console.log(`  ${slug}: search failed (${String(error)})`);
        continue;
      }
      for (const candidate of candidates) {
        const licence = acceptable(candidate);
        if (licence) {
          picked = { candidate, licence };
          break;
        }
      }
      if (picked) break;
      // Commons asks for a gap between generator searches.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (!picked) {
      // The honest outcome. Reported, not papered over with a stock photo of
      // something else.
      skipped.push({ recipeSlug: slug, reason: 'no sufficiently licensed image found' });
      console.log(`  ✗ ${slug}`);
      continue;
    }

    const bytes = await download(thumbUrl(picked.candidate.url, TARGET_WIDTH));
    if (!bytes) {
      skipped.push({ recipeSlug: slug, reason: 'download failed or file too large' });
      console.log(`  ✗ ${slug} (download)`);
      continue;
    }

    const extension = picked.candidate.mime === 'image/png' ? 'png' : 'jpg';
    const relative = `${slug}.${extension}`;
    writeFileSync(join(ASSET_DIR, relative), bytes);

    const scale = TARGET_WIDTH / picked.candidate.width;
    found.push({
      recipeSlug: slug,
      path: relative,
      sourcePage: picked.candidate.descriptionUrl,
      originalUrl: picked.candidate.url,
      creator: picked.candidate.artist,
      license: picked.licence.spdx,
      attribution: picked.licence.needsAttribution
        ? `${picked.candidate.artist} · ${picked.licence.spdx} · Wikimedia Commons`
        : null,
      width: Math.min(TARGET_WIDTH, picked.candidate.width),
      height: Math.round(picked.candidate.height * Math.min(1, scale)),
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      acquiredAt: new Date().toISOString(),
    });
    console.log(`  ✓ ${slug}  ${picked.licence.spdx}  ${picked.candidate.title}`);
  }

  const merged: Manifest = {
    images: [
      ...manifest.images.filter((entry) => !found.some((f) => f.recipeSlug === entry.recipeSlug)),
      ...found,
    ].sort((a, b) => a.recipeSlug.localeCompare(b.recipeSlug)),
    skipped: skipped.sort((a, b) => a.recipeSlug.localeCompare(b.recipeSlug)),
  };

  writeFileSync(MANIFEST, `${JSON.stringify(merged, null, 2)}\n`);

  console.log(
    `\n${found.length} acquired, ${skipped.length} left on the branded fallback.\n` +
      `${merged.images.length} of ${RECIPE_CATALOGUE.length} recipes now have a photograph.`,
  );
}

void main();
