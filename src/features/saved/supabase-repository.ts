import type { SupabaseClient } from '@supabase/supabase-js';

import { toAppError } from '@/lib/errors';
import type { Database } from '@/lib/supabase/database.types';
import { rowsToRecipe, RECIPE_SELECT, type RecipeQueryRow } from '@/features/recipes/mapper';
import type { Recipe } from '@/types/domain';

import type {
  HistoryEntry,
  HistoryKind,
  HistoryRepository,
  SavedRecipe,
  SavedRepository,
} from './repository';

/**
 * Supabase-backed saved recipes.
 *
 * A saved row is a foreign key, not a snapshot: the recipe is joined on read so
 * a corrected recipe is corrected everywhere. (The local repository stores a
 * snapshot because a guest has no `recipes` table to point at.)
 */
export class SupabaseSavedRepository implements SavedRepository {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async list(): Promise<SavedRecipe[]> {
    const { data, error } = await this.client
      .from('saved_recipes')
      .select(`id, recipe_id, created_at, recipes (${RECIPE_SELECT})`)
      .order('created_at', { ascending: false });

    if (error) throw toAppError(error, 'database');

    return (data ?? [])
      .map((row) => {
        const recipeRow = row.recipes as unknown as RecipeQueryRow | null;
        if (!recipeRow) return null;
        return {
          id: row.id,
          recipeId: row.recipe_id,
          recipe: rowsToRecipe(recipeRow),
          savedAt: row.created_at,
        } satisfies SavedRecipe;
      })
      .filter((entry): entry is SavedRecipe => entry !== null);
  }

  async isSaved(recipeId: string): Promise<boolean> {
    const { count, error } = await this.client
      .from('saved_recipes')
      .select('id', { count: 'exact', head: true })
      .eq('recipe_id', recipeId);

    if (error) throw toAppError(error, 'database');
    return (count ?? 0) > 0;
  }

  async save(recipe: Recipe): Promise<SavedRecipe> {
    const { data, error } = await this.client
      .from('saved_recipes')
      .upsert(
        { user_id: this.userId, recipe_id: recipe.id },
        { onConflict: 'user_id,recipe_id', ignoreDuplicates: false },
      )
      .select('id, recipe_id, created_at')
      .single();

    if (error) throw toAppError(error, 'database');
    return { id: data.id, recipeId: data.recipe_id, recipe, savedAt: data.created_at };
  }

  async unsave(recipeId: string): Promise<void> {
    const { error } = await this.client
      .from('saved_recipes')
      .delete()
      .eq('recipe_id', recipeId)
      .eq('user_id', this.userId);

    if (error) throw toAppError(error, 'database');
  }

  async clear(): Promise<void> {
    const { error } = await this.client
      .from('saved_recipes')
      .delete()
      .eq('user_id', this.userId);
    if (error) throw toAppError(error, 'database');
  }
}

/** Rows kept per kind; the oldest are pruned server-side by a scheduled job. */
const HISTORY_PAGE = 50;

export class SupabaseHistoryRepository implements HistoryRepository {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async list(kind: HistoryKind): Promise<HistoryEntry[]> {
    const { data, error } = await this.client
      .from('recipe_history')
      .select(`id, recipe_id, kind, occurred_at, recipes (${RECIPE_SELECT})`)
      .eq('kind', kind)
      .order('occurred_at', { ascending: false })
      .limit(HISTORY_PAGE);

    if (error) throw toAppError(error, 'database');

    return (data ?? [])
      .map((row) => {
        const recipeRow = row.recipes as unknown as RecipeQueryRow | null;
        if (!recipeRow) return null;
        return {
          id: row.id,
          recipeId: row.recipe_id,
          recipe: rowsToRecipe(recipeRow),
          kind: row.kind,
          occurredAt: row.occurred_at,
        } satisfies HistoryEntry;
      })
      .filter((entry): entry is HistoryEntry => entry !== null);
  }

  async record(recipe: Recipe, kind: HistoryKind): Promise<void> {
    // The unique (user_id, recipe_id, kind) index collapses repeat views into a
    // single most-recent row.
    const { error } = await this.client.from('recipe_history').upsert(
      {
        user_id: this.userId,
        recipe_id: recipe.id,
        kind,
        occurred_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,recipe_id,kind' },
    );

    if (error) throw toAppError(error, 'database');
  }

  async clear(): Promise<void> {
    // Uses the SECURITY INVOKER function so the delete is scoped by RLS rather
    // than by a client-supplied user id.
    const { error } = await this.client.rpc('clear_own_history');
    if (error) throw toAppError(error, 'database');
  }
}
