/**
 * Turns the ingredient sheet into the app's recognition catalogue.
 *
 *     npm run ingredients:import              # CSV -> generated TS
 *     npm run ingredients:import -- --check   # verify the generated file is current
 *
 * The catalogue is what lets the app understand "طماطم", "tomatos" and "roma
 * tomatoes" as one thing. It is data, not logic: adding a food should be a row
 * in data/ingredients/catalogue.csv, never a branch in a matcher.
 *
 * Validation is strict because a bad row is silent at runtime — a duplicate
 * alias would quietly bind a word to whichever entry happened to load first.
 * Unknown categories, units, allergens, duplicate slugs, duplicate aliases and
 * aliases that collide with another ingredient's canonical name all fail here.
 *
 * Prices are deliberately NOT part of this file. See scripts/import-prices.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normaliseIngredientName } from '../src/features/ingredients/normalise.ts';
import { ALLERGENS, INGREDIENT_CATEGORIES, UNITS } from '../src/types/domain.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'data/ingredients/catalogue.csv');
const OUTPUT = join(ROOT, 'src/features/ingredients/catalogue.generated.ts');

const COLUMNS = [
  'slug',
  'name',
  'name_ar',
  'category',
  'default_unit',
  'grams_per_piece',
  'allergens',
  'aliases',
  'staple',
  'perishable',
] as const;

type Entry = {
  slug: string;
  name: string;
  nameAr: string;
  category: string;
  defaultUnit: string;
  gramsPerPiece: number | null;
  allergens: string[];
  aliases: string[];
  isCommonStaple: boolean;
  isPerishable: boolean;
};

class ImportError extends Error {}

/** Minimal RFC4180 reader: quoted fields, doubled quotes, no embedded newlines. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

function parse(text: string): Entry[] {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !line.startsWith('#'));

  const header = lines.shift();
  if (!header) throw new ImportError('The ingredient file is empty.');

  const columns = splitCsvLine(header);
  for (const [index, expected] of COLUMNS.entries()) {
    if (columns[index] !== expected) {
      throw new ImportError(
        `Column ${index + 1} should be "${expected}" but is "${columns[index] ?? '(missing)'}".`,
      );
    }
  }

  const entries: Entry[] = [];
  const slugs = new Set<string>();
  // Every string that must resolve to exactly one ingredient.
  const claimedTerms = new Map<string, string>();

  lines.forEach((line, offset) => {
    const lineNumber = offset + 2;
    const fail = (message: string): never => {
      throw new ImportError(`data/ingredients/catalogue.csv:${lineNumber} — ${message}`);
    };

    const cells = splitCsvLine(line);
    if (cells.length !== COLUMNS.length) {
      fail(`expected ${COLUMNS.length} columns, found ${cells.length}`);
    }

    const [
      slug,
      name,
      nameAr,
      category,
      defaultUnit,
      gramsText,
      allergenText,
      aliasText,
      stapleText,
      perishableText,
    ] = cells as [string, string, string, string, string, string, string, string, string, string];

    if (!/^[a-z0-9-]+$/.test(slug)) fail(`slug "${slug}" must be lowercase letters, digits and dashes`);
    if (slugs.has(slug)) fail(`duplicate slug "${slug}"`);
    slugs.add(slug);

    if (!name) fail('name is required');
    if (!(INGREDIENT_CATEGORIES as readonly string[]).includes(category)) {
      fail(`"${category}" is not a known category`);
    }
    if (!(UNITS as readonly string[]).includes(defaultUnit)) {
      fail(`"${defaultUnit}" is not a known unit`);
    }

    let gramsPerPiece: number | null = null;
    if (gramsText !== '') {
      const value = Number(gramsText);
      if (!Number.isFinite(value) || value <= 0) fail(`grams_per_piece "${gramsText}" is invalid`);
      gramsPerPiece = value;
    }

    const allergens = allergenText ? allergenText.split('|').map((a) => a.trim()).filter(Boolean) : [];
    for (const allergen of allergens) {
      if (!(ALLERGENS as readonly string[]).includes(allergen)) {
        fail(`"${allergen}" is not a known allergen`);
      }
    }

    const aliases = aliasText
      ? [...new Set(aliasText.split('|').map((a) => a.trim().toLowerCase()).filter(Boolean))]
      : [];

    // A term that maps to two ingredients is a silent bug: whichever entry the
    // matcher reaches first wins, and the other food becomes unrecognisable.
    //
    // Comparison happens on the NORMALISED term, because that is the key the
    // matcher actually indexes. Raw-string comparison missed a real case: the
    // alias "whole rice" normalises to "rice" — "whole" is a noise word — so
    // brown rice quietly took over the word "rice" and every rice recipe lost
    // its price.
    for (const term of [name, ...aliases]) {
      const key = normaliseIngredientName(term);
      if (!key) continue;
      const owner = claimedTerms.get(key);
      if (owner && owner !== slug) {
        fail(
          `"${term}" normalises to "${key}", which is already claimed by "${owner}"` +
            (key === term.toLowerCase() ? '' : ' — normalisation drops words like "whole" and "fresh"'),
        );
      }
      claimedTerms.set(key, slug);
    }

    entries.push({
      slug,
      name,
      nameAr,
      category,
      defaultUnit,
      gramsPerPiece,
      allergens,
      aliases,
      isCommonStaple: stapleText === '1',
      isPerishable: perishableText === '1',
    });
  });

  return entries.sort((a, b) => a.slug.localeCompare(b.slug));
}

function render(entries: readonly Entry[]): string {
  const list = (values: readonly string[]) =>
    values.length === 0 ? '[]' : `[${values.map((v) => `'${v.replace(/'/g, "\\'")}'`).join(', ')}]`;

  const body = entries
    .map(
      (entry) =>
        `  {\n` +
        `    slug: '${entry.slug}',\n` +
        `    name: '${entry.name.replace(/'/g, "\\'")}',\n` +
        `    nameAr: '${entry.nameAr.replace(/'/g, "\\'")}',\n` +
        `    category: '${entry.category}',\n` +
        `    defaultUnit: '${entry.defaultUnit}',\n` +
        `    gramsPerPiece: ${entry.gramsPerPiece ?? 'null'},\n` +
        `    allergens: ${list(entry.allergens)},\n` +
        `    aliases: ${list(entry.aliases)},\n` +
        `    isCommonStaple: ${entry.isCommonStaple},\n` +
        `    isPerishable: ${entry.isPerishable},\n` +
        `  },`,
    )
    .join('\n');

  return `// GENERATED FILE — do not edit.
//
// Source: data/ingredients/catalogue.csv
// Regenerate: npm run ingredients:import
//
// Recognition data only: canonical name, Arabic name, aliases, category,
// default unit. Prices live in src/features/pricing/price-data.ts, because an
// ingredient the app can recognise does not have to be one it can price.
import type { CatalogueIngredient } from './catalogue.ts';

export const GENERATED_INGREDIENTS: readonly CatalogueIngredient[] = [
${body}
];
`;
}

function main(): void {
  const checkOnly = process.argv.includes('--check');

  let entries: Entry[];
  try {
    entries = parse(readFileSync(SOURCE, 'utf8'));
  } catch (error) {
    if (error instanceof ImportError) {
      console.error(`Ingredient import failed.\n  ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const rendered = render(entries);

  if (checkOnly) {
    let current = '';
    try {
      current = readFileSync(OUTPUT, 'utf8');
    } catch {
      current = '';
    }
    if (current !== rendered) {
      console.error(
        'The generated catalogue is out of date with data/ingredients/catalogue.csv.\n' +
          'Run `npm run ingredients:import` and commit the result.',
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Catalogue is current (${entries.length} ingredients).`);
    return;
  }

  writeFileSync(OUTPUT, rendered);
  const aliasCount = entries.reduce((sum, entry) => sum + entry.aliases.length, 0);
  console.log(
    `Imported ${entries.length} ingredients with ${aliasCount} aliases into ` +
      'src/features/ingredients/catalogue.generated.ts',
  );
}

main();
