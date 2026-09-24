/**
 * Turns the demo merchant catalogue into bundled TypeScript.
 *
 *     npm run commerce:demo              # CSV -> generated TS
 *     npm run commerce:demo -- --check   # verify the generated file is current
 *
 * THE CATALOGUE IN `data/commerce-demo/` IS NOT A SUPERMARKET. It exists so
 * the ordering flow can be built end to end before a partner catalogue does.
 * See that folder's README.
 *
 * Validation is strict for the same reason the ingredient importer's is: a bad
 * row here is silent at runtime and expensive in the basket. Unknown units,
 * unknown allergens, a mapping pointing at a product that does not exist, and
 * — the important one — a mapping pointing at an ingredient the canonical
 * catalogue has never heard of, all fail here.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INGREDIENT_CATALOGUE } from '../src/features/ingredients/catalogue.ts';
import { PRODUCT_DIETS } from '../src/types/commerce.ts';
import { ALLERGENS, UNITS } from '../src/types/domain.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(ROOT, 'data/commerce-demo');
const OUTPUT = join(ROOT, 'src/features/commerce/demo-catalogue.generated.ts');

const AVAILABILITY = ['in_stock', 'low_stock', 'out_of_stock', 'unknown'] as const;
const MAPPING_SOURCES = ['manual', 'sku_exact', 'name_match', 'category_fallback'] as const;

class ImportError extends Error {}

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

function rows(file: string, expected: readonly string[]): string[][] {
  const lines = readFileSync(join(SOURCE_DIR, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !line.startsWith('#'));

  const header = lines.shift();
  if (!header) throw new ImportError(`${file} is empty.`);

  const columns = splitCsvLine(header);
  for (const [index, name] of expected.entries()) {
    if (columns[index] !== name) {
      throw new ImportError(
        `${file} column ${index + 1} should be "${name}" but is "${columns[index] ?? '(missing)'}".`,
      );
    }
  }

  return lines.map((line, offset) => {
    const cells = splitCsvLine(line);
    if (cells.length !== expected.length) {
      throw new ImportError(
        `${file}:${offset + 2} — expected ${expected.length} columns, found ${cells.length}`,
      );
    }
    return cells;
  });
}

type DemoProduct = {
  externalId: string;
  sku: string | null;
  name: string;
  nameAr: string | null;
  brand: string | null;
  packQuantity: number | null;
  packUnit: string | null;
  priceMinor: number;
  availability: string;
  /** null when the merchant publishes no allergen data. Not the same as []. */
  allergens: string[] | null;
  /** null when the merchant publishes no dietary data at all. */
  diets: Record<string, string> | null;
  isActive: boolean;
};

type DemoMapping = {
  ingredientSlug: string;
  productExternalId: string;
  source: string;
  confidence: number;
  isVerified: boolean;
  isBlocked: boolean;
};

const PRODUCT_COLUMNS = [
  'external_id', 'sku', 'name', 'name_ar', 'brand', 'pack_quantity',
  'pack_unit', 'price_minor', 'availability', 'allergens', 'diets', 'is_active',
] as const;

const MAPPING_COLUMNS = [
  'ingredient_slug', 'product_external_id', 'source', 'confidence', 'verified', 'blocked',
] as const;

