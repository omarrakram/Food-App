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
 *
 * THIS SCRIPT CANNOT RUN IN THE DEVELOPMENT SANDBOX — its egress proxy blocks
 * every Wikimedia host. It runs in `.github/workflows/recipe-images.yml`, where
 * the network is open. That makes its log the only diagnostic available, so
 * every failure below reports its HTTP status and URL rather than a boolean.
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

const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const WIKIPEDIA = 'https://en.wikipedia.org/w/api.php';

type Licence = { spdx: string; needsAttribution: boolean };

/**
 * Licences we may publish under, and what each obliges.
 *
 * Matched against Commons' MACHINE-READABLE `License` field (`cc-by-sa-4.0`,
 * `cc0`, `pd`) in preference to the human-facing `LicenseShortName`, which is
 * localised, inconsistently punctuated, and sometimes absent altogether.
 *
 * Deliberately a strict allowlist rather than a denylist of the bad ones: a
 * licence we have not heard of is one we have not read.
 */
const ACCEPTABLE_LICENCES: Record<string, Licence> = {
  cc0: { spdx: 'CC0-1.0', needsAttribution: false },
  pd: { spdx: 'CC0-1.0', needsAttribution: false },
  'cc-by-1.0': { spdx: 'CC-BY-1.0', needsAttribution: true },
  'cc-by-2.0': { spdx: 'CC-BY-2.0', needsAttribution: true },
  'cc-by-2.5': { spdx: 'CC-BY-2.5', needsAttribution: true },
  'cc-by-3.0': { spdx: 'CC-BY-3.0', needsAttribution: true },
  'cc-by-4.0': { spdx: 'CC-BY-4.0', needsAttribution: true },
  'cc-by-sa-1.0': { spdx: 'CC-BY-SA-1.0', needsAttribution: true },
  'cc-by-sa-2.0': { spdx: 'CC-BY-SA-2.0', needsAttribution: true },
  'cc-by-sa-2.5': { spdx: 'CC-BY-SA-2.5', needsAttribution: true },
  'cc-by-sa-3.0': { spdx: 'CC-BY-SA-3.0', needsAttribution: true },
  'cc-by-sa-4.0': { spdx: 'CC-BY-SA-4.0', needsAttribution: true },
};

/**
 * Resolves whatever Commons said about the licence into one we can publish.
 *
 * Three shapes have to be understood. The machine-readable tag (`cc-by-sa-4.0`).
 * A multi-licence tag, where the uploader offered several versions at once
 * (`cc-by-sa-3.0,2.5,2.0,1.0`) and we may pick any — the first is the most
 * recent. And the human string ("CC BY-SA 4.0", "Public domain") for the older
 * files that carry no machine tag.
 */
