import type { SupabaseClient } from '@supabase/supabase-js';

import { toAppError } from '@/lib/errors';
import { logWarn } from '@/lib/logger';
import type { Database } from '@/lib/supabase/database.types';
import type { Recipe } from '@/types/domain';

import { RECIPE_FIXTURES } from './fixtures';
import { rowsToRecipe, RECIPE_SELECT, type RecipeQueryRow } from './mapper';
import { LocalRecipeRepository, type RecipeRepository } from './repository';

/**
 * Supabase-backed recipe access.
 *
 * Falls back to the bundled catalogue when the network is unavailable, so
 * "what can I cook?" keeps working on a train. AI-generated recipes are still
 * cached locally by the local repository, because a generated recipe belongs to
 * the request that produced it and is only persisted server-side once saved.
 */
export class SupabaseRecipeRepository implements RecipeRepository {
  private readonly local = new LocalRecipeRepository();

  constructor(private readonly client: SupabaseClient<Database>) {}

  async catalogue(): Promise<Recipe[]> {
    const generated = await this.local.catalogue().then((all) =>
      // Strip the bundled fixtures back out; only the AI cache is wanted here.
      all.filter((recipe) => !RECIPE_FIXTURES.some((fixture) => fixture.id === recipe.id)),
    );

    const { data, error } = await this.client
      .from('recipes')
      .select(RECIPE_SELECT)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      // Degrade rather than fail: the bundled set is a complete, if smaller,
      // catalogue and the ranking engine does not care where recipes came from.
      logWarn('recipe_catalogue_fallback', { reason: 'query_failed' });
      return [...RECIPE_FIXTURES, ...generated];
    }

    const remote = (data ?? []).map((row) => rowsToRecipe(row as unknown as RecipeQueryRow));
    if (remote.length === 0) {
      logWarn('recipe_catalogue_fallback', { reason: 'empty' });
      return [...RECIPE_FIXTURES, ...generated];
    }

    return [...remote, ...generated];
  }

  async byId(id: string): Promise<Recipe | null> {
    const { data, error } = await this.client
      .from('recipes')
      .select(RECIPE_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      // A generated recipe from this session lives only in the local cache.
      const cached = await this.local.byId(id);
      if (cached) return cached;
      throw toAppError(error, 'not_found');
    }

    if (data) return rowsToRecipe(data as unknown as RecipeQueryRow);
    return this.local.byId(id);
  }

  async cacheGenerated(recipes: readonly Recipe[]): Promise<void> {
    await this.local.cacheGenerated(recipes);
  }
}
