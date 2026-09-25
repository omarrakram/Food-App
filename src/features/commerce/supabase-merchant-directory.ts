import type { SupabaseClient } from '@supabase/supabase-js';

import { toAppError } from '@/lib/errors';
import type { Database } from '@/lib/supabase/database.types';
import type {
  IngredientProductMapping,
  MappingSource,
  MerchantLocation,
  MerchantProduct,
  ProductDietaryProfile,
  ProductDiet,
  PublicMerchant,
} from '@/types/commerce';
import type { Allergen, Availability, CountryCode, CurrencyCode, Unit } from '@/types/domain';

import type { CatalogueAdapter, ProductQuery } from './ports';
import type {
  CandidateIndex,
  ProductSafety,
  SafetyIndex,
  SelectedMerchant,
} from './merchant-selection';
import type { SourcingCandidateInput } from './sourcing';

/**
 * A real merchant, read out of the database's PUBLIC surface.
 *
 * THE POINT OF THIS FILE. Until it existed, `enabledPartnerFor()` returned
 * null and the only selectable branch was a bundled fixture that refuses to be
 * ordered from — so a supermarket could be fully configured in Postgres, with
 * RLS, prices, stock and delivery areas, and the app could not see it. That was
 * the single largest blocker to a pilot.
 *
 * WHAT IT WILL NOT DO, and each of these is a rule rather than an oversight:
 *
 *   IT NEVER SELECTS A DEMO MERCHANT. `is_demo` rows are excluded here even
 *   though RLS would happily return them. The development catalogue has its
 *   own path, its own badge and its own build gate; letting it arrive through
 *   the real one would defeat all three.
 *
 *   IT NEVER SELECTS A CLOSED BRANCH. `is_accepting_orders` is checked in the
 *   query rather than after it, so a shop that has stopped taking orders is
 *   not selected and then refused at checkout.
 *
 *   IT NAMES NO SUPERMARKET. There is no slug, no id and no brand in this
 *   file. Whoever signs first is whoever the database says is enabled.
 *
 *   IT READS THE VIEWS, NEVER THE TABLES. Every query below names a
 *   `public_*` view from `20260930090000_public_catalogue.sql`, each of which
 *   lists its columns one by one and filters to enabled, non-demo, active,
 *   priced rows. The commission rate, the fulfilment mode, the merchant's own
 *   branch keys and every operational column are not in those views, so they
 *   cannot arrive here however this file changes.
 *
 *   AND A GUEST MAY READ THEM. That is the point of the views: somebody
 *   deciding whether AKALT is worth an account can see that there is a shop,
 *   what it sells and what it charges. Creating an order is still
 *   `authenticated`-only, and nothing in this file writes anything.
 */

/** Exactly the columns of `public_merchants`, and no more. */
type MerchantRowShape = {
  id: string;
  name: string;
  name_ar: string | null;
  country: string;
  currency: string;
};

/** Exactly the columns of `public_merchant_locations`. No `external_id`. */
type LocationRowShape = {
  id: string;
  merchant_id: string;
  name: string;
  name_ar: string | null;
  country: string;
  city: string | null;
  delivery_fee_minor: number | null;
  minimum_order_minor: number | null;
  estimated_delivery_minutes: number | null;
  is_accepting_orders: boolean;
};

const MERCHANT_COLUMNS = 'id, name, name_ar, country, currency';

const LOCATION_COLUMNS =
  'id, merchant_id, name, name_ar, country, city, delivery_fee_minor, minimum_order_minor, estimated_delivery_minutes, is_accepting_orders';

const PRODUCT_COLUMNS =
  'id, merchant_location_id, external_id, sku, name, name_ar, brand, unit, pack_quantity, price_minor, currency, availability, image_url, is_active, allergens_published, fetched_at';

function toMerchant(row: MerchantRowShape): PublicMerchant {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar,
    country: row.country as CountryCode,
    currency: row.currency as CurrencyCode,
    /*
      TRUE AND FALSE BY CONSTRUCTION, not by assumption.

      `public_merchants` is `... where m.is_enabled and not m.is_demo`. A row
      that arrived here satisfied both, and the view is the only way in — so
      these are facts about the query rather than defaults about the data.
    */
    isEnabled: true,
    isDemo: false,
  };
}

function toLocation(
  row: LocationRowShape,
  currency: CurrencyCode,
  areaKeys: readonly string[],
): MerchantLocation {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    // The merchant's own branch key is NOT on the public surface, and nothing
    // customer-facing needs it. Empty rather than invented.
    externalId: '',
    name: row.name,
    nameAr: row.name_ar,
    city: row.city,
    deliveryAreaKeys: areaKeys,
    deliveryFee:
      row.delivery_fee_minor === null
        ? null
        : { amountMinor: row.delivery_fee_minor, currency },
    minimumOrder:
      row.minimum_order_minor === null
        ? null
        : { amountMinor: row.minimum_order_minor, currency },
    estimatedDeliveryMinutes: row.estimated_delivery_minutes,
    isAcceptingOrders: row.is_accepting_orders,
    // Timestamps are operational metadata; no screen shows when a branch row
    // was written. The public view does not carry them.
    createdAt: '',
    updatedAt: '',
  };
}