function parseProducts(): DemoProduct[] {
  const seen = new Set<string>();

  return rows('products.csv', PRODUCT_COLUMNS).map((cells, offset) => {
    const at = `products.csv:${offset + 2}`;
    const [
      externalId, sku, name, nameAr, brand, packQuantity,
      packUnit, priceMinor, availability, allergens, diets, isActive,
    ] = cells as [
      string, string, string, string, string, string,
      string, string, string, string, string, string,
    ];

    if (!/^[a-z0-9-]+$/.test(externalId)) throw new ImportError(`${at} — bad external_id "${externalId}"`);
    if (seen.has(externalId)) throw new ImportError(`${at} — duplicate external_id "${externalId}"`);
    seen.add(externalId);

    if (!name) throw new ImportError(`${at} — name is required`);

    if (packUnit && !(UNITS as readonly string[]).includes(packUnit)) {
      throw new ImportError(`${at} — "${packUnit}" is not a known unit`);
    }
    if (!(AVAILABILITY as readonly string[]).includes(availability)) {
      throw new ImportError(`${at} — "${availability}" is not a known availability`);
    }

    // AN EMPTY CELL IS REFUSED. "The merchant says this contains no allergens"
    // and "nobody has told us what this contains" are different facts with
    // different consequences for an allergic customer, and a blank cell cannot
    // say which one it means. `none` and `unknown` both have to be typed.
    if (allergens === '') {
      throw new ImportError(
        `${at} — allergens is empty. Write "none" when the merchant declares ` +
          'none, or "unknown" when they publish no allergen data. A blank cell ' +
          'cannot tell those apart, and treating unknown as none is how an ' +
          'allergic customer gets served.',
      );
    }

    const parsedAllergens =
      allergens === 'unknown'
        ? null
        : allergens === 'none'
          ? []
          : allergens.split('|').map((a) => a.trim()).filter(Boolean);

    for (const allergen of parsedAllergens ?? []) {
      if (!(ALLERGENS as readonly string[]).includes(allergen)) {
        throw new ImportError(`${at} — "${allergen}" is not a known allergen`);
      }
    }

    /*
      THE SAME DISCIPLINE AS ALLERGENS, for the same reason.

      A blank cell is refused. `unknown` means the merchant publishes no
      dietary data, which is the common case in a real catalogue and must be
      easy to state honestly. `none` is refused outright: it reads as "no
      dietary restrictions apply", which is precisely the misreading that
      would turn an unlabelled product into a safe one.
    */
    if (diets === '') {
      throw new ImportError(
        `${at} — diets is empty. Write "unknown" when the merchant publishes ` +
          'no dietary data, or a list like ' +
          '"vegan:incompatible|halal:compatible". A blank cell cannot say ' +
          'which, and treating unknown as compatible is how a vegan is sold ' +
          'something that is not.',
      );
    }
    if (diets === 'none') {
      throw new ImportError(
        `${at} — "none" is not a dietary verdict. It reads as "no diets ` +
          'apply", which is the one thing this column must never be able to ' +
          'mean. Use "unknown", or name each diet explicitly.',
      );
    }

    let parsedDiets: Record<string, string> | null = null;
    if (diets !== 'unknown') {
      parsedDiets = {};
      for (const entry of diets.split('|').map((part) => part.trim()).filter(Boolean)) {
        const [diet, verdict] = entry.split(':').map((part) => part.trim());
        if (!diet || !verdict) {
          throw new ImportError(`${at} — "${entry}" is not "diet:compatible|incompatible"`);
        }
        if (!(PRODUCT_DIETS as readonly string[]).includes(diet)) {
          throw new ImportError(`${at} — "${diet}" is not a known diet`);
        }
        if (verdict !== 'compatible' && verdict !== 'incompatible') {
          throw new ImportError(
            `${at} — "${verdict}" is not a verdict. Write compatible or incompatible; ` +
              'leave the diet out entirely to mean the merchant did not say.',
          );
        }
        if (parsedDiets[diet] !== undefined) {
          throw new ImportError(`${at} — "${diet}" appears twice`);
        }
        parsedDiets[diet] = verdict;
      }
      if (Object.keys(parsedDiets).length === 0) {
        throw new ImportError(`${at} — diets lists no verdicts. Write "unknown" instead.`);
      }
    }

    const price = Number(priceMinor);
    if (!Number.isInteger(price) || price < 0) {
      throw new ImportError(`${at} — price_minor "${priceMinor}" must be a non-negative integer`);
    }

    const pack = packQuantity === '' ? null : Number(packQuantity);
    if (pack !== null && (!Number.isFinite(pack) || pack <= 0)) {
      throw new ImportError(`${at} — pack_quantity "${packQuantity}" is invalid`);
    }
    if ((pack === null) !== (packUnit === '')) {
      throw new ImportError(`${at} — pack_quantity and pack_unit must both be set or both empty`);
    }

    return {
      externalId,
      sku: sku || null,
      name,
      nameAr: nameAr || null,
      brand: brand || null,
      packQuantity: pack,
      packUnit: packUnit || null,
      priceMinor: price,
      availability,
      allergens: parsedAllergens,
      diets: parsedDiets,
      isActive: isActive === '1',
    };
  });
}

