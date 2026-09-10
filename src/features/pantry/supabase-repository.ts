import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveIngredient } from '@/features/ingredients/matching';
import type { Database, PantryItemRow } from '@/lib/supabase/database.types';
import { toAppError } from '@/lib/errors';
import type { PantryItem } from '@/types/domain';

import type { CreatePantryInput, PantryRepository, UpdatePantryInput } from './repository';

/**
 * Supabase-backed pantry.
 *
 * Mirrors `LocalPantryRepository` exactly, including the merge-on-duplicate
 * behaviour, so switching between guest and signed-in changes nothing the UI
 * can observe.
 *
 * `user_id` is written explicitly because RLS checks it on insert; the row is
 * rejected if it does not match the caller's JWT, so a client bug cannot write
 * into someone else's pantry.
 */
export class SupabasePantryRepository implements PantryRepository {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  private toDomain(row: PantryItemRow): PantryItem {
    return {
      id: row.id,
      userId: row.user_id,
      ingredientId: row.ingredient_id ?? '',
      ingredientName: row.ingredient_name,
      category: row.category,
      quantity: row.quantity,
      unit: row.unit,
      expiresOn: row.expires_on,
      isStaple: row.is_staple,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(): Promise<PantryItem[]> {
    const { data, error } = await this.client
      .from('pantry_items')
      .select('*')
      .order('ingredient_name', { ascending: true });

    if (error) throw toAppError(error, 'database');
    return (data ?? []).map((row) => this.toDomain(row));
  }

  async add(input: CreatePantryInput): Promise<PantryItem> {
    const resolved = resolveIngredient(input.ingredientName);
    const name = resolved?.name ?? input.ingredientName.trim();

    // The unique index on (user_id, lower(ingredient_name)) makes "add the same
    // thing twice" an update rather than a duplicate row — matching the local
    // repository and what a user expects.
    const { data: existing } = await this.client
      .from('pantry_items')
      .select('*')
      .eq('user_id', this.userId)
      .ilike('ingredient_name', name)
      .maybeSingle();

    if (existing) {
      return (
        (await this.update(existing.id, {
          quantity:
            input.quantity !== undefined && input.quantity !== null
              ? (existing.quantity ?? 0) + input.quantity
              : existing.quantity,
          unit: input.unit ?? existing.unit,
          expiresOn: input.expiresOn ?? existing.expires_on,
          isStaple: input.isStaple ?? existing.is_staple,
        })) ?? this.toDomain(existing)
      );
    }

    const { data, error } = await this.client
      .from('pantry_items')
      .insert({
        user_id: this.userId,
        ingredient_id: null,
        ingredient_name: name,
        category: input.category ?? resolved?.category ?? 'other',
        quantity: input.quantity ?? null,
        unit: input.unit ?? resolved?.defaultUnit ?? null,
        expires_on: input.expiresOn ?? null,
        is_staple: input.isStaple ?? resolved?.isCommonStaple ?? false,
        note: input.note ?? null,
      })
      .select('*')
      .single();

    if (error) throw toAppError(error, 'database');
    return this.toDomain(data);
  }

  async update(id: string, patch: UpdatePantryInput): Promise<PantryItem | null> {
    // Built key-by-key so an `undefined` in the patch means "leave alone",
    // while an explicit `null` clears the column.
    const payload: Partial<PantryItemRow> = {};
    if (patch.ingredientName !== undefined) payload.ingredient_name = patch.ingredientName;
    if (patch.category !== undefined) payload.category = patch.category;
    if (patch.quantity !== undefined) payload.quantity = patch.quantity;
    if (patch.unit !== undefined) payload.unit = patch.unit;
    if (patch.expiresOn !== undefined) payload.expires_on = patch.expiresOn;
    if (patch.isStaple !== undefined) payload.is_staple = patch.isStaple;
    if (patch.note !== undefined) payload.note = patch.note;

    if (Object.keys(payload).length === 0) return null;

    const { data, error } = await this.client
      .from('pantry_items')
      .update(payload)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) throw toAppError(error, 'database');
    return data ? this.toDomain(data) : null;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from('pantry_items').delete().eq('id', id);
    if (error) throw toAppError(error, 'database');
  }

  async clear(): Promise<void> {
    const { error } = await this.client
      .from('pantry_items')
      .delete()
      .eq('user_id', this.userId);
    if (error) throw toAppError(error, 'database');
  }
}
