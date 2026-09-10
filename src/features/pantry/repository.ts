import { resolveIngredient } from '@/features/ingredients/matching';
import {
  LocalCollection,
  LocalCollectionKeys,
  newId,
  nowISO,
} from '@/lib/storage/local-collection';
import type { IngredientCategory, PantryItem, Unit } from '@/types/domain';

/**
 * Pantry persistence.
 *
 * `PantryRepository` is the seam between the UI and storage. `LocalPantry`
 * backs guests; `SupabasePantry` (Phase 3) backs signed-in users. The hooks in
 * `hooks.ts` choose between them, so no screen knows which is active.
 */

export type CreatePantryInput = {
  ingredientName: string;
  quantity?: number | null;
  unit?: Unit | null;
  expiresOn?: string | null;
  isStaple?: boolean;
  category?: IngredientCategory;
  note?: string | null;
};

export type UpdatePantryInput = Partial<Omit<PantryItem, 'id' | 'userId' | 'createdAt'>>;

export interface PantryRepository {
  list(): Promise<PantryItem[]>;
  add(input: CreatePantryInput): Promise<PantryItem>;
  update(id: string, patch: UpdatePantryInput): Promise<PantryItem | null>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

/** Guest user id. Local rows carry it so the shape matches the DB exactly. */
export const LOCAL_USER_ID = 'local';

/** Builds a full `PantryItem`, resolving category/unit from the catalogue. */
export function buildPantryItem(input: CreatePantryInput, userId: string): PantryItem {
  const resolved = resolveIngredient(input.ingredientName);
  const timestamp = nowISO();

  return {
    id: newId(),
    userId,
    // Null until the row is reconciled against the `ingredients` table.
    ingredientId: resolved?.slug ?? '',
    ingredientName: resolved?.name ?? input.ingredientName.trim(),
    category: input.category ?? resolved?.category ?? 'other',
    quantity: input.quantity ?? null,
    unit: input.unit ?? resolved?.defaultUnit ?? null,
    expiresOn: input.expiresOn ?? null,
    isStaple: input.isStaple ?? resolved?.isCommonStaple ?? false,
    note: input.note ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export class LocalPantryRepository implements PantryRepository {
  private readonly collection = new LocalCollection<PantryItem>(LocalCollectionKeys.pantry);

  async list(): Promise<PantryItem[]> {
    const items = await this.collection.list();
    return items.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
  }

  async add(input: CreatePantryInput): Promise<PantryItem> {
    const existing = await this.collection.list();
    const item = buildPantryItem(input, LOCAL_USER_ID);

    // Adding something already in the pantry updates it rather than creating a
    // duplicate row — matching what a user expects from "add tomatoes" twice.
    const duplicate = existing.find(
      (candidate) => candidate.ingredientName === item.ingredientName,
    );
    if (duplicate) {
      const merged = await this.collection.update(duplicate.id, {
        quantity:
          input.quantity !== undefined && input.quantity !== null
            ? (duplicate.quantity ?? 0) + input.quantity
            : duplicate.quantity,
        unit: item.unit ?? duplicate.unit,
        expiresOn: input.expiresOn ?? duplicate.expiresOn,
        isStaple: input.isStaple ?? duplicate.isStaple,
        updatedAt: nowISO(),
      });
      return merged ?? duplicate;
    }

    return this.collection.insert(item);
  }

  async update(id: string, patch: UpdatePantryInput): Promise<PantryItem | null> {
    return this.collection.update(id, { ...patch, updatedAt: nowISO() });
  }

  async remove(id: string): Promise<void> {
    await this.collection.remove(id);
  }

  async clear(): Promise<void> {
    await this.collection.clear();
  }
}

/** Category display order — protein and vegetables first, "other" last. */
export const CATEGORY_ORDER: IngredientCategory[] = [
  'protein',
  'vegetables',
  'fruit',
  'dairy',
  'carbs',
  'bakery',
  'frozen',
  'pantry',
  'sauces',
  'spices',
  'other',
];

export function groupByCategory(items: readonly PantryItem[]) {
  const groups = new Map<IngredientCategory, PantryItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.category);
    if (bucket) bucket.push(item);
    else groups.set(item.category, [item]);
  }
  return CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => ({
    category,
    items: groups.get(category) ?? [],
  }));
}