function parseMappings(products: readonly DemoProduct[]): DemoMapping[] {
  const productIds = new Set(products.map((p) => p.externalId));
  const canonicalSlugs = new Set(INGREDIENT_CATALOGUE.map((entry) => entry.slug));
  const seen = new Set<string>();

  return rows('mappings.csv', MAPPING_COLUMNS).map((cells, offset) => {
    const at = `mappings.csv:${offset + 2}`;
    const [ingredientSlug, productExternalId, source, confidence, verified, blocked] =
      cells as [string, string, string, string, string, string];

    // THE IMPORTANT ONE. A mapping may only reference an ingredient the
    // canonical catalogue already knows. Without this, the demo catalogue
    // could quietly introduce food concepts that no recipe, pantry or matcher
    // has ever heard of — which is exactly the leak this folder exists to
    // prevent.
    if (!canonicalSlugs.has(ingredientSlug)) {
      throw new ImportError(
        `${at} — "${ingredientSlug}" is not a canonical ingredient. A merchant ` +
          'mapping cannot invent one; add the row to data/ingredients/catalogue.csv first.',
      );
    }
    if (!productIds.has(productExternalId)) {
      throw new ImportError(`${at} — no product with external_id "${productExternalId}"`);
    }

    const key = `${ingredientSlug}::${productExternalId}`;
    if (seen.has(key)) throw new ImportError(`${at} — duplicate mapping ${key}`);
    seen.add(key);

    if (!(MAPPING_SOURCES as readonly string[]).includes(source)) {
      throw new ImportError(`${at} — "${source}" is not a known mapping source`);
    }

    const score = Number(confidence);
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      throw new ImportError(`${at} — confidence "${confidence}" must be between 0 and 1`);
    }

    const isBlocked = blocked === '1';
    const isVerified = verified === '1';
    if (isVerified && isBlocked) {
      throw new ImportError(`${at} — a mapping cannot be both verified and blocked`);
    }

    return { ingredientSlug, productExternalId, source, confidence: score, isVerified, isBlocked };
  });
}

