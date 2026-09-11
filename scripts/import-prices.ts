/**
 * Turns a price survey into validated application data.
 *
 *     npm run prices:import                 # data/prices/eg.csv -> generated TS
 *     npm run prices:import -- --check      # verify the generated file is current
 *
 * Refreshing Egyptian prices should be an edit to a spreadsheet and a rerun of
 * this script, never a hand-edit of application logic. Everything the app reads
 * at runtime is generated here, so there is one source of truth and CI can tell
 * when it has drifted.
 *
 * The importer refuses bad data rather than importing it: an unknown slug, a
 * low above an average, a non-positive amount or an unrecognised unit all fail
 * the run. A missing price is a legitimate state — the app renders "estimate
 * unavailable" — so the one thing this will never do is invent a figure to fill
 * a gap.
 *
 * Implementation note: executed with Node's type-stripping loader, which is why
 * the catalogue import is `import type`-safe and no runtime deps are used.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INGREDIENT_CATALOGUE } from '../src/features/ingredients/catalogue.ts';
import { UNITS } from '../src/types/domain.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'data/prices/eg.csv');
const OUTPUT = join(ROOT, 'src/features/pricing/price-data.ts');

const COLUMNS = ['slug', 'unit', 'quantity', 'low_minor', 'avg_minor', 'high_minor'] as const;

type Row = {
  slug: string;
  unit: string;
  quantity: number;
  lowMinor: number;
  avgMinor: number;
  highMinor: number;
};

class ImportError extends Error {}

function parseCsv(text: string): Row[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const header = lines.shift();
  if (!header) throw new ImportError('The price file is empty.');

  const columns = header.split(',').map((column) => column.trim());
  for (const [index, expected] of COLUMNS.entries()) {
    if (columns[index] !== expected) {
      throw new ImportError(
        `Column ${index + 1} should be "${expected}" but is "${columns[index] ?? '(missing)'}". ` +
          `Expected header: ${COLUMNS.join(',')}`,
      );
    }
  }

  const knownSlugs = new Set(INGREDIENT_CATALOGUE.map((item) => item.slug));
  const seen = new Set<string>();
  const rows: Row[] = [];

  lines.forEach((line, offset) => {
    const lineNumber = offset + 2; // 1-based, and the header took line 1.
    const cells = line.split(',').map((cell) => cell.trim());
    const fail = (message: string): never => {
      throw new ImportError(`${SOURCE}:${lineNumber} — ${message}`);
    };

    if (cells.length !== COLUMNS.length) {
      fail(`expected ${COLUMNS.length} columns, found ${cells.length}`);
    }

    const [slug, unit, quantityText, lowText, avgText, highText] = cells as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];

    // An unknown slug means the survey and the catalogue disagree. Silently
    // dropping it would quietly remove a price nobody meant to remove.
    if (!knownSlugs.has(slug)) fail(`"${slug}" is not an ingredient slug in the catalogue`);
    if (seen.has(slug)) fail(`"${slug}" appears more than once`);
    seen.add(slug);

    if (!(UNITS as readonly string[]).includes(unit)) fail(`"${unit}" is not a known unit`);

    const numbers = { quantity: quantityText, low: lowText, avg: avgText, high: highText };
    const parsed: Record<string, number> = {};
    for (const [field, text] of Object.entries(numbers)) {
      const value = Number(text);
      if (!Number.isFinite(value)) fail(`${field} "${text}" is not a number`);
      if (value <= 0) fail(`${field} must be greater than zero, found ${value}`);
      if (field !== 'quantity' && !Number.isInteger(value)) {
        fail(`${field} must be a whole number of minor units, found ${value}`);
      }
      parsed[field] = value;
    }

    const { quantity, low, avg, high } = parsed as {
      quantity: number;
      low: number;
      avg: number;
      high: number;
    };

    // A band that does not contain its own average is a data-entry slip, and
    // it would widen or narrow every estimate built on it.
    if (low > avg) fail(`low (${low}) is above the average (${avg})`);
    if (avg > high) fail(`average (${avg}) is above the high (${high})`);

    rows.push({ slug, unit, quantity, lowMinor: low, avgMinor: avg, highMinor: high });
  });

  return rows.sort((a, b) => a.slug.localeCompare(b.slug));
}

function render(rows: readonly Row[], surveyDate: string): string {
  const entries = rows
    .map(
      (row) =>
        `  '${row.slug}': {\n` +
        `    unit: '${row.unit}',\n` +
        `    quantity: ${row.quantity},\n` +
        `    lowMinor: ${row.lowMinor},\n` +
        `    avgMinor: ${row.avgMinor},\n` +
        `    highMinor: ${row.highMinor},\n` +
        `  },`,
    )
    .join('\n');

  return `// GENERATED FILE — do not edit.
//
// Source: data/prices/eg.csv
// Regenerate: npm run prices:import
//
// Egyptian retail price estimates in piastres. These are survey figures, not
// live store prices: everything rendered from them is labelled an estimate, and
// an ingredient absent from this table has no price rather than a guessed one.
import type { Unit } from '@/types/domain';

export type PriceRow = {
  unit: Unit;
  quantity: number;
  lowMinor: number;
  avgMinor: number;
  highMinor: number;
};

/** ISO date the survey behind these figures was taken. */
export const PRICE_DATA_DATE = '${surveyDate}';

/** Keyed by ingredient slug. Absence means "no price", never "free". */
export const PRICE_DATA: Readonly<Record<string, PriceRow>> = {
${entries}
};
`;
}

function main(): void {
  const checkOnly = process.argv.includes('--check');
  const dateArg = process.argv.find((arg) => arg.startsWith('--date='));

  let rows: Row[];
  try {
    rows = parseCsv(readFileSync(SOURCE, 'utf8'));
  } catch (error) {
    if (error instanceof ImportError) {
      console.error(`Price import failed.\n  ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  // Keep the existing survey date unless one is passed, so a re-import that
  // only fixes a typo does not claim the data is newer than it is.
  const existing = (() => {
    try {
      return readFileSync(OUTPUT, 'utf8').match(/PRICE_DATA_DATE = '([^']+)'/)?.[1] ?? null;
    } catch {
      return null;
    }
  })();
  const surveyDate = dateArg
    ? dateArg.slice('--date='.length)
    : (existing ?? new Date().toISOString().slice(0, 10));

  const rendered = render(rows, surveyDate);

  if (checkOnly) {
    const current = (() => {
      try {
        return readFileSync(OUTPUT, 'utf8');
      } catch {
        return '';
      }
    })();
    if (current !== rendered) {
      console.error(
        'Price data is out of date with data/prices/eg.csv.\n' +
          'Run `npm run prices:import` and commit the result.',
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Price data is current (${rows.length} ingredients, surveyed ${surveyDate}).`);
    return;
  }

  writeFileSync(OUTPUT, rendered);
  const uncovered = INGREDIENT_CATALOGUE.length - rows.length;
  console.log(
    `Imported ${rows.length} prices (surveyed ${surveyDate}) into src/features/pricing/price-data.ts`,
  );
  if (uncovered > 0) {
    console.log(
      `${uncovered} catalogue ingredients have no price. That is allowed: the app shows ` +
        '"estimate unavailable" rather than inventing one.',
    );
  }
}

main();
