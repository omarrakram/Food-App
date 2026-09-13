import type { SupabaseClient } from '@supabase/supabase-js';

import { toAppError } from '@/lib/errors';
import { logWarn } from '@/lib/logger';
import type { Database } from '@/lib/supabase/database.types';
import type { Cuisine, Recipe } from '@/types/domain';

import { RECIPE_FIXTURES } from './fixtures';
import { rowsToRecipe, RECIPE_SELECT, type RecipeQueryRow } from './mapper';
import {
  applyPlanLocally,
  decodeCursor,
  encodeCursor,
  pageLocally,
  type QueryPlan,
  type RecipePage,
} from './query';
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

  /**
   * One page of recipes matching a plan, filtered in the database.
   *
   * Every clause below rides an index added by the catalogue-expansion
   * migration: cuisine, difficulty, total time, the facet tables' value
   * columns, and `recipe_ingredients.slug` for inclusion and exclusion.
   *
   * The exclusion clauses are the interesting ones. PostgREST cannot express
   * "no child row matches" directly, so they are `not.in` against a subquery
   * of offending recipe ids, resolved first. Two round trips beats reading the
   * whole table, and the client-side safety filter runs on the result either
   * way — this narrows, it does not protect.
   */
  async search(plan: QueryPlan): Promise<RecipePage> {
    try {
      const blocked = await this.blockedRecipeIds(plan);

      let query = this.client
        .from('recipes')
        .select(RECIPE_SELECT)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(plan.limit + 1);

      if (plan.cuisine) query = query.eq('cuisine', plan.cuisine as Cuisine);
      if (plan.maxTotalMinutes !== null) {
        query = query.lte('total_minutes', plan.maxTotalMinutes);
      }
      if (plan.maxCalories !== null) query = query.lte('calories', plan.maxCalories);
      if (plan.minProteinGrams !== null) query = query.gte('protein_g', plan.minProteinGrams);
      if (plan.search) {
        // Trigram indexes on both title columns; `or` keeps it one scan.
        const escaped = plan.search.replace(/[%,()]/g, ' ').trim();
        if (escaped) query = query.or(`title.ilike.%${escaped}%,title_ar.ilike.%${escaped}%`);
      }
      if (plan.mealType) {
        query = query.in('id', await this.idsWithFacet('recipe_meal_types', 'meal_type', [plan.mealType]));
      }
      for (const diet of plan.dietTags) {
        query = query.in('id', await this.idsWithFacet('recipe_diet_tags', 'diet', [diet]));
      }
      for (const tag of plan.tags) {
        query = query.in('id', await this.idsWithFacet('recipe_tags', 'tag', [tag]));
      }
      for (const slug of plan.requireSlugs) {
        query = query.in('id', await this.idsWithIngredient([slug]));
      }
      if (blocked.length > 0) query = query.not('id', 'in', `(${blocked.join(',')})`);

      const after = decodeCursor(plan.cursor);
      if (after) {
        // Keyset pagination: strictly after (created_at, id) in the same order
        // the query is sorted by, so a recipe approved mid-scroll cannot make
        // the user see a row twice or skip one.
        query = query.or(
          `created_at.lt.${after.createdAt},and(created_at.eq.${after.createdAt},id.lt.${after.id})`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []).map((row) => rowsToRecipe(row as unknown as RecipeQueryRow));
      const hasMore = rows.length > plan.limit;
      const page = hasMore ? rows.slice(0, plan.limit) : rows;
      const last = page[page.length - 1];

      return {
        recipes: page,
        nextCursor: hasMore && last ? encodeCursor(last) : null,
        isFallback: false,
      };
    } catch {
      // Degrade to the bundle rather than showing an error page: a complete,
      // smaller catalogue is a better answer than none.
      logWarn('recipe_search_fallback', { reason: 'query_failed' });
      return { ...pageLocally(applyPlanLocally(RECIPE_FIXTURES, plan), plan), isFallback: true };
    }
  }

  /** Recipe ids carrying an excluded allergen, ingredient or appliance. */
  private async blockedRecipeIds(plan: QueryPlan): Promise<string[]> {
    const blocked = new Set<string>();

    if (plan.excludeAllergens.length > 0) {
      for (const id of await this.idsWithFacet(
        'recipe_allergens',
        'allergen',
        plan.excludeAllergens,
      )) {
        blocked.add(id);
      }
    }

    if (plan.excludeSlugs.length > 0) {
      for (const id of await this.idsWithIngredient(plan.excludeSlugs)) blocked.add(id);
    }

    if (plan.allowedAppliances.length > 0) {
      const { data } = await this.client
        .from('recipe_appliances')
        .select('recipe_id, appliance')
        .not('appliance', 'in', `(${plan.allowedAppliances.join(',')})`)
        .limit(FACET_SCAN_LIMIT);
      for (const row of data ?? []) blocked.add((row as { recipe_id: string }).recipe_id);
    }

    return [...blocked];
  }

  private async idsWithFacet(
    table: 'recipe_meal_types' | 'recipe_diet_tags' | 'recipe_allergens' | 'recipe_tags',
    column: string,
    values: readonly string[],
  ): Promise<string[]> {
    const { data } = await this.client
      .from(table)
      .select('recipe_id')
      .in(column, values as string[])
      .limit(FACET_SCAN_LIMIT);
    return (data ?? []).map((row) => (row as { recipe_id: string }).recipe_id);
  }

  private async idsWithIngredient(slugs: readonly string[]): Promise<string[]> {
    const { data } = await this.client
      .from('recipe_ingredients')
      .select('recipe_id')
      .in('slug', slugs as string[])
      .limit(FACET_SCAN_LIMIT);
    return (data ?? []).map((row) => (row as { recipe_id: string }).recipe_id);
  }
}

/**
 * Ceiling on a facet id scan.
 *
 * These return ids, not rows, so the payload is small — but an unbounded query
 * against a growing table is a latency cliff waiting to happen. Above this the
 * result is incomplete, which is safe in both directions: an incomplete
 * exclusion list is re-checked client-side, and an incomplete inclusion list
 * only under-fetches a page.
 */
const FACET_SCAN_LIMIT = 5000;
