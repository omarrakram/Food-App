import {
  LocalCollection,
  LocalCollectionKeys,
  newId,
  nowISO,
} from '@/lib/storage/local-collection';
import type { Recipe } from '@/types/domain';

/**
 * Saved recipes and interaction history.
 *
 * History powers "recently viewed" / "cooked", and later feeds ranking. It is
 * strictly opt-out: when `personalisationEnabled` is false the hooks stop
 * recording, and clearing history is a single call.
 */

export type SavedRecipe = {
  id: string;
  recipeId: string;
  /** Snapshot so a saved AI recipe survives even if it is never persisted. */
  recipe: Recipe;
  savedAt: string;
};

export type HistoryKind = 'viewed' | 'cooked' | 'disliked';

export type HistoryEntry = {
  id: string;
  recipeId: string;
  recipe: Recipe;
  kind: HistoryKind;
  occurredAt: string;
};

export interface SavedRepository {
  list(): Promise<SavedRecipe[]>;
  isSaved(recipeId: string): Promise<boolean>;
  save(recipe: Recipe): Promise<SavedRecipe>;
  unsave(recipeId: string): Promise<void>;
  clear(): Promise<void>;
}

export interface HistoryRepository {
  list(kind: HistoryKind): Promise<HistoryEntry[]>;
  record(recipe: Recipe, kind: HistoryKind): Promise<void>;
  clear(): Promise<void>;
}

/** Cap on stored history rows, oldest evicted first. */
const HISTORY_LIMIT = 100;

export class LocalSavedRepository implements SavedRepository {
  private readonly collection = new LocalCollection<SavedRecipe>(LocalCollectionKeys.saved);

  async list(): Promise<SavedRecipe[]> {
    const items = await this.collection.list();
    return items.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  async isSaved(recipeId: string): Promise<boolean> {
    const items = await this.collection.list();
    return items.some((item) => item.recipeId === recipeId);
  }

  async save(recipe: Recipe): Promise<SavedRecipe> {
    const items = await this.collection.list();
    const existing = items.find((item) => item.recipeId === recipe.id);
    if (existing) return existing;

    return this.collection.insert({
      id: newId(),
      recipeId: recipe.id,
      recipe,
      savedAt: nowISO(),
    });
  }

  async unsave(recipeId: string): Promise<void> {
    const items = await this.collection.list();
    const match = items.find((item) => item.recipeId === recipeId);
    if (match) await this.collection.remove(match.id);
  }

  async clear(): Promise<void> {
    await this.collection.clear();
  }
}

export class LocalHistoryRepository implements HistoryRepository {
  private readonly collection = new LocalCollection<HistoryEntry>(LocalCollectionKeys.history);

  async list(kind: HistoryKind): Promise<HistoryEntry[]> {
    const items = await this.collection.list();
    return items
      .filter((item) => item.kind === kind)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  async record(recipe: Recipe, kind: HistoryKind): Promise<void> {
    const items = await this.collection.list();

    // Collapse repeat views of the same recipe into one, most-recent entry.
    const withoutDuplicate = items.filter(
      (item) => !(item.recipeId === recipe.id && item.kind === kind),
    );

    const next: HistoryEntry[] = [
      ...withoutDuplicate,
      { id: newId(), recipeId: recipe.id, recipe, kind, occurredAt: nowISO() },
    ];

    const trimmed =
      next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;

    await this.collection.replaceAll(trimmed);
  }

  async clear(): Promise<void> {
    await this.collection.clear();
  }
}
