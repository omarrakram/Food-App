/**
 * Two questions, deliberately kept apart.
 *
 * ONTOLOGY COVERAGE asks: does the catalogue honestly represent the underlying
 * food concept? A frozen okra needs no row of its own, so it is correctly not
 * one, and counting it as a gap would mean the score falls every time the
 * ontology is applied properly.
 *
 * INPUT COVERAGE asks the question a user actually poses: if someone types
 * `بامية مجمدة`, do they get okra? Those are not the same question, and the
 * first version of this census conflated them — labelling a concept a `form`
 * made it disappear from the denominator, so the label ITSELF became the pass
 * mark. That is the same shape of defect as the old `MUST_NOT_SUGGEST`
 * assertion: a classification that excuses itself.
 *
 * So every `form` and `brand` entry now carries `expects`: the base slug its
 * typed terms must actually reach. Those expectations are AUTHORED, never read
 * back from the resolver — deriving them from current behaviour would make the
 * check vacuous. **An unmet expectation fails this audit.**
 *
 * WHAT THIS IS NOT. Not a launch holdout. It may be read, edited and optimised
 * against while the catalogue is built, which is exactly what disqualifies it
 * as validation — see §3b. It is a DISCOVERY set. Real-user validation is a
 * separate thing this does not replace.
 *
 *     npm run audit:coverage
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { INGREDIENT_CATALOGUE } from '../src/features/ingredients/catalogue.ts';
import { resolveIngredient, searchIngredients } from '../src/features/ingredients/matching.ts';
import { normaliseIngredientName } from '../src/features/ingredients/normalise.ts';

/** How a concept relates to the catalogue — the ONTOLOGY question. */
type Verdict =
  /** The catalogue has this concept under its own name. */
  | 'represented'
  /** Reachable, but through an alias rather than a row of its own. */
  | 'alias'
  /** Nothing resolves. A genuine gap. */
  | 'missing'
  /** Terms disagree, or the word means more than one food. */
  | 'ambiguous'
  /** Has a recipe. Belongs in `data/recipes/`, not here. */
  | 'dish'
  /** A preparation state of a row we have. Alias, by the §3c rule. */
  | 'form'
  /** A brand. Alias under the generic concept. */
  | 'brand';

const MANUAL = new Set<Verdict>(['ambiguous', 'dish', 'form', 'brand']);
/** Verdicts that must name the base their terms are expected to reach. */
const MUST_EXPECT = new Set<Verdict>(['form', 'brand']);

type Row = {
  id: string;
  concept: string;
  category: string;
  terms: string[];
  manual: string;
  expects: string[];
  priority: string;
};

/** Minimal CSV reader — the census has quoted fields but no embedded newlines. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  const header = splitLine(lines[0] ?? '');
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    return Object.fromEntries(header.map((key, index) => [key, cells[index] ?? '']));
  });
}

function splitLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

const pipe = (value: string): string[] =>
  value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const censusPath = resolve(import.meta.dirname, '..', 'data', 'census', 'egyptian-coverage.csv');
const rows: Row[] = parseCsv(readFileSync(censusPath, 'utf8')).map((record) => ({
  id: record.id ?? '',
  concept: record.concept ?? '',
  category: record.category ?? '',
  terms: pipe(record.terms ?? ''),
  manual: record.verdict ?? '',
  expects: pipe(record.expects ?? ''),
  priority: record.priority ?? '',
}));

// --- integrity: the census must not quietly duplicate or under-specify ------

const problems: string[] = [];

const seenIds = new Set<string>();
for (const row of rows) {
  if (!row.id) problems.push(`${row.concept}: no stable id`);
  else if (seenIds.has(row.id)) problems.push(`duplicate id: ${row.id}`);
  seenIds.add(row.id);
}

/**
 * Two concepts sharing ANY term are the same concept, whatever they are called.
 *
 * Keying uniqueness on the first term alone was too weak: `labneh [cheese]` and
 * `labneh [dairy]` differed only in category, and a pair that merely reordered
 * its terms would have slipped through. Every term is now a claim to identity.
 *
 * Compared RAW rather than normalised, because normalisation is what makes a
 * form a form: `frozen strawberry` normalises to `strawberry` and `canned
 * chickpeas` to `chickpeas`. Those pairs are the census working, not the
 * census repeating itself, and keying on the normalised form flagged 20 of
 * them as duplicates.
 */
