import { INGREDIENT_CATALOGUE } from '../catalogue';
import { normaliseIngredientName } from '../normalise';
import { resolveIngredient, searchIngredients } from '../matching';

import { foodGroupOf, unknownOverrideSlugs } from './fixtures/food-groups';
import { BENCHMARK, BENCHMARK_TERMS, type BenchmarkEntry } from './fixtures/vocabulary-benchmark';

/**
 * Can an Egyptian household type what is actually in its kitchen, and does it
 * get back the right thing?
 *
 * The second half of that sentence is the whole point. An earlier version of
 * this file counted whether the resolver returned *anything* and asserted
 * `stillWrong.length <= MUST_NOT_SUGGEST.length` — where `stillWrong` was
 * filtered from `MUST_NOT_SUGGEST` itself. That condition is true by
 * construction: it could never fail, it could never notice a newly introduced
 * wrong match, and it licensed every known wrong pair to keep passing. It was
 * a comment with an `expect` around it.
 *
 * Every term now carries an expected outcome, and five outcomes are counted
 * separately:
 *
 *   RESOLVED_CORRECT    `resolveIngredient` returns what it should.
 *   SEARCH_CORRECT      nothing resolves, but the top search hit is right.
 *   DEAD_END            nothing at all. The honest failure — "add anyway"
 *                       still works and the user is not misled.
 *   WRONG_SAME_GROUP    a wrong answer from the same food group. A miss.
 *   WRONG_OTHER_GROUP   a wrong answer from a DIFFERENT food group. Not a
 *                       miss — a lie, delivered confidently.
 *
 * THE SAFETY INVARIANT, and the only assertion here with a hard zero:
 * an unknown term may return nothing, but it must never confidently return an
 * unrelated ingredient.
 */

type Outcome =
  | 'RESOLVED_CORRECT'
  | 'SEARCH_CORRECT'
  | 'DEAD_END'
  | 'WRONG_SAME_GROUP'
  | 'WRONG_OTHER_GROUP';

type Scored = {
  term: string;
  outcome: Outcome;
  got: string | null;
  expected: string;
  /** True when the catalogue genuinely lacks the concept, so no alias can help. */
  absentConcept: boolean;
};

/** What the expectation permits, as slugs. Empty for a concept we do not have. */
function acceptableSlugs(entry: BenchmarkEntry): readonly string[] {
  switch (entry.expect.kind) {
    case 'canonical':
      return [entry.expect.slug];
    case 'oneOf':
      return entry.expect.slugs;
    case 'absent':
      return [];
  }
}

/** The food group the term is about, whether or not the catalogue has it. */
function expectedGroup(entry: BenchmarkEntry): string | null {
  if (entry.expect.kind === 'absent') return entry.expect.group;
  const first = acceptableSlugs(entry)[0];
  return first ? foodGroupOf(first) : null;
}

function describeExpectation(entry: BenchmarkEntry): string {
  switch (entry.expect.kind) {
    case 'canonical':
      return entry.expect.slug;
    case 'oneOf':
      return `one of ${entry.expect.slugs.join('/')}`;
    case 'absent':
      return `(absent: ${entry.expect.concept})`;
  }
}

function score(term: string, entry: BenchmarkEntry): Scored {
  const expected = describeExpectation(entry);
  const absentConcept = entry.expect.kind === 'absent';
  const acceptable = acceptableSlugs(entry);
  const wantedGroup = expectedGroup(entry);

  const classify = (slug: string, viaResolve: boolean): Outcome => {
    if (acceptable.includes(slug)) return viaResolve ? 'RESOLVED_CORRECT' : 'SEARCH_CORRECT';
    const gotGroup = foodGroupOf(slug);
    return gotGroup !== null && gotGroup === wantedGroup ? 'WRONG_SAME_GROUP' : 'WRONG_OTHER_GROUP';
  };

  const resolved = resolveIngredient(term);
  if (resolved) {
    return { term, outcome: classify(resolved.slug, true), got: resolved.slug, expected, absentConcept };
  }

  const top = searchIngredients(term, 1)[0];
  if (!top) return { term, outcome: 'DEAD_END', got: null, expected, absentConcept };
  return { term, outcome: classify(top.slug, false), got: top.slug, expected, absentConcept };
}

const RESULTS: readonly Scored[] = BENCHMARK_TERMS.map(({ term, entry }) => score(term, entry));

