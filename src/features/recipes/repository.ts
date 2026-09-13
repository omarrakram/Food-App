import { LocalCollection, LocalCollectionKeys } from '@/lib/storage/local-collection';
import type { Recipe } from '@/types/domain';

import { RECIPE_FIXTURES, RECIPES_BY_ID } from './fixtures';
import { applyPlanLocally, pageLocally, type QueryPlan, type RecipePage } from './query';

/**
 * Recipe access.
 *
 * V1 reads from the bundled curated set plus a local cache of AI-generated
 * recipes. Once the database is provisioned, `SupabaseRecipeRepository`
 * (Phase 3) fetches curated recipes from Postgres with the bundled set as the
 * offline fallback — the interface below is what keeps that swap contained.
 */

export interface RecipeRepository {
  /** All recipes available for local ranking. */
  catalogue(): Promise<Recipe[]>;
  byId(id: string): Promise<Recipe | null>;
  /**
   * One page of recipes matching a query plan.
   *
   * The database implementation pushes the plan into SQL; the local one runs
   * the identical plan over the bundle. Both are paginated, because a screen
   * that renders 150 cards is slow whether the rows came from Postgres or a
   * JavaScript array.
   */
  search(plan: QueryPlan): Promise<RecipePage>;
  /** Persists AI-generated recipes so their detail pages resolve later. */
  cacheGenerated(recipes: readonly Recipe[]): Promise<void>;
}

/** Cap on cached AI recipes so storage cannot grow without bound. */
const AI_CACHE_LIMIT = 60;

export class LocalRecipeRepository implements RecipeRepository {
  private readonly generated = new LocalCollection<Recipe>(LocalCollectionKeys.aiRecipes);

  async catalogue(): Promise<Recipe[]> {
    const cached = await this.generated.list();
    return [...RECIPE_FIXTURES, ...cached];
  }

  async byId(id: string): Promise<Recipe | null> {
    const curated = RECIPES_BY_ID.get(id);
    if (curated) return curated;
    const cached = await this.generated.list();
    return cached.find((recipe) => recipe.id === id) ?? null;
  }

  async search(plan: QueryPlan): Promise<RecipePage> {
    const all = await this.catalogue();
    return pageLocally(applyPlanLocally(all, plan), plan);
  }

  async cacheGenerated(recipes: readonly Recipe[]): Promise<void> {
    if (recipes.length === 0) return;
    const existing = await this.generated.list();
    const byId = new Map(existing.map((recipe) => [recipe.id, recipe]));
    for (const recipe of recipes) byId.set(recipe.id, recipe);

    const all = [...byId.values()];
    const trimmed = all.length > AI_CACHE_LIMIT ? all.slice(all.length - AI_CACHE_LIMIT) : all;
    await this.generated.replaceAll(trimmed);
  }
}

/** Shared instance — the local cache has no per-user state. */
export const localRecipeRepository = new LocalRecipeRepository();

/** Recipes carrying a Discover collection tag. */
export function recipesWithTag(recipes: readonly Recipe[], tag: string): Recipe[] {
  return recipes.filter((recipe) => recipe.tags.includes(tag));
}
