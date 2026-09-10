import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveIngredient } from '@/features/ingredients/matching';
import { normaliseIngredientName } from '@/features/ingredients/normalise';
import { toAppError } from '@/lib/errors';
import type { Database, ShoppingListItemRow } from '@/lib/supabase/database.types';
import type { ShoppingListItem } from '@/types/domain';

import { mergeQuantities, type AddShoppingItemInput, type ShoppingRepository } from './repository';

/**
 * Supabase-backed shopping list.
 *
 * The default list is created by the signup trigger, but this resolves it
 * lazily and creates one if it is missing, so a user whose trigger predates
 * that migration is not left without a list.
 */
export class SupabaseShoppingRepository implements ShoppingRepository {
  private listIdPromise: Promise<string> | null = null;

  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  private async listId(): Promise<string> {
    // Memoised so a burst of adds does not issue a lookup each time.
    this.listIdPromise ??= (async () => {
      const { data, error } = await this.client
        .from('shopping_lists')
        .select('id')
        .eq('user_id', this.userId)
        .eq('is_default', true)
        .maybeSingle();

      if (error) throw toAppError(error, 'database');
      if (data) return data.id;

      const { data: created, error: createError } = await this.client
        .from('shopping_lists')
        .insert({ user_id: this.userId, name: 'My list', is_default: true })
        .select('id')
        .single();

      if (createError) throw toAppError(createError, 'database');
      return created.id;
    })();

    try {
      return await this.listIdPromise;
    } catch (error) {
      // Do not memoise a failure; the next call should retry.
      this.listIdPromise = null;
      throw error;
    }
  }

  private toDomain(row: ShoppingListItemRow): ShoppingListItem {
    return {
      id: row.id,
      listId: row.list_id,
      ingredientId: row.ingredient_id,
      name: row.name,
      quantity: row.quantity,
      unit: row.unit,
      category: row.category,
      isChecked: row.is_checked,
      sourceRecipeIds: row.source_recipe_ids ?? [],
      estimatedCost: null,
      supermarketId: row.supermarket_id,
      storeProductId: row.store_product_id,
      sku: row.sku,
      livePriceMinor: row.live_price_minor,
      availability: row.availability,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(): Promise<ShoppingListItem[]> {
    const listId = await this.listId();
    const { data, error } = await this.client
      .from('shopping_list_items')
      .select('*')
      .eq('list_id', listId)
      .order('is_checked', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw toAppError(error, 'database');
    return (data ?? []).map((row) => this.toDomain(row));
  }

  async add(input: AddShoppingItemInput): Promise<ShoppingListItem> {
    const listId = await this.listId();
    const resolved = resolveIngredient(input.name);
    const name = resolved?.name ?? input.name.trim();
    const key = normaliseIngredientName(name);

    const { data: existingRows, error: readError } = await this.client
      .from('shopping_list_items')
      .select('*')
      .eq('list_id', listId);

    if (readError) throw toAppError(readError, 'database');

    const existing = (existingRows ?? []).find(
      (row) => normaliseIngredientName(row.name) === key,
    );

    if (existing) {
      const merged = mergeQuantities(
        { quantity: existing.quantity, unit: existing.unit, name: existing.name },
        { quantity: input.quantity ?? null, unit: input.unit ?? null },
      );
      const sources = new Set(existing.source_recipe_ids ?? []);
      if (input.sourceRecipeId) sources.add(input.sourceRecipeId);

      const { data, error } = await this.client
        .from('shopping_list_items')
        .update({
          quantity: merged.quantity,
          unit: merged.unit,
          source_recipe_ids: [...sources],
          // Re-adding something already ticked off means it is needed again.
          is_checked: false,
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) throw toAppError(error, 'database');
      return this.toDomain(data);
    }

    const { data, error } = await this.client
      .from('shopping_list_items')
      .insert({
        list_id: listId,
        ingredient_id: null,
        name,
        quantity: input.quantity ?? null,
        unit: input.unit ?? resolved?.defaultUnit ?? null,
        category: input.category ?? resolved?.category ?? 'other',
        is_checked: false,
        source_recipe_ids: input.sourceRecipeId ? [input.sourceRecipeId] : [],
        supermarket_id: null,
        store_product_id: null,
        sku: null,
        live_price_minor: null,
        availability: null,
      })
      .select('*')
      .single();

    if (error) throw toAppError(error, 'database');
    return this.toDomain(data);
  }

  async addMany(inputs: readonly AddShoppingItemInput[]): Promise<ShoppingListItem[]> {
    const results: ShoppingListItem[] = [];
    // Sequential: each add must observe the merged state of the previous one.
    for (const input of inputs) {
      results.push(await this.add(input));
    }
    return results;
  }

  async setChecked(id: string, isChecked: boolean): Promise<void> {
    const { error } = await this.client
      .from('shopping_list_items')
      .update({ is_checked: isChecked })
      .eq('id', id);
    if (error) throw toAppError(error, 'database');
  }

  async update(id: string, patch: Partial<ShoppingListItem>): Promise<ShoppingListItem | null> {
    const payload: Partial<ShoppingListItemRow> = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.quantity !== undefined) payload.quantity = patch.quantity;
    if (patch.unit !== undefined) payload.unit = patch.unit;
    if (patch.category !== undefined) payload.category = patch.category;
    if (patch.isChecked !== undefined) payload.is_checked = patch.isChecked;

    if (Object.keys(payload).length === 0) return null;

    const { data, error } = await this.client
      .from('shopping_list_items')
      .update(payload)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) throw toAppError(error, 'database');
    return data ? this.toDomain(data) : null;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from('shopping_list_items').delete().eq('id', id);
    if (error) throw toAppError(error, 'database');
  }

  async clearChecked(): Promise<void> {
    const listId = await this.listId();
    const { error } = await this.client
      .from('shopping_list_items')
      .delete()
      .eq('list_id', listId)
      .eq('is_checked', true);
    if (error) throw toAppError(error, 'database');
  }

  async clear(): Promise<void> {
    const listId = await this.listId();
    const { error } = await this.client
      .from('shopping_list_items')
      .delete()
      .eq('list_id', listId);
    if (error) throw toAppError(error, 'database');
  }
}