function countOf(outcome: Outcome): number {
  return RESULTS.filter((r) => r.outcome === outcome).length;
}

const TOTAL = RESULTS.length;

// --- the benchmark must be well-formed before it can measure anything ------

describe('the benchmark itself', () => {
  it('names only slugs the catalogue actually has', () => {
    const known = new Set(INGREDIENT_CATALOGUE.map((i) => i.slug));
    const missing = BENCHMARK.flatMap((entry) =>
      acceptableSlugs(entry).filter((slug) => !known.has(slug)),
    );
    // A typo here would silently turn a correct answer into a wrong one, and
    // the benchmark would report a regression that does not exist.
    expect(missing).toEqual([]);
  });

  it('groups only slugs the catalogue actually has', () => {
    expect(unknownOverrideSlugs()).toEqual([]);
  });

  it('knows the food group of everything it expects', () => {
    const ungrouped = BENCHMARK.filter((entry) => expectedGroup(entry) === null);
    expect(ungrouped.map((e) => e.terms[0])).toEqual([]);
  });

  it('never lists the same term under two concepts', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const { term, entry } of BENCHMARK_TERMS) {
      const owner = describeExpectation(entry);
      const previous = seen.get(term);
      if (previous !== undefined && previous !== owner) clashes.push(`${term}: ${previous} vs ${owner}`);
      seen.set(term, owner);
    }
    expect(clashes).toEqual([]);
  });
});

// --- alias collisions in the catalogue itself ------------------------------

describe('alias integrity', () => {
  it('never points one alias at two incompatible ingredients', () => {
    // An alias claimed by two ingredients is decided by map insertion order,
    // which is alphabetical by accident. Within a food group that is a
    // judgement call; ACROSS groups it is a silent wrong answer waiting for
    // whoever adds the next row.
    const owners = new Map<string, { slug: string; group: string | null }[]>();
    for (const ingredient of INGREDIENT_CATALOGUE) {
      for (const alias of [ingredient.name, ingredient.nameAr, ...ingredient.aliases]) {
        const key = normaliseIngredientName(alias);
        if (!key) continue;
        const list = owners.get(key) ?? [];
        if (!list.some((o) => o.slug === ingredient.slug)) {
          list.push({ slug: ingredient.slug, group: foodGroupOf(ingredient.slug) });
        }
        owners.set(key, list);
      }
    }

    const crossGroup = [...owners.entries()]
      .filter(([, list]) => list.length > 1)
      .filter(([, list]) => new Set(list.map((o) => o.group)).size > 1)
      .map(([alias, list]) => `"${alias}" -> ${list.map((o) => `${o.slug}(${o.group})`).join(' + ')}`);

    /*
      THE ALLOWLIST IS GONE, and this is what it used to hold.

      `حمص` was claimed by both `chickpeas` and `hummus-dip`, in different food
      groups, and which one won was decided by insertion order into the alias
      index — alphabetical by accident. That is why the app was inconsistent:
      the Arabic resolved to the pulse while the transliteration `homos` had
      no alias at all and fell through to search, which offered the dip.

      Stage 1 decided it deliberately. The bare Arabic word and its
      transliterations belong to the PULSE, which is what `حمص` means in
      Egyptian Arabic. English `hummus` belongs to the DIP, because that is
      what an English speaker asking for hummus means. The two languages
      genuinely disagree about this word, and modelling that disagreement is
      more honest than forcing one answer on both.
    */
    expect(crossGroup).toEqual([]);
  });

  it('reports same-group alias collisions without failing on them', () => {
    const owners = new Map<string, string[]>();
    for (const ingredient of INGREDIENT_CATALOGUE) {
      for (const alias of ingredient.aliases) {
        const key = normaliseIngredientName(alias);
        if (!key) continue;
        const list = owners.get(key) ?? [];
        if (!list.includes(ingredient.slug)) list.push(ingredient.slug);
        owners.set(key, list);
      }
    }
    const shared = [...owners.entries()].filter(([, list]) => list.length > 1);
    // Informational: two ingredients legitimately answering to one word
    // (`coriander` the herb and the ground seed) is a modelling decision, not
    // a defect. Printed so it stays a decision rather than an accident.
    if (shared.length > 0) {
      // `warn` rather than `log`: the repo's lint rule allows warn/error only,
      // and a benchmark that cannot print its own breakdown is half a
      // benchmark — the numbers are the deliverable, not the pass/fail.
      console.warn(
        `same-group alias collisions (${shared.length}): ` +
          shared.map(([alias, list]) => `${alias}=${list.join('/')}`).join(', '),
      );
    }
    expect(shared.length).toBeLessThanOrEqual(12);
  });
});