function literal(value: string | null): string {
  return value === null ? 'null' : `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function render(
  merchantFile: string,
  products: readonly DemoProduct[],
  mappings: readonly DemoMapping[],
): string {
  const config = JSON.parse(merchantFile) as {
    merchant: Record<string, unknown>;
    location: Record<string, unknown>;
  };

  const productLines = products
    .map(
      (p) =>
        `  {\n` +
        `    externalId: ${literal(p.externalId)},\n` +
        `    sku: ${literal(p.sku)},\n` +
        `    name: ${literal(p.name)},\n` +
        `    nameAr: ${literal(p.nameAr)},\n` +
        `    brand: ${literal(p.brand)},\n` +
        `    packQuantity: ${p.packQuantity ?? 'null'},\n` +
        `    packUnit: ${literal(p.packUnit)},\n` +
        `    priceMinor: ${p.priceMinor},\n` +
        `    availability: '${p.availability}',\n` +
        `    allergens: ${p.allergens === null ? 'null' : `[${p.allergens.map((a) => `'${a}'`).join(', ')}]`},\n` +
        `    diets: ${
          p.diets === null
            ? 'null'
            : `{ ${Object.entries(p.diets)
                .map(([diet, verdict]) => `${diet}: '${verdict}'`)
                .join(', ')} }`
        },\n` +
        `    isActive: ${p.isActive},\n` +
        `  },`,
    )
    .join('\n');

  const mappingLines = mappings
    .map(
      (m) =>
        `  {\n` +
        `    ingredientSlug: ${literal(m.ingredientSlug)},\n` +
        `    productExternalId: ${literal(m.productExternalId)},\n` +
        `    source: '${m.source}',\n` +
        `    confidence: ${m.confidence},\n` +
        `    isVerified: ${m.isVerified},\n` +
        `    isBlocked: ${m.isBlocked},\n` +
        `  },`,
    )
    .join('\n');

  return `// GENERATED FILE — do not edit.
//
// Source: data/commerce-demo/
// Regenerate: npm run commerce:demo
//
// A DEVELOPMENT CATALOGUE, NOT A SUPERMARKET. No company named here exists,
// no commercial agreement stands behind it, and no price is real. The merchant
// is flagged \`isDemo\` and is never enabled, so nothing can mistake it for a
// partner by reading the data.
import type { Allergen, Availability, Unit } from '@/types/domain';
import type { MappingSource, ProductDietaryProfile } from '@/types/commerce';

export type DemoProductRow = {
  readonly externalId: string;
  readonly sku: string | null;
  readonly name: string;
  readonly nameAr: string | null;
  readonly brand: string | null;
  readonly packQuantity: number | null;
  readonly packUnit: Unit | null;
  readonly priceMinor: number;
  readonly availability: Availability;
  /**
   * NULL MEANS THE MERCHANT PUBLISHES NO ALLERGEN DATA, which is not the same
   * as an empty array. Empty is a declaration of none; null is an absence of
   * one, and the sourcing engine refuses to auto-select a null for a customer
   * with allergies rather than assuming it is safe.
   */
  readonly allergens: readonly Allergen[] | null;
  /**
   * NULL MEANS THE MERCHANT PUBLISHES NO DIETARY DATA. A diet missing from a
   * non-null map means they publish some and said nothing about that one.
   * Both are UNKNOWN, and unknown is never compatible: see dietVerdict in
   * features/commerce/sourcing.ts.
   */
  readonly diets: ProductDietaryProfile | null;
  readonly isActive: boolean;
};

export type DemoMappingRow = {
  readonly ingredientSlug: string;
  readonly productExternalId: string;
  readonly source: MappingSource;
  readonly confidence: number;
  readonly isVerified: boolean;
  readonly isBlocked: boolean;
};

export const DEMO_MERCHANT = ${JSON.stringify(config.merchant, null, 2).replace(/\n/g, '\n')} as const;

export const DEMO_LOCATION = ${JSON.stringify(config.location, null, 2).replace(/\n/g, '\n')} as const;

export const DEMO_PRODUCTS: readonly DemoProductRow[] = [
${productLines}
];

export const DEMO_MAPPINGS: readonly DemoMappingRow[] = [
${mappingLines}
];
`;
}

function main(): void {
  const checkOnly = process.argv.includes('--check');

  let rendered: string;
  let products: DemoProduct[];
  let mappings: DemoMapping[];
  try {
    products = parseProducts();
    mappings = parseMappings(products);
    rendered = render(readFileSync(join(SOURCE_DIR, 'merchant.json'), 'utf8'), products, mappings);
  } catch (error) {
    if (error instanceof ImportError) {
      console.error(`Demo catalogue import failed.\n  ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  if (checkOnly) {
    let current = '';
    try {
      current = readFileSync(OUTPUT, 'utf8');
    } catch {
      current = '';
    }
    if (current !== rendered) {
      console.error(
        'The generated demo catalogue is out of date with data/commerce-demo/.\n' +
          'Run `npm run commerce:demo` and commit the result.',
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Demo catalogue is current (${products.length} products, ${mappings.length} mappings).`);
    return;
  }

  writeFileSync(OUTPUT, rendered);
  console.log(
    `Demo catalogue written: ${products.length} products, ${mappings.length} mappings ` +
      `across ${new Set(mappings.map((m) => m.ingredientSlug)).size} canonical ingredients.`,
  );
}

main();
