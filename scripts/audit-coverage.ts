/**
 * What share of a real Egyptian kitchen can this catalogue actually name?
 *
 * The vocabulary benchmark cannot answer that, and was never meant to. It was
 * written FROM the catalogue's known gaps, so once those closed it saturated at
 * 258/258 and stopped carrying information. A score of 100% there means "the
 * failures we already knew about are fixed" — not "a cook can type what is in
 * the fridge".
 *
 * This census is the other measurement. It is a list of concepts an Egyptian
 * kitchen, supermarket, butcher and fishmonger actually deal in, written
 * WITHOUT reference to what the catalogue happens to contain, and then run
 * against the live resolver. Every classification below is measured, not
 * asserted: the script asks `resolveIngredient` and reports what came back.
 *
 * WHAT IT IS NOT. Not a launch holdout. It may be read, edited and optimised
 * against while the catalogue is built, which is exactly what disqualifies it
 * as validation — see §3b. It is a DISCOVERY set: its job is to find gaps, and
 * a gap it finds today stops being evidence tomorrow. Real-user validation is
 * a separate thing this does not replace.
 *
 *     npm run audit:coverage
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { INGREDIENT_CATALOGUE } from '../src/features/ingredients/catalogue.ts';
import { resolveIngredient } from '../src/features/ingredients/matching.ts';
import { normaliseIngredientName } from '../src/features/ingredients/normalise.ts';

/** How a concept relates to the catalogue. */
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

