import { resolveIngredient } from '@/features/ingredients/matching';
import { normaliseIngredientName } from '@/features/ingredients/normalise';
import { priceBookFor } from '@/features/pricing/price-book';
import { completenessOf, costOfIngredient } from '@/features/pricing/estimate';
import { money } from '@/lib/format/money';
import {
  LocalCollection,
  LocalCollectionKeys,
  newId,
  nowISO,
} from '@/lib/storage/local-collection';
import type {
  CountryCode,
  CurrencyCode,
  IngredientCategory,
  PricedAmount,
  ShoppingListItem,
  Unit,
} from '@/types/domain';

import { perPieceWeightFor, toGrams } from '@/features/pricing/units';

/**
 * Shopping list.
 *
 * Two behaviours matter here and are unit-tested:
 *   1. adding the same ingredient twice MERGES into one line with a combined
 *      quantity (2 tomatoes + 3 tomatoes = 5 tomatoes), and
 *   2. every line already carries the store-mapping fields a grocery provider
 *      will need, all null in V1.
 */

export type AddShoppingItemInput = {
  name: string;
  quantity?: number | null;
  unit?: Unit | null;
  category?: IngredientCategory;
  sourceRecipeId?: string | null;
};

export interface ShoppingRepository {
  list(): Promise<ShoppingListItem[]>;
  add(input: AddShoppingItemInput): Promise<ShoppingListItem>;
  addMany(inputs: readonly AddShoppingItemInput[]): Promise<ShoppingListItem[]>;
  setChecked(id: string, isChecked: boolean): Promise<void>;
  update(id: string, patch: Partial<ShoppingListItem>): Promise<ShoppingListItem | null>;
  remove(id: string): Promise<void>;
  clearChecked(): Promise<void>;
  clear(): Promise<void>;
}

/** Local list id. Real lists get a UUID from Postgres. */
export const LOCAL_LIST_ID = 'local-list';

