/**
 * The human-review surface for staged photography.
 *
 *     npm run images:review-candidates   # writes PHOTO_CANDIDATE_REVIEW.md
 *
 * WHY THIS PAGE EXISTS. Every mechanical check the acquisition runs reads a
 * title, a licence, a category and a pixel count. None of them can see the
 * picture. The record of that gap is `data/images/rejected.json`: an aerial
 * photograph of the Turkish town of Menemen for the dish named after it, a
 * grape vine for stuffed vine leaves, breaded oysters for scrambled eggs,
 * a branded milkshake cup with somebody else's trademark across it. Each one
 * passed every automatic test.
 *
 * So the last check is a person looking at the photograph, and this is what
 * they look at. The image references are relative repository paths, which
 * means GitHub renders them inline — the review happens by scrolling one page,
 * not by opening forty files.
 *
 * TO REJECT ONE: add its Commons title to `data/images/rejected.json` with the
 * reason, delete the staged file and its manifest entry, and re-run the
 * acquisition. The refusal is permanent and applies to production too; the
 * fetchers will never choose that file again and both validators refuse a
 * manifest containing it.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const CANDIDATE_DIR = join(ROOT, 'data', 'recipe-candidates');
const MANIFEST = join(ROOT, 'data', 'images', 'candidate-manifest.json');
const PRODUCTION = join(ROOT, 'data', 'images', 'manifest.json');
const REJECTED = join(ROOT, 'data', 'images', 'rejected.json');
const OUTPUT = join(ROOT, 'PHOTO_CANDIDATE_REVIEW.md');

type Candidate = {
  slug: string;
  name: string;
  nameAr: string;
  cuisine: string;
  coreIngredients: string[];
  note?: string;
};
type Batch = { batch: string; intent: string; candidates: Candidate[] };
type Record_ = {
  candidateSlug: string;
  batch: string;
  path: string;
  sourcePage: string;
  creator: string;
  license: string;
  attribution: string | null;
  width: number;
  height: number;
  bytes: number;
};
type Manifest = {
  images: Record_[];
  skipped: { candidateSlug: string; batch: string; reason: string }[];
  held?: { candidateSlug: string; batch: string; reason: string }[];
};

function batches(): Batch[] {
  if (!existsSync(CANDIDATE_DIR)) return [];
  return readdirSync(CANDIDATE_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(CANDIDATE_DIR, name), 'utf8')) as Batch);
}

function manifest(): Manifest {
  if (!existsSync(MANIFEST)) return { images: [], skipped: [] };
  return JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
}

/**
 * What a HUMAN refused, per dish.
 *
 * `skipped` only records what the ACQUISITION could not find. A dish whose
 * photograph a person looked at and rejected leaves no trace there — the file
 * and its manifest entry are deleted — so batch 3 reported fifteen dishes a
 * reviewer had just turned down as "not attempted yet". That is the same
 * class of lie as the promoted-but-unlisted bug: the page has to show the
 * review that happened, or nobody can tell an untried dish from a refused one.
 */
function refusedByHand(): Map<string, string> {
  if (!existsSync(REJECTED)) return new Map();
  const file = JSON.parse(readFileSync(REJECTED, 'utf8')) as {
    files: { title: string; rejectedFor: string; reason: string }[];
  };
  const bySlug = new Map<string, string>();
  // Last one wins: a dish refused twice shows the most recent refusal, which
  // is the one that says what is still wrong.
  for (const entry of file.files) {
    bySlug.set(entry.rejectedFor, `${entry.title}: refused on review — ${entry.reason}`);
  }
  return bySlug;
}

/**
 * Candidates whose photograph has already been promoted.
 *
 * Read because a promoted candidate LEAVES the candidate manifest, and without
 * this the page reported eleven dishes that are on recipe cards right now as
 * "not attempted yet". A review surface that misstates the state is worse than
 * no review surface, because somebody acts on it.
 */
function promoted(): Map<string, { creator: string; license: string }> {
  if (!existsSync(PRODUCTION)) return new Map();
  const live = JSON.parse(readFileSync(PRODUCTION, 'utf8')) as {
    images: { recipeSlug: string; creator: string; license: string }[];
  };
  return new Map(
    live.images.map((entry) => [
      entry.recipeSlug,
      { creator: entry.creator, license: entry.license },
    ]),
  );
}

