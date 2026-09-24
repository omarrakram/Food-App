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
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_DELIVERY_AREAS } from '../src/features/commerce/delivery-areas.ts';
import { INGREDIENT_CATALOGUE } from '../src/features/ingredients/catalogue.ts';
import { PRODUCT_DIETS } from '../src/types/commerce.ts';
import { ALLERGENS, UNITS } from '../src/types/domain.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(ROOT, 'data/commerce-demo');
const OUTPUT = join(ROOT, 'src/features/commerce/demo-catalogue.generated.ts');
const SQL_OUTPUT = join(ROOT, 'supabase/fixtures/commerce-demo.generated.sql');

/**
 * A STABLE UUID FOR A DEMO ROW, derived from its name.
 *
 * The demo catalogue used to identify itself with readable strings —
 * `demo-merchant`, `dm-chk-500` — which is pleasant to read and made the whole
 * fixture unusable against the real schema, where every one of those columns
 * is a `uuid`. A signed-in customer could therefore never put a demo product
 * in their (Supabase) cart, so the checkout RPC could not be exercised by the
 * app at all. That gap is the reason this exists.
 *
 * Derived rather than random so the SAME id appears in the bundled TypeScript
 * and in the SQL fixture, run after run, machine after machine. An md5 laid
 * out in the 8-4-4-4-12 shape is a valid uuid literal to Postgres; it is not a
 * v4 and makes no claim to be one — this is a name, not a secret, and nothing
 * about it needs to be unguessable.
 */
function demoUuid(name: string): string {
  const hex = createHash('md5').update(`akalt-demo:${name}`).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

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
  /** Stable, derived from `externalId`. See `demoUuid`. */
  id: string;
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
      id: demoUuid(`product:${externalId}`),
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
        `    id: ${literal(p.id)},\n` +
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
  /**
   * THE SAME UUID THE SQL FIXTURE USES, derived from the external id.
   *
   * Every id column in the real schema is a uuid, so a readable string here
   * meant a signed-in customer could never put a demo product in a Supabase
   * cart and the checkout RPC could not be exercised by the app at all.
   */
  readonly id: string;
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

export const DEMO_MERCHANT = ${JSON.stringify(
    { id: demoUuid('merchant'), ...config.merchant },
    null,
    2,
  )} as const;

export const DEMO_LOCATION = ${JSON.stringify(
    {
      id: demoUuid(`location:${String(config.location.externalId)}`),
      merchantId: demoUuid('merchant'),
      ...config.location,
    },
    null,
    2,
  )} as const;

export const DEMO_PRODUCTS: readonly DemoProductRow[] = [
${productLines}
];

export const DEMO_MAPPINGS: readonly DemoMappingRow[] = [
${mappingLines}
];
`;
}

/** A SQL string literal. Nothing here is user input, but quoting is quoting. */
function sql(value: string | null): string {
  return value === null ? 'null' : `'${value.replace(/'/g, "''")}'`;
}

/**
 * The same catalogue, as rows in an actual Postgres database.
 *
 * WHY THIS EXISTS. Everything above this line produces a bundled fixture the
 * app reads in memory. That is enough to build the sourcing panel and a local
 * cart, and it is NOT enough to exercise `create_order_draft`, which reads
 * `merchant_products`, locks a `carts` row and joins to `merchants`. Until the
 * demo catalogue existed as rows, the only way to test the real function was
 * to hand-write fixtures inside a test, which tests the function against a
 * shape nobody ships.
 *
 * TWO FLAGS ARE DELIBERATELY FLIPPED HERE. `merchant.json` keeps
 * `isEnabled: false` and `isAcceptingOrders: false`, and
 * `commerce-demo-isolation.test.ts` holds it to that, so no BUILD can ever
 * treat the fixture as a live partner. A throwaway database is a different
 * question: there, the branch has to be open or there is no flow to test. The
 * guard at the top of the file is what keeps the two apart — this must never
 * be loaded into a database that has real merchants in it.
 */