type ProductRowShape = {
  id: string;
  merchant_location_id: string;
  external_id: string;
  sku: string | null;
  name: string;
  name_ar: string | null;
  brand: string | null;
  unit: string | null;
  pack_quantity: number | null;
  price_minor: number | null;
  currency: string;
  availability: string;
  image_url: string | null;
  is_active: boolean;
  allergens_published: boolean;
  fetched_at: string;
};

function toProduct(row: ProductRowShape, merchantId: string): MerchantProduct {
  return {
    id: row.id,
    merchantId,
    locationId: row.merchant_location_id,
    externalId: row.external_id,
    sku: row.sku,
    name: row.name,
    nameAr: row.name_ar,
    brand: row.brand,
    packQuantity: row.pack_quantity,
    packUnit: (row.unit as Unit | null) ?? null,
    // A product with no price is not purchasable, and the sourcing gates read
    // the availability rather than the number — so zero here is never quietly
    // treated as free: `price_minor is null` rows are filtered out of every
    // query below.
    price: { amountMinor: row.price_minor ?? 0, currency: row.currency as CurrencyCode },
    availability: row.availability as Availability,
    imageUrl: row.image_url,
    isActive: row.is_active,
    fetchedAt: row.fetched_at,
  };
}

/** A `CatalogueAdapter` over `merchant_products`, read through RLS. */
export class SupabaseCatalogueAdapter implements CatalogueAdapter {
  constructor(
    private readonly client: SupabaseClient<Database>,
    readonly merchantId: string,
    private readonly locationId: string,
  ) {}

  async getMerchant(): Promise<PublicMerchant> {
    const { data, error } = await this.client
      .from('public_merchants')
      .select(MERCHANT_COLUMNS)
      .eq('id', this.merchantId)
      .single();
    if (error) throw toAppError(error, 'database');
    return toMerchant(data as MerchantRowShape);
  }

  async listLocations(options?: { readonly city?: string }): Promise<readonly MerchantLocation[]> {
    let query = this.client
      .from('public_merchant_locations')
      .select(LOCATION_COLUMNS)
      .eq('merchant_id', this.merchantId);
    if (options?.city) query = query.eq('city', options.city);

    const { data, error } = await query;
    if (error) throw toAppError(error, 'database');

    const merchant = await this.getMerchant();
    return (data ?? []).map((row) =>
      toLocation(row as LocationRowShape, merchant.currency, []),
    );
  }

  async searchProducts(query: ProductQuery): Promise<readonly MerchantProduct[]> {
    const { data, error } = await this.client
      .from('public_merchant_products')
      .select(PRODUCT_COLUMNS)
      .eq('merchant_location_id', query.locationId)
      .ilike('name', `%${query.term}%`)
      .limit(query.limit ?? 20);
    if (error) throw toAppError(error, 'database');
    return (data ?? []).map((row) => toProduct(row as ProductRowShape, this.merchantId));
  }

  async getProducts(productIds: readonly string[]): Promise<readonly MerchantProduct[]> {
    if (productIds.length === 0) return [];
    const { data, error } = await this.client
      .from('public_merchant_products')
      .select(PRODUCT_COLUMNS)
      .in('id', [...productIds]);
    if (error) throw toAppError(error, 'database');
    return (data ?? []).map((row) => toProduct(row as ProductRowShape, this.merchantId));
  }

  async checkAvailability(
    locationId: string,
    productIds: readonly string[],
  ): Promise<Readonly<Record<string, Availability>>> {
    if (productIds.length === 0) return {};
    const { data, error } = await this.client
      .from('public_merchant_products')
      .select('id, availability, is_active')
      .eq('merchant_location_id', locationId)
      .in('id', [...productIds]);
    if (error) throw toAppError(error, 'database');

    const out: Record<string, Availability> = {};
    for (const row of data ?? []) {
      // A delisted product is not "in stock but hidden". It cannot be bought,
      // and the cart has to be told the same thing it would be told about an
      // empty shelf.
      out[row.id] = row.is_active ? (row.availability as Availability) : 'out_of_stock';
    }
    return out;
  }
}