export function buildShoppingItem(
  input: AddShoppingItemInput,
  listId: string,
): ShoppingListItem {
  const resolved = resolveIngredient(input.name);
  const timestamp = nowISO();

  return {
    id: newId(),
    listId,
    ingredientId: resolved?.slug ?? null,
    name: resolved?.name ?? input.name.trim(),
    quantity: input.quantity ?? null,
    unit: input.unit ?? resolved?.defaultUnit ?? null,
    category: input.category ?? resolved?.category ?? 'other',
    isChecked: false,
    sourceRecipeIds: input.sourceRecipeId ? [input.sourceRecipeId] : [],
    estimatedCost: null,

    // Reserved for grocery-provider integration. See src/features/grocery/.
    supermarketId: null,
    storeProductId: null,
    sku: null,
    livePriceMinor: null,
    availability: null,

    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Combines a new amount into an existing line.
 *
 * Same unit -> straight addition. Different but convertible units (g and kg)
 * -> converted to the existing line's unit. Not convertible -> we keep the
 * existing quantity and leave the unit alone rather than adding nonsense; the
 * extra source recipe is still recorded so the user sees why it is on the list.
 */
export function mergeQuantities(
  existing: Pick<ShoppingListItem, 'quantity' | 'unit' | 'name'>,
  addition: { quantity: number | null; unit: Unit | null },
): { quantity: number | null; unit: Unit | null } {
  if (addition.quantity === null) return { quantity: existing.quantity, unit: existing.unit };
  if (existing.quantity === null) {
    return { quantity: addition.quantity, unit: addition.unit ?? existing.unit };
  }
  if (existing.unit === addition.unit || addition.unit === null) {
    return { quantity: existing.quantity + addition.quantity, unit: existing.unit };
  }

  const perPiece = perPieceWeightFor(resolveIngredient(existing.name));
  const existingGrams = existing.unit ? toGrams(existing.quantity, existing.unit, perPiece) : null;
  const additionGrams = toGrams(addition.quantity, addition.unit, perPiece);
  const oneExistingUnit = existing.unit ? toGrams(1, existing.unit, perPiece) : null;

  if (existingGrams !== null && additionGrams !== null && oneExistingUnit) {
    const totalGrams = existingGrams + additionGrams;
    return { quantity: totalGrams / oneExistingUnit, unit: existing.unit };
  }

  return { quantity: existing.quantity, unit: existing.unit };
}

/**
 * The key two list lines must share to be the same thing.
 *
 * Normalising the typed name alone leaves "aubergine" and "eggplant" as two
 * lines, so this resolves through the ingredient catalogue first and only
 * falls back to the raw name for things the catalogue does not know.
 */
export function mergeKeyFor(name: string): string {
  const resolved = resolveIngredient(name);
  return normaliseIngredientName(resolved?.name ?? name);
}

export class LocalShoppingRepository implements ShoppingRepository {
  private readonly collection = new LocalCollection<ShoppingListItem>(
    LocalCollectionKeys.shoppingList,
  );

  async list(): Promise<ShoppingListItem[]> {
    const items = await this.collection.list();
    // Unchecked first, then alphabetical inside each group.
    return items.sort((a, b) => {
      if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }

  async add(input: AddShoppingItemInput): Promise<ShoppingListItem> {
    const items = await this.collection.list();
    const key = mergeKeyFor(input.name);
    const existing = items.find((item) => mergeKeyFor(item.name) === key);

    if (existing) {
      const merged = mergeQuantities(existing, {
        quantity: input.quantity ?? null,
        unit: input.unit ?? null,
      });
      const sources = new Set(existing.sourceRecipeIds);
      if (input.sourceRecipeId) sources.add(input.sourceRecipeId);

      const updated = await this.collection.update(existing.id, {
        quantity: merged.quantity,
        unit: merged.unit,
        sourceRecipeIds: [...sources],
        // Re-adding an item the user already ticked off means they need it
        // again, so it comes back unchecked.
        isChecked: false,
        updatedAt: nowISO(),
      });
      return updated ?? existing;
    }

    return this.collection.insert(buildShoppingItem(input, LOCAL_LIST_ID));
  }

  async addMany(inputs: readonly AddShoppingItemInput[]): Promise<ShoppingListItem[]> {
    const results: ShoppingListItem[] = [];
    // Sequential on purpose: each add reads the merged state of the previous.
    for (const input of inputs) {
      results.push(await this.add(input));
    }
    return results;
  }

  async setChecked(id: string, isChecked: boolean): Promise<void> {
    await this.collection.update(id, { isChecked, updatedAt: nowISO() });
  }

  async update(id: string, patch: Partial<ShoppingListItem>): Promise<ShoppingListItem | null> {
    return this.collection.update(id, { ...patch, updatedAt: nowISO() });
  }

  async remove(id: string): Promise<void> {
    await this.collection.remove(id);
  }

  async clearChecked(): Promise<void> {
    const items = await this.collection.list();
    await this.collection.replaceAll(items.filter((item) => !item.isChecked));
  }

  async clear(): Promise<void> {
    await this.collection.clear();
  }
}

/**
 * Estimated total for a shopping list.
 *
 * Same rule as recipes: computed here from the price book, tagged as an
 * estimate, never invented by a model.
 */
export function estimateListTotal(
  items: readonly ShoppingListItem[],
  country: CountryCode,
  currency: CurrencyCode,
): { priced: PricedAmount; unpricedCount: number } {
  const book = priceBookFor(country, currency);
  let totalMinor = 0;
  let unpricedCount = 0;
  let pricedCount = 0;

  for (const item of items) {
    if (item.isChecked) continue;
    const quote = book.quote(item.name);
    if (!quote) {
      unpricedCount += 1;
      continue;
    }
    const cost = costOfIngredient(
      { name: item.name, quantity: item.quantity, unit: item.unit },
      quote,
      perPieceWeightFor(resolveIngredient(item.name), quote.unit),
    );
    totalMinor += cost.amountMinor;
    pricedCount += 1;
  }

  // The count of unpriced items was already being tracked here, but it never
  // reached the rendered amount — so a list holding nothing but a salmon
  // fillet we cannot price totalled "~0 EGP", which reads as free. The total
  // now carries how much of itself it actually covers.
  const completeness = completenessOf(pricedCount, pricedCount + unpricedCount);

  return {
    priced: {
      money: money(totalMinor, currency),
      source: 'estimate',
      lastUpdated: book.lastUpdated,
      isFallback: unpricedCount > 0,
      completeness,
      unpricedCount,
    },
    unpricedCount,
  };
}