function renderSql(
  config: { merchant: Record<string, unknown>; location: Record<string, unknown> },
  products: readonly DemoProduct[],
  mappings: readonly DemoMapping[],
): string {
  const merchantId = demoUuid('merchant');
  const locationId = demoUuid(`location:${String(config.location.externalId)}`);
  const m = config.merchant as Record<string, string | number | boolean>;
  const l = config.location as Record<string, string | number | boolean | string[]>;
  const areaKeys = (l.deliveryAreaKeys as string[]) ?? [];

  const productValues = products
    .map(
      (p) =>
        `  (${sql(p.id)}, ${sql(p.externalId)}, ${sql(p.sku)}, ${sql(p.name)}, ` +
        `${sql(p.nameAr)}, ${sql(p.brand)}, ${p.packQuantity ?? 'null'}, ` +
        `${p.packUnit === null ? 'null' : `${sql(p.packUnit)}::public.measurement_unit`}, ` +
        `${p.priceMinor}, ${sql(p.availability)}::public.availability_status, ${p.isActive}, ` +
        // THE DISTINCTION THE CHILD TABLE CANNOT HOLD. A product with no
        // allergen rows is either one the merchant declared free of them or
        // one they published nothing about, and for an allergic customer those
        // are opposite answers. The CSV has said which since Commerce-3.1;
        // this is what carries it into the database.
        `${p.allergens !== null})`,
    )
    .join(',\n');

  const allergenValues = products
    .flatMap((p) => (p.allergens ?? []).map((a) => `  (${sql(p.id)}::uuid, ${sql(a)}::public.allergen)`))
    .join(',\n');

  const dietValues = products
    .flatMap((p) =>
      Object.entries(p.diets ?? {}).map(
        ([diet, verdict]) =>
          `  (${sql(p.id)}::uuid, ${sql(diet)}::public.dietary_preference, ${verdict === 'compatible'})`,
      ),
    )
    .join(',\n');

  const mappingValues = mappings
    .map(
      (mapping) =>
        `  (${sql(mapping.ingredientSlug)}, ${sql(demoUuid(`product:${mapping.productExternalId}`))}, ` +
        `${sql(mapping.source)}::public.mapping_source, ${mapping.confidence}, ` +
        `${mapping.isVerified}, ${mapping.isBlocked})`,
    )
    .join(',\n');

  /*
    EVERY DEMO AREA, not only the ones this branch covers.

    `demo-nasr-city` is in the registry and deliberately NOT in the branch's
    coverage — it is how the "we do not deliver there" path stays reachable in
    a database somebody can actually open. Inserting only the covered keys
    would make that path untestable and the registry a lie by omission.
  */
  const areaValues = DEMO_DELIVERY_AREAS.map(
    (area) =>
      `  (${sql(area.key)}, ${sql(area.governorate)}, ${sql(area.nameEn)}, ` +
      `${sql(area.nameAr)}, true)`,
  ).join(',\n');

  const unknownKeys = areaKeys.filter(
    (key) => !DEMO_DELIVERY_AREAS.some((area) => area.key === key),
  );
  if (unknownKeys.length > 0) {
    throw new ImportError(
      `merchant.json covers ${unknownKeys.join(', ')}, which the area registry in ` +
        'src/features/commerce/delivery-areas.ts does not list. A branch cannot ' +
        'deliver to a district that does not exist.',
    );
  }

  return `-- GENERATED FILE — do not edit.
--
-- Source: data/commerce-demo/  ·  Regenerate: npm run commerce:demo
--
-- THE DEVELOPMENT CATALOGUE, AS REAL ROWS. Not a supermarket: no company named
-- here exists, no agreement stands behind it and no price is real. Every
-- merchant row carries \`is_demo = true\`.
--
-- LOCAL AND THROWAWAY DATABASES ONLY. Loading this into a database that serves
-- real customers would put a fixture in front of them, so the guard below
-- refuses unless somebody has explicitly said this is a development database
-- AND no real merchant already exists in it.

\\set ON_ERROR_STOP on

do $guard$
begin
  if coalesce(current_setting('akalt.local_fixture', true), '') <> 'yes' then
    raise exception
      'refusing to load the demo catalogue: this is development-only data. '
      'Run "set akalt.local_fixture = ''yes'';" first, and only against a '
      'throwaway database.';
  end if;

  -- The second line of defence, and deliberately narrow: an ENABLED merchant
  -- that is not a demo is a live partner, which only a database serving real
  -- orders has. A broader test ("any non-demo merchant") fires on ordinary
  -- test fixtures, and a gate that cries wolf is a gate somebody deletes.
  if exists (select 1 from public.merchants where is_enabled and not is_demo) then
    raise exception
      'refusing to load the demo catalogue: this database has a live merchant '
      'in it, so it is not a development database.';
  end if;
end
$guard\$;

-- --- The areas the branch covers -------------------------------------------
insert into public.delivery_areas (key, governorate, name_en, name_ar, is_demo)
values
${areaValues}
on conflict (key) do update set
  governorate = excluded.governorate,
  name_en     = excluded.name_en,
  name_ar     = excluded.name_ar,
  is_demo     = excluded.is_demo;

-- --- The merchant ----------------------------------------------------------
--
-- \`is_enabled\` is TRUE here and FALSE in the bundled TypeScript, on purpose.
-- See the note in scripts/import-commerce-demo.ts.
insert into public.merchants (
  id, slug, name, name_ar, country, currency, fulfilment_mode,
  commission_rate_basis_points, merchant_keeps_delivery_fee, is_enabled, is_demo
) values (
  ${sql(merchantId)}, ${sql(String(m.slug))}, ${sql(String(m.name))}, ${sql(String(m.nameAr))},
  ${sql(String(m.country))}, ${sql(String(m.currency))},
  ${sql(String(m.fulfilmentMode))}::public.merchant_fulfilment_mode,
  ${Number(m.commissionRateBasisPoints)}, ${Boolean(m.merchantKeepsDeliveryFee)}, true, true
)
on conflict (id) do update set
  name        = excluded.name,
  is_enabled  = excluded.is_enabled,
  is_demo     = true;

insert into public.merchant_locations (
  id, merchant_id, external_id, name, name_ar, country, city,
  delivery_fee_minor, minimum_order_minor, estimated_delivery_minutes,
  is_accepting_orders
) values (
  ${sql(locationId)}, ${sql(merchantId)}, ${sql(String(l.externalId))},
  ${sql(String(l.name))}, ${sql(String(l.nameAr))}, ${sql(String(m.country))},
  ${sql(String(l.city))}, ${Number(l.deliveryFeeMinor)}, ${Number(l.minimumOrderMinor)},
  ${Number(l.estimatedDeliveryMinutes)}, true
)
on conflict (id) do update set
  delivery_fee_minor  = excluded.delivery_fee_minor,
  minimum_order_minor = excluded.minimum_order_minor,
  is_accepting_orders = excluded.is_accepting_orders;

insert into public.merchant_location_areas (merchant_location_id, area_key)
select ${sql(locationId)}, key
  from public.delivery_areas
 where key in (${areaKeys.map((key) => sql(key)).join(', ')})
on conflict do nothing;

-- --- What it "sells" -------------------------------------------------------
insert into public.merchant_products (
  id, merchant_location_id, external_id, sku, name, name_ar, brand,
  pack_quantity, unit, price_minor, currency, availability, is_active,
  allergens_published
)
select v.id::uuid, ${sql(locationId)}::uuid, v.external_id, v.sku, v.name, v.name_ar, v.brand,
       v.pack_quantity, v.unit, v.price_minor, ${sql(String(m.currency))}, v.availability,
       v.is_active, v.allergens_published
  from (values
${productValues}
  ) as v (id, external_id, sku, name, name_ar, brand, pack_quantity, unit,
          price_minor, availability, is_active, allergens_published)
on conflict (id) do update set
  price_minor         = excluded.price_minor,
  availability        = excluded.availability,
  is_active           = excluded.is_active,
  allergens_published = excluded.allergens_published;

-- --- Safety metadata -------------------------------------------------------
--
-- NO ROW MEANS THE MERCHANT PUBLISHED NOTHING, which is not the same as "free
-- of it". Unknown is never safe; see features/commerce/sourcing.ts.
delete from public.merchant_product_allergens
 where merchant_product_id in (select id from public.merchant_products
                                where merchant_location_id = ${sql(locationId)});
${
  allergenValues
    ? `insert into public.merchant_product_allergens (merchant_product_id, allergen)\nvalues\n${allergenValues};`
    : '-- (no product declares an allergen)'
}

delete from public.merchant_product_diets
 where merchant_product_id in (select id from public.merchant_products
                                where merchant_location_id = ${sql(locationId)});
${
  dietValues
    ? `insert into public.merchant_product_diets (merchant_product_id, diet, is_compatible)\nvalues\n${dietValues};`
    : '-- (no product declares a diet)'
}

-- --- Canonical ingredient → product ----------------------------------------
--
-- Joined to \`ingredients\` by SLUG. A mapping whose ingredient is not in the
-- seed is silently skipped rather than failing the load: the importer already
-- refuses a mapping to an unknown slug, so a miss here means the seed has not
-- been applied, and that is the seed's problem to report.
insert into public.ingredient_product_mappings (
  ingredient_id, merchant_product_id, source, confidence, is_verified, verified_at, is_blocked
)
select i.id, v.product_id::uuid, v.source, v.confidence, v.is_verified,
       case when v.is_verified then now() else null end, v.is_blocked
  from (values
${mappingValues}
  ) as v (slug, product_id, source, confidence, is_verified, is_blocked)
  join public.ingredients i on i.slug = v.slug
on conflict (ingredient_id, merchant_product_id) do update set
  confidence  = excluded.confidence,
  is_verified = excluded.is_verified,
  is_blocked  = excluded.is_blocked;
`;
}