function resolveLicence(machine: string, human: string): Licence | null {
  const direct = ACCEPTABLE_LICENCES[machine];
  if (direct) return direct;

  // `cc-by-sa-3.0,2.5,2.0,1.0` — offered under all of them, so take the first.
  const multi = /^(cc-by(?:-sa)?)-(\d\.\d)(?:,[\d.]+)*$/.exec(machine);
  if (multi) {
    const resolved = ACCEPTABLE_LICENCES[`${multi[1]}-${multi[2]}`];
    if (resolved) return resolved;
  }

  // Public-domain tags are a family: `pd-old-100`, `pd-us`, `pd-self`, `pdm-owner`.
  if (/^pdm?(-|$)/.test(machine)) return { spdx: 'CC0-1.0', needsAttribution: false };

  const normalised = human.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalised === 'cc0' || normalised.startsWith('public domain')) {
    return { spdx: 'CC0-1.0', needsAttribution: false };
  }
  const spelled = /^cc by(-sa)? (\d\.\d)/.exec(normalised);
  if (spelled) {
    return ACCEPTABLE_LICENCES[`cc-by${spelled[1] ?? ''}-${spelled[2]}`] ?? null;
  }
  return null;
}

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries({ format: 'json', origin: '*', ...params })) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(endpoint).host}`);
  return response.json();
}

type Candidate = {
  title: string;
  url: string;
  descriptionUrl: string;
  width: number;
  height: number;
  mime: string;
  licence: Licence | null;
  artist: string;
  restrictions: string;
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

/** Minimum usable size. Below this it is a thumbnail, not a hero image. */
const MIN_EDGE = 640;

/** Strips a title down to comparable words. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reads one file's licence, size and provenance from Commons. */
function toCandidate(
  title: string,
  info: {
    url: string;
    descriptionurl: string;
    width: number;
    height: number;
    mime: string;
    extmetadata?: Record<string, { value?: string }>;
  },
): Candidate {
  const meta = info.extmetadata ?? {};
  return {
    title,
    url: info.url,
    descriptionUrl: info.descriptionurl,
    width: info.width,
    height: info.height,
    mime: info.mime,
    licence: resolveLicence(
      plain(meta.License?.value).toLowerCase(),
      plain(meta.LicenseShortName?.value),
    ),
    artist: plain(meta.Artist?.value) || 'Unknown',
    restrictions: plain(meta.Restrictions?.value),
  };
}

type ImageInfoPages = {
  query?: {
    pages?: Record<
      string,
      {
        title: string;
        index?: number;
        missing?: string;
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

function candidatesFrom(data: ImageInfoPages): Candidate[] {
  // `pages` comes back keyed by page id, in no useful order. The generator's
  // own `index` is the search ranking, and the ranking is most of what makes a
  // result relevant — so sort by it rather than by hash order.
  const pages = Object.values(data.query?.pages ?? {}).sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );
  const candidates: Candidate[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (info) candidates.push(toCandidate(page.title, info));
  }
  return candidates;
}

const IMAGE_INFO = { prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata' };

/**
 * SOURCE 1 — the lead photograph of the dish's own Wikipedia article.
 *
 * The highest-precision source there is. An encyclopaedia article about koshari
 * is illustrated with a photograph of koshari, chosen and argued over by people
 * who know what it should look like. Nothing a keyword search returns comes
 * close to that.
 *
 * The article's categories are checked before its picture is trusted, because
 * "Turkey" is a bird, a country and a dinner, and only one of those belongs on
 * a recipe card.
 */
const FOOD_CATEGORY =
  /food|cuisine|dish|cake|bread|dessert|soup|stew|salad|snack|beverage|drink|confection|pastr|meat|vegetab|rice|noodle|pasta|sandwich|breakfast|curr|sweet|cheese|seafood|fish/i;

async function fromWikipediaArticle(name: string): Promise<Candidate[]> {
  const article = (await api(WIKIPEDIA, {
    action: 'query',
    titles: name,
    redirects: '1',
    prop: 'pageimages|categories',
    piprop: 'name',
    cllimit: 'max',
    clshow: '!hidden',
  })) as {
    query?: {
      pages?: Record<
        string,
        { missing?: string; pageimage?: string; categories?: { title: string }[] }
      >;
    };
  };

  const page = Object.values(article.query?.pages ?? {})[0];
  if (!page || page.missing !== undefined || !page.pageimage) return [];

  const categories = (page.categories ?? []).map((entry) => entry.title).join(' ');
  if (!FOOD_CATEGORY.test(categories)) return [];

  const file = (await api(COMMONS, {
    action: 'query',
    titles: `File:${page.pageimage}`,
    ...IMAGE_INFO,
  })) as ImageInfoPages;
  return candidatesFrom(file);
}

/**
 * SOURCE 2 — the files Commons itself files under the dish.
 *
 * A Commons category is a human judgement that these pictures are of this
 * thing. `Category:Basbousa` contains photographs of basbousa; it does not
 * contain a photograph of a Boston restaurant's tasting menu that happens to
 * mention semolina in its description. That is the whole difference between a
 * category and a text search.
 */
async function fromCommonsCategory(name: string): Promise<Candidate[]> {
  const data = (await api(COMMONS, {
    action: 'query',
    generator: 'categorymembers',
    gcmtitle: `Category:${name}`,
    gcmtype: 'file',
    gcmlimit: '24',
    ...IMAGE_INFO,
  })) as ImageInfoPages;
  return candidatesFrom(data);
}

/**
 * SOURCE 3 — full-text search, and it may only return a file that NAMES the dish.
 *
 * THIS IS WHERE THE SECOND RUN WENT WRONG. Searching "Potato and Cauliflower
 * Curry" and taking the best-scoring licensed hit produced, for aloo gobi, a
 * photograph captioned "Curry roasted cauliflower and haricots verts, roasted
 * garlic celeriac puree, beef bourguignon, and chicken thigh with sweet potato
 * and apple". Every word it scored on was real. The picture was of something
 * else entirely.
 *
 * Scoring by shared words cannot tell those apart, so this no longer scores.
 * The file's own title must CONTAIN the dish's name as a phrase. A gloss like
 * "Tray-Baked Salmon and Vegetables" will therefore match nothing, and that is
 * the correct outcome: the honest fallback beats a confident wrong picture.
 */
async function fromCommonsSearch(name: string): Promise<Candidate[]> {
  const data = (await api(COMMONS, {
    action: 'query',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${name}`,
    gsrnamespace: '6',
    gsrlimit: '16',
    ...IMAGE_INFO,
  })) as ImageInfoPages;

  const phrase = normalise(name);
  if (phrase.split(' ').length < 2) return [];
  return candidatesFrom(data).filter((candidate) =>
    normalise(candidate.title.replace(/^File:/, '').replace(/\.\w+$/, '')).includes(phrase),
  );
}