/** The safety metadata for a set of products, as the merchant published it. */
async function readSafety(
  client: SupabaseClient<Database>,
  productIds: readonly string[],
): Promise<SafetyIndex> {
  const index = new Map<string, ProductSafety>();
  if (productIds.length === 0) return index;

  const ids = [...productIds];

  const [published, allergens, diets] = await Promise.all([
    client.from('public_merchant_products').select('id, allergens_published').in('id', ids),
    client.from('public_merchant_product_allergens').select('merchant_product_id, allergen').in('merchant_product_id', ids),
    client
      .from('public_merchant_product_diets')
      .select('merchant_product_id, diet, is_compatible')
      .in('merchant_product_id', ids),
  ]);

  if (published.error) throw toAppError(published.error, 'database');
  if (allergens.error) throw toAppError(allergens.error, 'database');
  if (diets.error) throw toAppError(diets.error, 'database');

  /*
    THE DISTINCTION THE CHILD TABLE CANNOT HOLD.

    A product with no allergen rows is either one the merchant declared free of
    them or one they published nothing about, and for an allergic customer
    those are opposite answers. `allergens_published` is the column that says
    which, and reading the child table alone would turn every unlabelled
    product into a safe one.
  */
  const declared = new Map<string, boolean>();
  for (const row of published.data ?? []) declared.set(row.id, row.allergens_published);

  const byProduct = new Map<string, Allergen[]>();
  for (const row of allergens.data ?? []) {
    const list = byProduct.get(row.merchant_product_id) ?? [];
    list.push(row.allergen as Allergen);
    byProduct.set(row.merchant_product_id, list);
  }

  const dietsByProduct = new Map<string, ProductDietaryProfile>();
  for (const row of diets.data ?? []) {
    const profile = { ...(dietsByProduct.get(row.merchant_product_id) ?? {}) };
    profile[row.diet as ProductDiet] = row.is_compatible ? 'compatible' : 'incompatible';
    dietsByProduct.set(row.merchant_product_id, profile);
  }

  for (const id of ids) {
    index.set(id, {
      allergens: declared.get(id) === true ? (byProduct.get(id) ?? []) : null,
      diets: dietsByProduct.get(id) ?? null,
    });
  }

  return index;
}