function main(): void {
  const checkOnly = process.argv.includes('--check');

  let rendered: string;
  let renderedSql: string;
  let products: DemoProduct[];
  let mappings: DemoMapping[];
  try {
    products = parseProducts();
    mappings = parseMappings(products);
    const merchantFile = readFileSync(join(SOURCE_DIR, 'merchant.json'), 'utf8');
    rendered = render(merchantFile, products, mappings);
    renderedSql = renderSql(
      JSON.parse(merchantFile) as {
        merchant: Record<string, unknown>;
        location: Record<string, unknown>;
      },
      products,
      mappings,
    );
  } catch (error) {
    if (error instanceof ImportError) {
      console.error(`Demo catalogue import failed.\n  ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const read = (path: string): string => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return '';
    }
  };

  if (checkOnly) {
    // BOTH OUTPUTS, or the two halves of the same catalogue drift apart and
    // the app ends up sourcing product ids the database has never heard of.
    const stale = [
      read(OUTPUT) === rendered ? null : 'src/features/commerce/demo-catalogue.generated.ts',
      read(SQL_OUTPUT) === renderedSql ? null : 'supabase/fixtures/commerce-demo.generated.sql',
    ].filter((entry): entry is string => entry !== null);

    if (stale.length > 0) {
      console.error(
        `Out of date with data/commerce-demo/:\n${stale.map((f) => `  - ${f}`).join('\n')}\n` +
          'Run `npm run commerce:demo` and commit the result.',
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Demo catalogue is current (${products.length} products, ${mappings.length} mappings).`);
    return;
  }

  mkdirSync(dirname(SQL_OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, rendered);
  writeFileSync(SQL_OUTPUT, renderedSql);
  console.log(
    `Demo catalogue written: ${products.length} products, ${mappings.length} mappings ` +
      `across ${new Set(mappings.map((m) => m.ingredientSlug)).size} canonical ingredients.\n` +
      `  bundled: ${OUTPUT.replace(`${ROOT}/`, '')}\n` +
      `  rows:    ${SQL_OUTPUT.replace(`${ROOT}/`, '')}`,
  );
}

main();