const owner = new Map<string, Row>();
for (const row of rows) {
  for (const term of row.terms) {
    const key = term.trim().toLowerCase();
    if (!key) continue;
    const previous = owner.get(key);
    if (previous && previous.id !== row.id) {
      problems.push(`"${term}" is claimed by both ${previous.id} and ${row.id}`);
    }
    owner.set(key, row);
  }
}

for (const row of rows) {
  if (MUST_EXPECT.has(row.manual as Verdict) && row.expects.length === 0) {
    problems.push(`${row.id}: a ${row.manual} must name the base its terms should reach`);
  }
}

const KNOWN_SLUGS = new Set(INGREDIENT_CATALOGUE.map((item) => item.slug));
for (const row of rows) {
  for (const slug of row.expects) {
    if (!KNOWN_SLUGS.has(slug)) problems.push(`${row.id}: expects unknown slug "${slug}"`);
  }
}

if (problems.length > 0) {
  console.error('Census integrity:');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

// --- measurement ------------------------------------------------------------

/** Canonical names, normalised, so "reached by its own name" is answerable. */
const OWN_NAMES = new Map<string, Set<string>>(
  INGREDIENT_CATALOGUE.map((ingredient) => [
    ingredient.slug,
    new Set(
      [ingredient.name, ingredient.nameAr]
        .map((value) => normaliseIngredientName(value))
        .filter((value) => value.length > 0),
    ),
  ]),
);

type TermResult = { term: string; resolved: string | null; topHit: string | null };
type Scored = Row & {
  verdict: Verdict;
  slugs: string[];
  termResults: TermResult[];
  /** Null when the concept is out of scope for input coverage (a dish). */
  inputOk: boolean | null;
  inputFailures: string[];
};

function probe(term: string): TermResult {
  const resolved = resolveIngredient(term);
  return {
    term,
    resolved: resolved?.slug ?? null,
    topHit: searchIngredients(term, 1)[0]?.slug ?? null,
  };
}

function score(row: Row): Scored {
  const termResults = row.terms.map(probe);
  const slugs = [...new Set(termResults.map((hit) => hit.resolved).filter((s): s is string => !!s))];

  const verdict: Verdict = MANUAL.has(row.manual as Verdict)
    ? (row.manual as Verdict)
    : slugs.length === 0
      ? 'missing'
      : slugs.length > 1
        ? 'ambiguous'
        : (() => {
            const own = OWN_NAMES.get(slugs[0] ?? '') ?? new Set<string>();
            return termResults.some(
              (hit) => hit.resolved && own.has(normaliseIngredientName(hit.term)),
            )
              ? 'represented'
              : 'alias';
          })();

  // What each typed term is SUPPOSED to reach.
  const intended =
    row.expects.length > 0 ? new Set(row.expects) : slugs.length === 1 ? new Set(slugs) : null;

  // A dish has no ingredient identity to reach, so it is out of scope — but
  // its terms are still probed, so "does a dish term pretend to be an
  // ingredient?" stays answerable below.
  if (verdict === 'dish') {
    return { ...row, verdict, slugs, termResults, inputOk: null, inputFailures: [] };
  }

  if (!intended) {
    // Missing or genuinely ambiguous with no acceptable set named: every term
    // failing to resolve is the honest outcome, not an input success.
    return {
      ...row,
      verdict,
      slugs,
      termResults,
      inputOk: false,
      inputFailures: termResults.map((hit) => `${hit.term} -> ${hit.resolved ?? '(nothing)'}`),
    };
  }

  const failures = termResults
    .filter((hit) => !(hit.resolved && intended.has(hit.resolved)))
    .map((hit) => `${hit.term} -> ${hit.resolved ?? `(nothing; search: ${hit.topHit ?? '—'})`}`);

  return { ...row, verdict, slugs, termResults, inputOk: failures.length === 0, inputFailures: failures };
}

const scored = rows.map(score);
const countOf = (verdict: Verdict) => scored.filter((row) => row.verdict === verdict).length;

const TOTAL = scored.length;
const honest = countOf('represented') + countOf('alias');
const pct = (value: number, of: number) => `${Math.round((value / Math.max(of, 1)) * 1000) / 10}%`;

/** Concepts the catalogue is on the hook for as ONTOLOGY. */
const actionable =
  countOf('represented') + countOf('alias') + countOf('missing') + countOf('ambiguous');

/** Concepts in scope for INPUT coverage: everything except the dishes. */
const inputScope = scored.filter((row) => row.inputOk !== null);
const inputPass = inputScope.filter((row) => row.inputOk === true);
const inputTerms = inputScope.reduce((sum, row) => sum + row.terms.length, 0);
const inputTermFailures = inputScope.reduce((sum, row) => sum + row.inputFailures.length, 0);

/** The hard gate: a declared form or brand whose terms do not reach its base. */
const brokenAliasing = scored.filter(
  (row) => MUST_EXPECT.has(row.verdict) && row.inputOk === false,
);

/** Dishes whose terms resolve anyway — we should not pretend these are understood. */
const dishesThatResolve = scored.filter(
  (row) => row.verdict === 'dish' && row.termResults.some((hit) => hit.resolved),
);

const categories = [...new Set(scored.map((row) => row.category))].sort();

const lines: string[] = [
  '# Egyptian kitchen coverage census',
  '',
  '**Generated by `npm run audit:coverage`. Do not edit by hand — edit',
  '`data/census/egyptian-coverage.csv`.**',
  '',
  'Concepts a real Egyptian kitchen deals in, written without reference to the',
  'catalogue, then run against the live resolver. Two separate questions:',
  '**ontology coverage** (is the concept honestly represented?) and **input',
  'coverage** (if a user types these words, do they get there?).',
  '',
  '**A discovery set, not a launch holdout.** It may be optimised against while',
  'the catalogue is built, which is what disqualifies it as validation. It does',
  'not replace real-user testing.',
  '',
  '## 1. Ontology coverage',
  '',
  '| | | |',
  '|---|---:|---:|',
  `| **Concepts** | **${TOTAL}** | |`,
  `| Represented by their own row | ${countOf('represented')} | ${pct(countOf('represented'), TOTAL)} |`,
  `| Reachable through an alias | ${countOf('alias')} | ${pct(countOf('alias'), TOTAL)} |`,
  `| Missing | ${countOf('missing')} | ${pct(countOf('missing'), TOTAL)} |`,
  `| Ambiguous | ${countOf('ambiguous')} | ${pct(countOf('ambiguous'), TOTAL)} |`,
  `| Correctly not a row — dish | ${countOf('dish')} | ${pct(countOf('dish'), TOTAL)} |`,
  `| Correctly not a row — form | ${countOf('form')} | ${pct(countOf('form'), TOTAL)} |`,
  `| Correctly not a row — brand | ${countOf('brand')} | ${pct(countOf('brand'), TOTAL)} |`,
  '',
  `**Honest ontology coverage: ${honest} of the ${actionable} actionable concepts ` +
    `(${pct(honest, actionable)}).** Actionable excludes dishes, forms and brands,`,
  'which are correctly not rows.',
  '',
  '## 2. Input coverage',
  '',
  'The question a user actually asks. A `form` or `brand` label is NOT a pass —',
  'each one names the base slug its terms must reach, and an unmet expectation',
  'fails this audit.',
  '',
  '| | | |',
  '|---|---:|---:|',
  `| Concepts in scope (all but dishes) | ${inputScope.length} | |`,
  `| Concepts whose every term lands correctly | ${inputPass.length} | ${pct(inputPass.length, inputScope.length)} |`,
  `| Terms probed | ${inputTerms} | |`,
  `| Terms landing correctly | ${inputTerms - inputTermFailures} | ${pct(inputTerms - inputTermFailures, inputTerms)} |`,
  `| **Declared forms/brands whose aliasing is BROKEN** | **${brokenAliasing.length}** | |`,
  '',
  `Catalogue: **${INGREDIENT_CATALOGUE.length} canonical ingredients**, ` +
    `**${INGREDIENT_CATALOGUE.reduce((sum, item) => sum + item.aliases.length, 0)} aliases**.`,
  '',
  '## 3. By category',
  '',
  '| Category | Concepts | Represented | Alias | Missing | Ambiguous | Ontology | Input |',
  '|---|---:|---:|---:|---:|---:|---:|---:|',
];

for (const category of categories) {
  const inCategory = scored.filter((row) => row.category === category);
  const at = (verdict: Verdict) => inCategory.filter((row) => row.verdict === verdict).length;
  const honestHere = at('represented') + at('alias');
  const actionableHere = honestHere + at('missing') + at('ambiguous');
  const scopeHere = inCategory.filter((row) => row.inputOk !== null);
  const passHere = scopeHere.filter((row) => row.inputOk === true).length;
  lines.push(
    `| ${category} | ${inCategory.length} | ${at('represented')} | ${at('alias')} | ` +
      `${at('missing')} | ${at('ambiguous')} | ${pct(honestHere, actionableHere)} | ` +
      `${pct(passHere, scopeHere.length)} |`,
  );
}

if (brokenAliasing.length > 0) {
  lines.push('', '## 4. BROKEN aliasing — a declared form or brand that does not reach its base', '');
  lines.push('| Concept | Expects | What actually happened |', '|---|---|---|');
  for (const row of brokenAliasing) {
    lines.push(`| ${row.concept} | ${row.expects.join(', ')} | ${row.inputFailures.join('; ')} |`);
  }
}

lines.push('', '## 5. Missing, by priority', '');

for (const priority of ['P1', 'P2', 'long-tail', '']) {
  const group = scored.filter((row) => row.verdict === 'missing' && row.priority === priority);
  if (group.length === 0) continue;
  lines.push(`### ${priority === '' ? 'Unprioritised' : priority} — ${group.length}`, '');
  lines.push('| Concept | Category | Terms probed |', '|---|---|---|');
  for (const row of group) {
    lines.push(`| ${row.concept} | ${row.category} | ${row.terms.join(' · ')} |`);
  }
  lines.push('');
}

const ambiguous = scored.filter((row) => row.verdict === 'ambiguous');
if (ambiguous.length > 0) {
  lines.push('## 6. Ambiguous — a word that names more than one food', '');
  lines.push('| Concept | Category | Resolves to | Acceptable |', '|---|---|---|---|');
  for (const row of ambiguous) {
    lines.push(
      `| ${row.concept} | ${row.category} | ${row.slugs.join(', ') || '— (nothing)'} | ` +
        `${row.expects.join(', ') || '—'} |`,
    );
  }
  lines.push('');
}

lines.push(
  '## 7. Dish terms that resolve to an ingredient anyway',
  '',
  'Recorded rather than counted. A dish is out of scope for input coverage, but',
  'a dish term that lands on an ingredient is a claim worth seeing: some are',
  'right (بليلة really is cooked wheat) and some would be a lie.',
  '',
  '| Dish | Lands on |',
  '|---|---|',
);
for (const row of dishesThatResolve) {
  const landed = row.termResults
    .filter((hit) => hit.resolved)
    .map((hit) => `${hit.term} → ${hit.resolved}`)
    .join('; ');
  lines.push(`| ${row.concept} | ${landed} |`);
}
lines.push('');

writeFileSync(resolve(import.meta.dirname, '..', 'COVERAGE_CENSUS.md'), lines.join('\n'));
console.log(
  `${TOTAL} concepts — ontology ${honest}/${actionable} (${pct(honest, actionable)}), ` +
    `input ${inputPass.length}/${inputScope.length} concepts (${pct(inputPass.length, inputScope.length)}), ` +
    `${inputTerms - inputTermFailures}/${inputTerms} terms (${pct(inputTerms - inputTermFailures, inputTerms)}).`,
);

if (brokenAliasing.length > 0) {
  console.error(`\n${brokenAliasing.length} declared form/brand concepts do not reach their base:`);
  for (const row of brokenAliasing) {
    console.error(`  ${row.concept} expects ${row.expects.join('|')} — ${row.inputFailures.join('; ')}`);
  }
  process.exit(1);
}
