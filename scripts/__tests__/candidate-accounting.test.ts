/**
 * Every candidate dish must be accounted for.
 *
 * The review page is the only place anybody sees what happened to a proposed
 * dish, and twice now it has been wrong in the same direction: it reported
 * dishes as untried that had in fact been decided. First eleven promoted
 * dishes showed as "not attempted yet" because promotion moves a candidate
 * OUT of the staging manifest; then fifteen human-rejected ones showed the
 * same way, because a refusal deletes the staged file and its entry and
 * leaves its only trace in `rejected.json`.
 *
 * Both were fixed by teaching the generator to read the other files. This
 * test is the thing that makes the fix stick, and it is deliberately a rule
 * about the DATA rather than about the markdown: a candidate is in exactly
 * one of four states, and if it is in none of them the page cannot describe
 * it honestly no matter how the generator is written.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...parts: string[]) => JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));

type Batch = { batch: string; candidates: { slug: string; name: string }[] };

const batches: Batch[] = readdirSync(join(ROOT, 'data', 'recipe-candidates'))
  .filter((name) => name.endsWith('.json'))
  .map((name) => read('data', 'recipe-candidates', name) as Batch);

const candidates = new Map(
  batches.flatMap((batch) => batch.candidates.map((entry) => [entry.slug, batch.batch] as const)),
);

const staging = read('data', 'images', 'candidate-manifest.json') as {
  images: { candidateSlug: string }[];
  skipped: { candidateSlug: string }[];
  held?: { candidateSlug: string; reason: string }[];
};
const production = read('data', 'images', 'manifest.json') as {
  images: { recipeSlug: string }[];
};
const rejected = read('data', 'images', 'rejected.json') as {
  files: { title: string; rejectedFor: string; reason: string }[];
};

const staged = new Set(staging.images.map((entry) => entry.candidateSlug));
const skipped = new Set(staging.skipped.map((entry) => entry.candidateSlug));
const held = new Set((staging.held ?? []).map((entry) => entry.candidateSlug));
const published = new Set(production.images.map((entry) => entry.recipeSlug));
const refused = new Set(rejected.files.map((entry) => entry.rejectedFor));

describe('candidate accounting', () => {
  it('has candidates to account for', () => {
    expect(candidates.size).toBeGreaterThan(50);
  });

  it('leaves no candidate in no state at all, once its batch has been acquired', () => {
    // Promoted, staged, held, mechanically unfindable, or refused by a person.
    //
    // A SIXTH STATE IS LEGITIMATE and has to be said out loud: a batch that
    // has just been declared and whose acquisition has not run yet. Every one
    // of its dishes is genuinely "not attempted", and that is the one time the
    // review page's "_not attempted yet_" is true rather than a hole.
    //
    // It is distinguishable rather than assumed. The fetcher writes a
    // `skipped` entry for anything it cannot find, so once acquisition has run
    // over a batch, every dish in it lands in some list. A batch with no
    // footprint at all — nothing staged, skipped, held or published — has not
    // been run. A batch with a partial footprint has, and a dish missing from
    // it is the defect this test exists for.
    const unrun = new Set(
      batches
        .filter((batch) =>
          batch.candidates.every(
            (entry) =>
              !published.has(entry.slug) &&
              !staged.has(entry.slug) &&
              !skipped.has(entry.slug) &&
              !held.has(entry.slug),
          ),
        )
        .map((batch) => batch.batch),
    );

    const unaccounted = [...candidates.entries()]
      .filter(([, batch]) => !unrun.has(batch))
      .map(([slug]) => slug)
      .filter(
        (slug) =>
          !published.has(slug) && !staged.has(slug) && !skipped.has(slug) && !refused.has(slug),
      );

    expect(unaccounted).toEqual([]);
  });

  it('does not let the unrun-batch exemption swallow a real gap', () => {
    // The exemption is per batch, so it cannot hide a dish in a batch that HAS
    // been acquired — which is every batch but the newest.
    const acquired = batches.filter((batch) =>
      batch.candidates.some(
        (entry) =>
          published.has(entry.slug) ||
          staged.has(entry.slug) ||
          skipped.has(entry.slug) ||
          held.has(entry.slug),
      ),
    );
    expect(acquired.length).toBeGreaterThanOrEqual(3);

    for (const batch of acquired) {
      const missing = batch.candidates
        .map((entry) => entry.slug)
        .filter(
          (slug) =>
            !published.has(slug) && !staged.has(slug) && !skipped.has(slug) && !refused.has(slug),
        );
      expect({ batch: batch.batch, missing }).toEqual({ batch: batch.batch, missing: [] });
    }
  });

  it('keeps every hold a human has placed', () => {
    /**
     * A HOLD MUST SURVIVE A MACHINE RE-RUNNING.
     *
     * `fetch-candidate-images.ts` rewrites the whole manifest on every
     * acquisition, and it used to emit only `comment`, `images` and
     * `skipped` — so batch 4's run silently deleted the hold a reviewer had
     * placed on `black-bean-soup` during batch 3. The photograph stayed
     * staged; the decision about it did not, and the next
     * `images:promote --batch` would have shipped it.
     *
     * This pins the holds by name. Adding one means adding it here too, which
     * is the point: a hold is a human decision, and losing one should take an
     * edit rather than a re-run.
     */
    const PLACED = ['black-bean-soup', 'eggah-bel-batates', 'eish-baladi'];
    expect([...held].sort()).toEqual(PLACED);
  });

  it('never holds a dish whose photograph is already published', () => {
    // A hold says "this is not going out yet". If it is already out, the hold
    // is stale and the page is describing a decision that no longer applies.
    expect([...held].filter((slug) => published.has(slug))).toEqual([]);
  });

  it('gives every hold a staged photograph and a reason', () => {
    for (const hold of staging.held ?? []) {
      expect(staged.has(hold.candidateSlug)).toBe(true);
      expect(hold.reason.trim().length).toBeGreaterThan(40);
    }
  });

  it('records a reason with every human refusal', () => {
    const thin = rejected.files
      .filter((entry) => entry.reason.trim().length < 40 || !entry.rejectedFor.trim())
      .map((entry) => entry.title);

    expect(thin).toEqual([]);
  });
});