function usable(candidate: Candidate): boolean {
  if (!['image/jpeg', 'image/png'].includes(candidate.mime)) return false;
  if (Math.min(candidate.width, candidate.height) < MIN_EDGE) return false;
  // "trademarked", "personality rights" — a free licence on the photograph does
  // not make the thing photographed free to use commercially.
  if (candidate.restrictions) return false;
  return candidate.licence !== null;
}

/**
 * Trailing slug segments that describe OUR version rather than the dish.
 *
 * `butter-chicken-light` is a lighter butter chicken, and butter chicken is
 * what a photograph of it looks like. Dropping the qualifier is what turns an
 * unsearchable slug into the name of a real dish.
 */
const QUALIFIERS = new Set([
  'vegetarian', 'light', 'homemade', 'oven', 'easy', 'quick', 'healthy',
  'simple', 'baked', 'grilled', 'fried', 'style', 'recipe', 'classic', 'quick',
]);

/**
 * The names this dish might be photographed under, most specific first.
 *
 * THE SLUG COMES FIRST, and that is not an accident. `aloo-gobi` is the dish's
 * name; its title, "Potato and Cauliflower Curry", is an English gloss written
 * so an Egyptian home cook knows what they are getting. Searching the gloss
 * finds pictures of curry. Searching the name finds pictures of aloo gobi.
 */
function dishNames(recipe: (typeof RECIPE_CATALOGUE)[number]): string[] {
  const slug = (recipe.slug ?? '').split('-');
  const names = [slug.join(' ')];

  const trimmed = [...slug];
  while (trimmed.length > 1 && QUALIFIERS.has(trimmed[trimmed.length - 1]!)) trimmed.pop();
  if (trimmed.length !== slug.length) names.push(trimmed.join(' '));

  names.push(recipe.title.replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim());
  return [...new Set(names.filter((name) => name.length > 2))];
}

/**
 * Every candidate for this recipe, best source first.
 *
 * Ordered rather than merged: an article's lead photograph is better evidence
 * than a category, and a category is better evidence than a phrase match. The
 * first source that yields something publishable wins, so a weaker source is
 * only ever consulted because the stronger ones had nothing.
 */
async function* candidatesFor(
  recipe: (typeof RECIPE_CATALOGUE)[number],
  note: (message: string) => void,
): AsyncGenerator<Candidate> {
  const names = dishNames(recipe);
  const sources: [string, (name: string) => Promise<Candidate[]>][] = [
    ['wikipedia', fromWikipediaArticle],
    ['category', fromCommonsCategory],
    ['search', fromCommonsSearch],
  ];

  const seen = new Set<string>();
  for (const [label, lookup] of sources) {
    for (const name of names) {
      let found: Candidate[] = [];
      try {
        found = await lookup(name);
      } catch (error) {
        note(`${label} "${name}": ${String(error)}`);
        continue;
      }
      for (const candidate of found) {
        if (seen.has(candidate.url) || !usable(candidate)) continue;
        seen.add(candidate.url);
        yield candidate;
      }
      // Wikimedia asks for a gap between generated queries.
      await sleep(200);
    }
  }
}

/** Downloads are capped so a 40MB TIFF cannot land in the repository. */
const MAX_BYTES = 6 * 1024 * 1024;

/** What a JPEG and a PNG start with. An HTML error page starts with neither. */
function looksLikeImage(bytes: Buffer): boolean {
  if (bytes.byteLength < 8) return false;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return jpeg || png;
}

type Fetched = { bytes: Buffer; url: string } | { error: string };

/**
 * One GET, with the status reported rather than swallowed.
 *
 * Retries only what retrying can fix: Commons rate-limits bulk clients with a
 * 429 and occasionally 503s a thumbnail render that has not finished yet. A 404
 * is an answer, not a hiccup, and re-asking is just rude.
 */
