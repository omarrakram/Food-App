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
    // `saved_recipes.recipe_id` is a foreign key, so the recipe has to exist
    // before it can be saved. A curated recipe always does; a generated one
    // only lives in the local cache, so saving it used to fail on the
    // constraint — and a guest's generated recipes were dropped at sign-in for
    // the same reason.
    if (recipe.source !== 'curated') {
      await this.ensureRecipeRow(recipe);
    }

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

  /**
   * Writes a generated recipe the caller owns, so it can be referenced.
   *
   * Ownership and visibility are not negotiable here: `created_by` is the
   * caller and `is_public` is false, which is what RLS requires of a
   * user-owned row. A client cannot publish into anyone else's Discover feed
   * by saving a recipe.
   *
   * Idempotent by primary key — the recipe id is a deterministic UUIDv5 of its
   * content, so re-saving the same generated recipe updates rather than
   * duplicates.
   */
  private async ensureRecipeRow(recipe: Recipe): Promise<void> {
    const { error: recipeError } = await this.client.from('recipes').upsert(
      {
        id: recipe.id,
        slug: null,
        title: recipe.title,
        description: recipe.description,
        image_url: recipe.imageUrl,
        source: recipe.source,
        cuisine: recipe.cuisine,
        difficulty: recipe.difficulty,
        prep_minutes: recipe.prepMinutes,
        cook_minutes: recipe.cookMinutes,
        base_servings: recipe.baseServings,
        calories: recipe.nutrition.calories,
        protein_g: recipe.nutrition.proteinGrams,
        carbs_g: recipe.nutrition.carbsGrams,
        fat_g: recipe.nutrition.fatGrams,
        fiber_g: recipe.nutrition.fiberGrams,
        created_by: this.userId,
        is_public: false,
      },
      { onConflict: 'id' },
    );
    if (recipeError) throw toAppError(recipeError, 'database');

    // Children are replaced wholesale rather than diffed: the recipe is
    // immutable content addressed by its id, so there is nothing to merge.
    await this.client.from('recipe_ingredients').delete().eq('recipe_id', recipe.id);
    await this.client.from('recipe_steps').delete().eq('recipe_id', recipe.id);
    await this.client.from('recipe_allergens').delete().eq('recipe_id', recipe.id);

    if (recipe.ingredients.length > 0) {
      const { error } = await this.client.from('recipe_ingredients').insert(
        recipe.ingredients.map((ingredient, index) => ({
          recipe_id: recipe.id,
          ingredient_id: ingredient.ingredientId,
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          preparation: ingredient.preparation,
          is_optional: ingredient.isOptional,
          sort_order: ingredient.sortOrder || index,
        })),
      );
      if (error) throw toAppError(error, 'database');
    }

    if (recipe.steps.length > 0) {
      const { error } = await this.client.from('recipe_steps').insert(
        recipe.steps.map((step, index) => ({
          recipe_id: recipe.id,
          step_number: step.stepNumber || index + 1,
          instruction: step.instruction,
          duration_minutes: step.durationMinutes,
          safety_note: step.safetyNote,
          ingredient_refs: step.ingredientRefs,
        })),
      );
      if (error) throw toAppError(error, 'database');
    }

    // SAFETY-CRITICAL: the allergen rows drive the hard exclusion, so a
    // generated recipe that loses them would stop being filtered.
    if (recipe.allergens.length > 0) {
      const { error } = await this.client
        .from('recipe_allergens')
        .insert(recipe.allergens.map((allergen) => ({ recipe_id: recipe.id, allergen })));
      if (error) throw toAppError(error, 'database');
    }
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