type Row = {
  concept: string;
  category: string;
  terms: string[];
  manual: string;
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

const censusPath = resolve(import.meta.dirname, '..', 'data', 'census', 'egyptian-coverage.csv');
const rows: Row[] = parseCsv(readFileSync(censusPath, 'utf8')).map((record) => ({
  concept: record.concept ?? '',
  category: record.category ?? '',
  terms: (record.terms ?? '')
    .split('|')
    .map((term) => term.trim())
    .filter((term) => term.length > 0),
  manual: record.verdict ?? '',
  priority: record.priority ?? '',
}));

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

type Scored = Row & { verdict: Verdict; slugs: string[] };

function score(row: Row): Scored {
  const hits = row.terms
    .map((term) => ({ term, ingredient: resolveIngredient(term) }))
    .filter((hit): hit is { term: string; ingredient: NonNullable<typeof hit.ingredient> } =>
      Boolean(hit.ingredient),
    );
  const slugs = [...new Set(hits.map((hit) => hit.ingredient.slug))];

  // A judgement no probe can make wins over what the resolver happens to do.
  // `form` and `dish` in particular are usually REACHABLE — a frozen okra
  // resolves to okra, which is the correct outcome and not a gap.
  if (MANUAL.has(row.manual as Verdict)) {
    return { ...row, verdict: row.manual as Verdict, slugs };
  }

  if (slugs.length === 0) return { ...row, verdict: 'missing', slugs };
  if (slugs.length > 1) return { ...row, verdict: 'ambiguous', slugs };

  const slug = slugs[0] ?? '';
  const own = OWN_NAMES.get(slug) ?? new Set<string>();
  const byOwnName = hits.some((hit) => own.has(normaliseIngredientName(hit.term)));
  return { ...row, verdict: byOwnName ? 'represented' : 'alias', slugs };
}

/**
 * One concept, one row.
 *
 * The first draft of this census listed `pesto` under sauces AND under
 * international, `labneh` under cheese AND dairy, `hibiscus` three times. That
 * inflated the count by 41 without discovering anything, which is precisely
 * the flattering number the census is supposed to avoid. Keyed on the first
 * term, because that is the one a concept is actually identified by.
 */
const byKey = new Map<string, string[]>();
for (const row of rows) {
  const key = normaliseIngredientName(row.terms[0] ?? row.concept);
  byKey.set(key, [...(byKey.get(key) ?? []), `${row.concept} [${row.category}]`]);
}
const duplicates = [...byKey.entries()].filter(([, entries]) => entries.length > 1);

if (duplicates.length > 0) {
  console.error('The census lists the same concept more than once:');
  for (const [key, entries] of duplicates) console.error(`  ${key}: ${entries.join(' | ')}`);
  process.exit(1);
}

const scored = rows.map(score);
const countOf = (verdict: Verdict) => scored.filter((row) => row.verdict === verdict).length;

const TOTAL = scored.length;
/**
 * "Honestly represented" is represented + alias, and NOT the others.
 *
 * An alias counts because a cook who types `قشطة` and gets clotted cream has
 * been served correctly — a row of its own would add nothing. A `form` or a
 * `dish` is excluded from the numerator on purpose even though it resolves:
 * counting them would let the score be inflated by deciding that more things
 * are forms.
 */
const honest = countOf('represented') + countOf('alias');
const pct = (value: number) => `${Math.round((value / TOTAL) * 1000) / 10}%`;

/**
 * Concepts the catalogue is actually ON THE HOOK for.
 *
 * A dish, a form and a brand are correctly NOT rows, so counting them against
 * coverage would mean the score falls every time the ontology is applied
 * properly. They stay in the census — knowing that `frozen okra` resolves to
 * okra is worth recording — but the honest denominator for "can a cook name
 * what is in the kitchen?" excludes them.
 */
const actionable =
  countOf('represented') + countOf('alias') + countOf('missing') + countOf('ambiguous');
const actionablePct = (value: number) =>
  `${Math.round((value / Math.max(actionable, 1)) * 1000) / 10}%`;

const categories = [...new Set(scored.map((row) => row.category))].sort();

const lines: string[] = [
  '# Egyptian kitchen coverage census',
  '',
  '**Generated by `npm run audit:coverage`. Do not edit by hand — edit',
  '`data/census/egyptian-coverage.csv`.**',
  '',
  'A list of concepts a real Egyptian kitchen deals in, written without',
  'reference to what the catalogue contains, then run against the live',
  'resolver. Every verdict below is measured.',
  '',
  '**This is a discovery set, not a launch holdout.** It may be read and',
  'optimised against while the catalogue is built, which is exactly what',
  'disqualifies it as validation. It does not replace real-user testing.',
  '',
  '| | | |',
  '|---|---:|---:|',
  `| **Concepts in the census** | **${TOTAL}** | |`,
  `| Represented by their own row | ${countOf('represented')} | ${pct(countOf('represented'))} |`,
  `| Reachable through an alias | ${countOf('alias')} | ${pct(countOf('alias'))} |`,
  `| **Honestly represented** | **${honest}** | **${pct(honest)}** |`,
  `| Missing | ${countOf('missing')} | ${pct(countOf('missing'))} |`,
  `| Ambiguous | ${countOf('ambiguous')} | ${pct(countOf('ambiguous'))} |`,
  `| Rejected — dish | ${countOf('dish')} | ${pct(countOf('dish'))} |`,
  `| Rejected — form | ${countOf('form')} | ${pct(countOf('form'))} |`,
  `| Rejected — brand | ${countOf('brand')} | ${pct(countOf('brand'))} |`,
  '',
  `**Of the ${actionable} concepts that should have coverage** — the census minus`,
  'the dishes, forms and brands, which are correctly not rows —',
  `**${honest} are honestly represented (${actionablePct(honest)})**, ` +
    `${countOf('missing')} are missing (${actionablePct(countOf('missing'))}) and ` +
    `${countOf('ambiguous')} are ambiguous.`,
  '',
  `Catalogue: **${INGREDIENT_CATALOGUE.length} canonical ingredients**, ` +
    `**${INGREDIENT_CATALOGUE.reduce((sum, item) => sum + item.aliases.length, 0)} aliases**.`,
  '',
  '## By category',
  '',
  '| Category | Concepts | Represented | Alias | Missing | Ambiguous | Honest of actionable |',
  '|---|---:|---:|---:|---:|---:|---:|',
];

for (const category of categories) {
  const inCategory = scored.filter((row) => row.category === category);
  const at = (verdict: Verdict) => inCategory.filter((row) => row.verdict === verdict).length;
  const honestHere = at('represented') + at('alias');
  const actionableHere = honestHere + at('missing') + at('ambiguous');
  const share = actionableHere > 0 ? Math.round((honestHere / actionableHere) * 100) : 100;
  lines.push(
    `| ${category} | ${inCategory.length} | ${at('represented')} | ${at('alias')} | ` +
      `${at('missing')} | ${at('ambiguous')} | ${share}% |`,
  );
}

lines.push('', '## Missing, by priority', '');

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
  lines.push('## Ambiguous — a word that names more than one food', '');
  lines.push('| Concept | Category | Resolves to |', '|---|---|---|');
  for (const row of ambiguous) {
    lines.push(`| ${row.concept} | ${row.category} | ${row.slugs.join(', ') || '—'} |`);
  }
  lines.push('');
}

writeFileSync(resolve(import.meta.dirname, '..', 'COVERAGE_CENSUS.md'), lines.join('\n'));
console.log(
  `${TOTAL} concepts: ${honest} honestly represented (${pct(honest)}), ` +
    `${countOf('missing')} missing, ${countOf('ambiguous')} ambiguous.`,
);