/** Candidate products for a set of canonical ingredient slugs, at one branch. */
async function readCandidates(
  client: SupabaseClient<Database>,
  merchantId: string,
  locationId: string,
  slugs: readonly string[],
): Promise<CandidateIndex> {
  const index = new Map<string, readonly SourcingCandidateInput[]>();
  if (slugs.length === 0) return index;

  // Slugs are AKALT's vocabulary; the mapping table keys on the ingredient
  // row. One lookup rather than a join, because `ingredients` is reference
  // data the client already caches hard.
  const { data: ingredients, error: ingredientError } = await client
    .from('public_ingredients')
    .select('id, slug')
    .in('slug', [...slugs]);
  if (ingredientError) throw toAppError(ingredientError, 'database');

  const slugById = new Map<string, string>();
  for (const row of ingredients ?? []) slugById.set(row.id, row.slug);
  if (slugById.size === 0) return index;

  const { data: mappings, error: mappingError } = await client
    .from('public_ingredient_product_mappings')
    .select(
      // `verified_by` is absent from the public view: who reviewed a mapping
      // is staff information.
      'id, ingredient_id, merchant_product_id, confidence, source, is_verified, verified_at, is_blocked, created_at, updated_at',
    )
    .in('ingredient_id', [...slugById.keys()]);
  if (mappingError) throw toAppError(mappingError, 'database');

  const rows = mappings ?? [];
  if (rows.length === 0) return index;

  const productIds = [...new Set(rows.map((row) => row.merchant_product_id))];

  const { data: products, error: productError } = await client
    .from('public_merchant_products')
    .select(PRODUCT_COLUMNS)
    .eq('merchant_location_id', locationId)
    .in('id', productIds);
  if (productError) throw toAppError(productError, 'database');

  const productsById = new Map<string, MerchantProduct>();
  for (const row of products ?? []) {
    productsById.set(row.id, toProduct(row as ProductRowShape, merchantId));
  }
  if (productsById.size === 0) return index;

  const safety = await readSafety(client, [...productsById.keys()]);

  const byslug = new Map<string, SourcingCandidateInput[]>();
  for (const row of rows) {
    const product = productsById.get(row.merchant_product_id);
    if (!product) continue; // Another branch's shelf, delisted, or unpriced.
    const slug = slugById.get(row.ingredient_id);
    if (!slug) continue;

    const mapping: IngredientProductMapping = {
      id: row.id,
      ingredientSlug: slug,
      merchantProductId: row.merchant_product_id,
      confidence: Number(row.confidence),
      source: row.source as MappingSource,
      isVerified: row.is_verified,
      verifiedAt: row.verified_at,
      verifiedBy: null,
      isBlocked: row.is_blocked,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    const published = safety.get(product.id);
    const list = byslug.get(slug) ?? [];
    list.push({
      product,
      mapping,
      productAllergens: published?.allergens ?? null,
      productDiets: published?.diets ?? null,
    });
    byslug.set(slug, list);
  }

  for (const [slug, candidates] of byslug) index.set(slug, candidates);
  return index;
}

/**
 * Which of the open branches to source against.
 *
 * Pure, and separated from the queries above so the RULES can be tested
 * without a database — because they are rules rather than plumbing:
 *
 *   A BRANCH THAT SERVES NOBODY IS NOT A BRANCH. An empty
 *   `merchant_location_areas` means NO coverage rather than "everywhere"; the
 *   inverse default would accept an Aswan order for a Maadi shop, most
 *   confidently for a merchant nobody had finished configuring.
 *
 *   THE CUSTOMER'S OWN AREA WINS when they have told us one. Not as a filter —
 *   they may be about to add a different address, and the deliverability check
 *   at checkout is the authority either way — but a branch that can actually
 *   reach them should not lose to one that cannot.
 *
 *   OTHERWISE, THE OLDEST. Deterministic, so two people in the same area get
 *   the same shop and a cart does not move between branches between renders.
 */
export function chooseLocation<T extends { readonly id: string }>(
  locations: readonly T[],
  areasByLocation: ReadonlyMap<string, readonly string[]>,
  areaKey: string | null,
): T | null {
  const servable = locations.filter((row) => (areasByLocation.get(row.id)?.length ?? 0) > 0);
  if (servable.length === 0) return null;

  if (areaKey) {
    const serving = servable.find((row) => areasByLocation.get(row.id)?.includes(areaKey));
    if (serving) return serving;
  }

  return servable[0] ?? null;
}

export type MerchantSearch = {
  readonly country: CountryCode;
  /**
   * The area the customer actually wants delivery to, when one is known.
   *
   * A preference rather than a filter: a branch that does not serve this area
   * is still selectable, because the customer may be about to add a different
   * address, and the deliverability check at checkout is the authority either
   * way. What this does is stop the app picking the Alexandria branch for
   * somebody whose only address is in Maadi.
   */
  readonly areaKey?: string | null;
};

/**
 * The enabled merchant and branch to source against, or null when there is
 * none.
 *
 * Null is an ordinary answer, not an error: until a supermarket signs, there
 * is no enabled non-demo merchant row and this returns null every time. The
 * caller renders "not available here" rather than an empty shop.
 */
export async function findDatabaseMerchant(
  client: SupabaseClient<Database>,
  search: MerchantSearch,
): Promise<SelectedMerchant | null> {
  /*
    NO `is_enabled` OR `is_demo` FILTER HERE, and that is not an omission.

    They are the view's own WHERE clause. Repeating them in the query would
    read as the safety being the client's job, which is exactly the arrangement
    this surface exists to end: a screen cannot forget a filter it does not
    have to write, and a future caller of the view inherits both.
  */
  const { data: merchants, error: merchantError } = await client
    .from('public_merchants')
    .select(MERCHANT_COLUMNS)
    .eq('country', search.country)
    .order('id', { ascending: true });

  if (merchantError) throw toAppError(merchantError, 'database');
  const merchantRows = (merchants ?? []) as MerchantRowShape[];
  if (merchantRows.length === 0) return null;

  const { data: locations, error: locationError } = await client
    .from('public_merchant_locations')
    .select(LOCATION_COLUMNS)
    .in('merchant_id', merchantRows.map((row) => row.id))
    .eq('country', search.country)
    .eq('is_accepting_orders', true)
    .order('id', { ascending: true });

  if (locationError) throw toAppError(locationError, 'database');
  const locationRows = (locations ?? []) as LocationRowShape[];
  if (locationRows.length === 0) return null;

  const { data: areas, error: areaError } = await client
    .from('public_merchant_location_areas')
    .select('merchant_location_id, area_key')
    .in('merchant_location_id', locationRows.map((row) => row.id));
  if (areaError) throw toAppError(areaError, 'database');

  const areasByLocation = new Map<string, string[]>();
  for (const row of areas ?? []) {
    const list = areasByLocation.get(row.merchant_location_id) ?? [];
    list.push(row.area_key);
    areasByLocation.set(row.merchant_location_id, list);
  }

  const preferred = chooseLocation(locationRows, areasByLocation, search.areaKey ?? null);
  if (!preferred) return null;

  const merchantRow = merchantRows.find((row) => row.id === preferred.merchant_id);
  if (!merchantRow) return null;

  const merchant = toMerchant(merchantRow);
  const location = toLocation(preferred, merchant.currency, areasByLocation.get(preferred.id) ?? []);

  return {
    merchant,
    location,
    catalogue: new SupabaseCatalogueAdapter(client, merchant.id, location.id),
    candidatesFor: (slugs) => readCandidates(client, merchant.id, location.id, slugs),
    safetyFor: (productIds) => readSafety(client, productIds),
    isDemo: false,
  };
}