function main(): void {
  const all = batches();
  const staged = manifest();
  const live = promoted();
  const byslug = new Map(staged.images.map((entry) => [entry.candidateSlug, entry]));
  const skippedBySlug = new Map(staged.skipped.map((entry) => [entry.candidateSlug, entry.reason]));
  const refused = refusedByHand();
  const heldBySlug = new Map((staged.held ?? []).map((entry) => [entry.candidateSlug, entry.reason]));

  const lines: string[] = [
    '# Candidate photography — review before any of this ships',
    '',
    '**Generated by `npm run images:review-candidates`. Do not edit by hand.**',
    '',
    'None of these photographs is published. They are staged in',
    '`assets/recipe-candidates/`, which the app does not bundle and does not index.',
    'A staged photograph reaches a recipe card only through `npm run images:promote`,',
    'by name, after its recipe exists.',
    '',
    '**A photograph passing the automatic checks does not prove it depicts the right',
    'dish.** The checks read a title, a licence, a category and a pixel count. They',
    'cannot see the picture. `data/images/rejected.json` is the record of what that',
    'misses: an aerial view of the Turkish town of Menemen for the dish named after',
    'it, a grape vine for stuffed vine leaves, breaded oysters for scrambled eggs.',
    'Every one passed every automatic test.',
    '',
    '### To reject one',
    '',
    'Add its Commons title to `data/images/rejected.json` with the reason, delete the',
    'staged file and its manifest entry, and re-run the acquisition. The refusal is',
    'permanent, applies to production as well, and both validators refuse a manifest',
    'that contains a refused file.',
    '',
  ];

  for (const batch of all) {
    const withImage = batch.candidates.filter(
      (entry) => byslug.has(entry.slug) && !heldBySlug.has(entry.slug),
    );
    const held = batch.candidates.filter(
      (entry) => byslug.has(entry.slug) && heldBySlug.has(entry.slug),
    );
    const done = batch.candidates.filter(
      (entry) => !byslug.has(entry.slug) && live.has(entry.slug),
    );
    const without = batch.candidates.filter(
      (entry) => !byslug.has(entry.slug) && !live.has(entry.slug),
    );

    lines.push(
      `## ${batch.batch}`,
      '',
      batch.intent,
      '',
      `**${batch.candidates.length} candidates: ${done.length} reviewed and shipped, ` +
        `${withImage.length} waiting to be looked at, ` +
        `${held.length > 0 ? `${held.length} held, ` : ''}` +
        `${without.length} with nothing acceptable.**`,
      '',
    );

    if (done.length > 0) {
      lines.push(
        `### Already promoted (${done.length})`,
        '',
        'Reviewed, written as recipes, and now on a card. Their photographs live in',
        '`assets/recipes/` and are validated by `npm run images:check`.',
        '',
        '| Dish | Creator | Licence |',
        '|---|---|---|',
      );
      for (const candidate of done) {
        const image = live.get(candidate.slug)!;
        lines.push(
          `| ${candidate.name} (\`${candidate.slug}\`) | ${image.creator} | ${image.license} |`,
        );
      }
      lines.push('');
    }

    for (const candidate of withImage) {
      const image = byslug.get(candidate.slug)!;
      lines.push(
        `### ${candidate.name} · ${candidate.nameAr}`,
        '',
        `\`${candidate.slug}\` · ${candidate.cuisine} · ` +
          `${candidate.coreIngredients.map((slug) => `\`${slug}\``).join(', ')}`,
        '',
        ...(candidate.note ? [candidate.note, ''] : []),
        `![${candidate.name}](assets/recipe-candidates/${image.path})`,
        '',
        '| | |',
        '|---|---|',
        `| Creator | ${image.creator} |`,
        `| Licence | ${image.license} |`,
        `| Attribution | ${image.attribution ?? '_none required_'} |`,
        `| Source | ${image.sourcePage} |`,
        `| Size | ${image.width}×${image.height}, ${Math.round(image.bytes / 1024)} KB |`,
        '',
        '- [ ] This is a photograph of this dish, and I would put it on the card.',
        '',
      );
    }

    if (held.length > 0) {
      lines.push(
        `### Held (${held.length})`,
        '',
        'Looked at, and nothing is wrong with the photograph — the dish is the',
        'problem. These stay staged and unpublished until whatever is blocking them',
        'is resolved, which is why they are not in `rejected.json`: that list is',
        'permanent and global, and refusing a good file there would keep it out of',
        'every future batch as well.',
        '',
        '| Dish | Why it is held |',
        '|---|---|',
      );
      for (const candidate of held) {
        const reason = heldBySlug.get(candidate.slug)!;
        lines.push(`| ${candidate.name} (\`${candidate.slug}\`) | ${reason.replace(/\|/g, '\\|')} |`);
      }
      lines.push('');
    }

    if (without.length > 0) {
      lines.push(
        `### No acceptable image (${without.length})`,
        '',
        'These keep nothing. A generic photograph of something else is not a',
        'substitute — it tells the user something false about what they are cooking.',
        '',
        '| Dish | Why |',
        '|---|---|',
      );
      for (const candidate of without) {
        const reason =
          skippedBySlug.get(candidate.slug) ?? refused.get(candidate.slug) ?? '_not attempted yet_';
        lines.push(`| ${candidate.name} (\`${candidate.slug}\`) | ${reason.replace(/\|/g, '\\|')} |`);
      }
      lines.push('');
    }
  }

  writeFileSync(OUTPUT, `${lines.join('\n')}\n`);

  const total = all.reduce((sum, batch) => sum + batch.candidates.length, 0);
  const shipped = all
    .flatMap((batch) => batch.candidates)
    .filter((entry) => !byslug.has(entry.slug) && live.has(entry.slug)).length;
  const waiting = staged.images.filter((entry) => !heldBySlug.has(entry.candidateSlug)).length;
  console.log(
    `PHOTO_CANDIDATE_REVIEW.md written: of ${total} candidate(s), ${shipped} promoted, ` +
      `${waiting} waiting to be looked at, ${heldBySlug.size} held.`,
  );
}

main();