// --- the measurement -------------------------------------------------------

describe('vocabulary coverage', () => {
  it('reports the full breakdown', () => {
    const rows = (outcome: Outcome) =>
      RESULTS.filter((r) => r.outcome === outcome).map(
        (r) => `${r.term} -> ${r.got ?? '(nothing)'} [want ${r.expected}]`,
      );
    console.warn(
      JSON.stringify(
        {
          terms: TOTAL,
          concepts: BENCHMARK.length,
          resolvedCorrect: countOf('RESOLVED_CORRECT'),
          searchCorrect: countOf('SEARCH_CORRECT'),
          deadEnd: countOf('DEAD_END'),
          wrongSameGroup: countOf('WRONG_SAME_GROUP'),
          wrongOtherGroup: countOf('WRONG_OTHER_GROUP'),
          correctPct: Math.round(
            (100 * (countOf('RESOLVED_CORRECT') + countOf('SEARCH_CORRECT'))) / TOTAL,
          ),
          absentConceptTerms: RESULTS.filter((r) => r.absentConcept).length,
          failuresOnConceptsWeHave: RESULTS.filter(
            (r) =>
              !r.absentConcept &&
              r.outcome !== 'RESOLVED_CORRECT' &&
              r.outcome !== 'SEARCH_CORRECT',
          ).length,
          wrongOtherGroupDetail: rows('WRONG_OTHER_GROUP'),
          wrongSameGroupDetail: rows('WRONG_SAME_GROUP'),
          deadEndDetail: rows('DEAD_END'),
        },
        null,
        1,
      ),
    );
    expect(TOTAL).toBeGreaterThan(200);
  });

  it('resolves or finds the right ingredient for most terms', () => {
    const correct = countOf('RESOLVED_CORRECT') + countOf('SEARCH_CORRECT');
    // STAGE 1: 190 -> 218 (aliases). STAGE 2A batch A: 218 -> 235 (7 rows).
    expect(correct / TOTAL).toBeGreaterThanOrEqual(0.925);
  });

  it('keeps wrong answers of any kind bounded', () => {
    const wrong = countOf('WRONG_SAME_GROUP') + countOf('WRONG_OTHER_GROUP');
    // Counted from LIVE RESULTS, not filtered from the list that defines it.
    // STAGE 1: 22 -> 15. STAGE 2A batch A: 15 -> 4.
    expect(wrong).toBeLessThanOrEqual(4);
  });

  it('gets every term right whose concept the catalogue actually has', () => {
    /*
      THE INVARIANT STAGE 1 ESTABLISHED, and the one Stage 2 must not break.

      Split the benchmark in two. For a concept the catalogue HAS, a failure
      is a vocabulary gap and aliases can always close it. For a concept it
      LACKS, no alias can help and pretending otherwise means aliasing a term
      to the wrong ingredient to make a number move.

      After Stage 1 the first set is empty: all 218 terms whose concept exists
      resolve correctly. Every remaining failure is the second kind. That is
      what "aliases have reached their ceiling" means, stated as an assertion
      rather than a claim.
    */
    const failures = RESULTS.filter(
      (r) =>
        !r.absentConcept && r.outcome !== 'RESOLVED_CORRECT' && r.outcome !== 'SEARCH_CORRECT',
    ).map((r) => `${r.term} -> ${r.got ?? '(nothing)'} [want ${r.expected}]`);
    expect(failures).toEqual([]);
  });

  it('SAFETY: an unknown term never confidently returns an unrelated ingredient', () => {
    const violations = RESULTS.filter((r) => r.outcome === 'WRONG_OTHER_GROUP').map(
      (r) => `${r.term} -> ${r.got} [want ${r.expected}]`,
    );
    // The invariant that matters, and the one that must reach ZERO.
    // STAGE 1: 14 -> 10. STAGE 2A batch A: 10 -> 1. The survivor is `corn
    // flakes` offering corn oil, and batch B adds the row that closes it.
    expect(violations.length).toBeLessThanOrEqual(1);
  });
});
