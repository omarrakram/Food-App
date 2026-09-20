import { RECIPE_CATALOGUE } from '../catalogue.generated';

/**
 * What the clock and the claim-tags promise, asserted against what shipped.
 *
 * The importer enforces these on the dataset; this asserts them on the
 * generated catalogue, so the rules survive a hand-edit of the generated file
 * or a weakening of the importer.
 *
 * The semantics, established in Stage 3P.2 by reading the corpus rather than
 * by inventing a convention:
 *
 *   prepMinutes includes the waiting a cook has to plan around — soaking,
 *   proofing, resting, cooling — because the total promises ELAPSED time.
 *
 *   step minutes may sum to MORE than the total, because steps overlap. The
 *   eggs boil in the pan already boiling the potatoes. Only the one-sided
 *   failure is a defect: a recipe that takes materially longer than it says.
 */

const total = (r: (typeof RECIPE_CATALOGUE)[number]) => r.prepMinutes + r.cookMinutes;
const stepMinutes = (r: (typeof RECIPE_CATALOGUE)[number]) =>
  r.steps.map((s) => s.durationMinutes ?? 0);

describe('a recipe may not take longer than it claims', () => {
  it('has no step longer than the whole recipe', () => {
    // `caprese-stack` claimed 8 minutes and opened with "take everything out of
    // the fridge 20 minutes before".
    const offenders = RECIPE_CATALOGUE.filter(
      (r) => total(r) > 0 && Math.max(0, ...stepMinutes(r)) > total(r),
    ).map((r) => `${r.slug}: step ${Math.max(0, ...stepMinutes(r))}m vs total ${total(r)}m`);

    expect(offenders).toEqual([]);
  });

  it('keeps the sum of steps within the overlap tolerance', () => {
    const offenders = RECIPE_CATALOGUE.filter((r) => {
      if (total(r) <= 0) return false;
      const sum = stepMinutes(r).reduce((a, b) => a + b, 0);
      return sum > total(r) * 1.25 + 5;
    }).map((r) => r.slug);

    expect(offenders).toEqual([]);
  });

  it('does NOT require the sum to match, because overlap is real', () => {
    // If this ever becomes false, somebody has tightened the rule into one
    // that punishes honest recipes — a third of the catalogue overlaps steps.
    const overlapping = RECIPE_CATALOGUE.filter((r) => {
      const sum = stepMinutes(r).reduce((a, b) => a + b, 0);
      return sum !== total(r);
    }).length;

    expect(overlapping).toBeGreaterThan(RECIPE_CATALOGUE.length / 2);
  });
});

describe('tags that make a claim have to be true', () => {
  it('never calls a recipe quick when it takes over 30 minutes', () => {
    const offenders = RECIPE_CATALOGUE.filter(
      (r) => r.tags.includes('quick') && total(r) > 30,
    ).map((r) => `${r.slug} (${total(r)}m)`);

    expect(offenders).toEqual([]);
  });

  it('never calls a recipe beginner unless it is easy', () => {
    const offenders = RECIPE_CATALOGUE.filter(
      (r) => r.tags.includes('beginner') && r.difficulty !== 'easy',
    ).map((r) => `${r.slug} (${r.difficulty})`);

    expect(offenders).toEqual([]);
  });

  it('keeps both guards non-vacuous — the tags are actually in use', () => {
    expect(RECIPE_CATALOGUE.filter((r) => r.tags.includes('quick')).length).toBeGreaterThan(50);
    expect(RECIPE_CATALOGUE.filter((r) => r.tags.includes('beginner')).length).toBeGreaterThan(50);
  });
});