async function get(url: string, attempt = 1): Promise<Fetched> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'image/jpeg,image/png,image/*' },
    });
  } catch (error) {
    if (attempt >= 3) return { error: `network: ${String(error)}` };
    await sleep(attempt * 1000);
    return get(url, attempt + 1);
  }

  if (response.status === 429 || response.status >= 500) {
    if (attempt >= 3) return { error: `HTTP ${response.status}` };
    await sleep(attempt * 2000);
    return get(url, attempt + 1);
  }
  if (!response.ok) return { error: `HTTP ${response.status}` };

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    return { error: `${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB exceeds the cap` };
  }
  if (!looksLikeImage(bytes)) return { error: 'response was not image data' };
  return { bytes, url };
}

/**
 * A thumbnail URL from Commons at a given width.
 *
 *     .../wikipedia/commons/8/8f/Koshari.jpg
 *     .../wikipedia/commons/thumb/8/8f/Koshari.jpg/1200px-Koshari.jpg
 */
function thumbUrl(original: string, width: number): string {
  const marker = '/commons/';
  const index = original.indexOf(marker);
  if (index === -1) return original;
  const tail = original.slice(index + marker.length);
  const name = tail.split('/').pop() ?? '';
  return `${original.slice(0, index)}/commons/thumb/${tail}/${Math.round(width)}px-${name}`;
}

const TARGET_WIDTH = 1200;

/**
 * Gets the bytes for a candidate at a sensible size.
 *
 * THIS IS WHERE THE FIRST RUN FAILED, 118 times out of 118. It asked for a
 * 1200px render of every file including the ones that were 900px wide, and
 * MediaWiki does not upscale — it answers 404. So the width asked for is now
 * never larger than the file actually is, with the untouched original as the
 * last resort.
 *
 * Asking Commons to resize (rather than shrinking the original here) is both
 * kinder to their bandwidth and how this script avoids needing an image
 * library: the file that lands is already the size the app wants.
 */
async function fetchImage(candidate: Candidate): Promise<Fetched> {
  const widths = [...new Set([Math.min(TARGET_WIDTH, candidate.width), 960, 800, 640])]
    .filter((width) => width <= candidate.width)
    .sort((a, b) => b - a);

  const errors: string[] = [];
  for (const width of widths) {
    const result = await get(thumbUrl(candidate.url, width));
    if ('bytes' in result) return result;
    errors.push(`${width}px ${result.error}`);
  }

  // Every render refused. The original always exists, so try it — it is only
  // rejected here if it is genuinely too big to keep.
  const original = await get(candidate.url);
  if ('bytes' in original) return original;
  errors.push(`original ${original.error}`);
  return { error: errors.join('; ') };
}

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
    let picked: Candidate | null = null;
    let bytes: Buffer | null = null;
    let downloadedFrom = '';
    const notes: string[] = [];
    const note = (message: string) => notes.push(message);

    // Walks the sources in order and stops at the first candidate that both
    // qualifies and actually downloads — so a recipe is not abandoned because
    // its single best photograph happens to 404. Capped so one unlucky dish
    // cannot spend the whole run's request budget.
    let tried = 0;
    for await (const candidate of candidatesFor(recipe, note)) {
      const result = await fetchImage(candidate);
      if ('bytes' in result) {
        picked = candidate;
        bytes = result.bytes;
        downloadedFrom = result.url;
        break;
      }
      notes.push(`${candidate.title}: ${result.error}`);
      tried += 1;
      if (tried >= 6) break;
    }

    if (!picked || !bytes) {
      // The honest outcome. Reported, not papered over with a stock photo of
      // something else.
      const reason = notes.length > 0 ? notes[0]! : 'no relevant openly-licensed image found';
      skipped.push({ recipeSlug: slug, reason });
      console.log(`  ✗ ${slug} — ${reason}`);
      continue;
    }

    const extension = picked.mime === 'image/png' ? 'png' : 'jpg';
    const relative = `${slug}.${extension}`;
    writeFileSync(join(ASSET_DIR, relative), bytes);

    // The width we actually got, derived from the URL we actually used, so the
    // manifest describes the file on disk rather than the file we asked for.
    const asked = /\/(\d+)px-[^/]+$/.exec(downloadedFrom);
    const width = asked ? Number(asked[1]) : picked.width;
    const height = Math.round(picked.height * (width / picked.width));

    found.push({
      recipeSlug: slug,
      path: relative,
      sourcePage: picked.descriptionUrl,
      originalUrl: picked.url,
      creator: picked.artist,
      license: picked.licence!.spdx,
      attribution: picked.licence!.needsAttribution
        ? `${picked.artist} · ${picked.licence!.spdx} · Wikimedia Commons`
        : null,
      width,
      height,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      acquiredAt: new Date().toISOString(),
    });
    console.log(
      `  ✓ ${slug}  ${picked.licence!.spdx}  ${width}px  ${picked.title}`,
    );
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
