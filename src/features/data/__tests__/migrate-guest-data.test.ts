import AsyncStorage from '@react-native-async-storage/async-storage';

import { LocalPantryRepository } from '@/features/pantry/repository';
import {
  LocalHistoryRepository,
  LocalSavedRepository,
  type HistoryKind,
  type HistoryRepository,
  type SavedRepository,
} from '@/features/saved/repository';
import { LocalShoppingRepository } from '@/features/shopping/repository';
import type { CreatePantryInput, PantryRepository } from '@/features/pantry/repository';
import type {
  AddShoppingItemInput,
  ShoppingRepository,
} from '@/features/shopping/repository';
import { makeRecipe } from '@/test-utils/factories';
import type { Recipe } from '@/types/domain';

import { migrateGuestData, type MigrationTargets } from '../migrate-guest-data';

/**
 * Guest → account migration.
 *
 * Someone who has built a pantry, saved recipes and cooked a few things while
 * signed out is exactly the person about to create an account. Losing their
 * work at that moment is the worst possible time for it, so the properties
 * here are about not losing and not duplicating — never about speed.
 */

const USER = 'user-1';

/**
 * Recording targets. Deliberately not the Supabase repositories: what is under
 * test is which local data gets carried across and in what order, not how
 * Postgres stores it.
 */
function makeTargets() {
  const pantry: { ingredientName: string }[] = [];
  const saved: Recipe[] = [];
  const shopping: { name: string }[] = [];
  const history: { recipeId: string; kind: HistoryKind }[] = [];

  const targets: MigrationTargets = {
    pantry: {
      list: async () => [],
      add: async (input: CreatePantryInput) => {
        pantry.push({ ingredientName: input.ingredientName });
        return null as never;
      },
      update: async () => null,
      remove: async () => {},
      clear: async () => {},
    } as unknown as PantryRepository,
    saved: {
      list: async () => [],
      isSaved: async () => false,
      save: async (recipe: Recipe) => {
        saved.push(recipe);
        return null as never;
      },
      unsave: async () => {},
      clear: async () => {},
    } as unknown as SavedRepository,
    shopping: {
      list: async () => [],
      add: async () => null as never,
      addMany: async (inputs: readonly AddShoppingItemInput[]) => {
        for (const input of inputs) shopping.push({ name: input.name });
        return [];
      },
      setChecked: async () => {},
      update: async () => null,
      remove: async () => {},
      clearChecked: async () => {},
      clear: async () => {},
    } as unknown as ShoppingRepository,
    history: {
      list: async () => [],
      record: async (recipe: Recipe, kind: HistoryKind) => {
        history.push({ recipeId: recipe.id, kind });
      },
      clear: async () => {},
    } as unknown as HistoryRepository,
  };

  return { targets, pantry, saved, shopping, history };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('does nothing, and says so, when the guest built nothing', async () => {
  const { targets, pantry, saved, shopping, history } = makeTargets();

  const result = await migrateGuestData(USER, targets);

  expect(result.migrated).toBe(false);
  expect([pantry, saved, shopping, history].every((list) => list.length === 0)).toBe(true);
});

it('carries the pantry, saved recipes, shopping list and history across', async () => {
  const localPantry = new LocalPantryRepository();
  const localSaved = new LocalSavedRepository();
  const localShopping = new LocalShoppingRepository();
  const localHistory = new LocalHistoryRepository();

  await localPantry.add({ ingredientName: 'tomatoes', quantity: 3, unit: 'piece' });
  await localSaved.save(makeRecipe({ id: 'recipe-saved', slug: 'saved-one' }));
  await localShopping.add({ name: 'olive oil' });
  await localHistory.record(makeRecipe({ id: 'recipe-cooked', slug: 'cooked-one' }), 'cooked');
  await localHistory.record(makeRecipe({ id: 'recipe-seen', slug: 'seen-one' }), 'viewed');

  const { targets, pantry, saved, shopping, history } = makeTargets();
  const result = await migrateGuestData(USER, targets);

  expect(result).toMatchObject({
    migrated: true,
    pantryItems: 1,
    savedRecipes: 1,
    shoppingItems: 1,
    historyEntries: 2,
  });
  expect(pantry.map((item) => item.ingredientName)).toEqual(['tomatoes']);
  expect(saved.map((recipe) => recipe.id)).toEqual(['recipe-saved']);
  expect(shopping.map((item) => item.name)).toEqual(['olive oil']);
  expect(history).toEqual([
    { recipeId: 'recipe-cooked', kind: 'cooked' },
    { recipeId: 'recipe-seen', kind: 'viewed' },
  ]);
});

it('carries history even when nothing else was built', async () => {
  // REGRESSION: the migration only looked at pantry, saved and shopping, so a
  // guest who had cooked their way through a dozen recipes and saved none
  // signed up and found both Saved tabs empty. The early "nothing to do" exit
  // fired before history was ever considered.
  const localHistory = new LocalHistoryRepository();
  await localHistory.record(makeRecipe({ id: 'recipe-cooked' }), 'cooked');

  const { targets, history } = makeTargets();
  const result = await migrateGuestData(USER, targets);

  expect(result.migrated).toBe(true);
  expect(history).toEqual([{ recipeId: 'recipe-cooked', kind: 'cooked' }]);
});

it('leaves dislikes behind', async () => {
  // A dislike feeds ranking rather than a screen. Re-learning one costs the
  // user nothing; carrying a wrong one across quietly suppresses recipes.
  const localHistory = new LocalHistoryRepository();
  await localHistory.record(makeRecipe({ id: 'recipe-disliked' }), 'disliked');

  const { targets, history } = makeTargets();
  const result = await migrateGuestData(USER, targets);

  expect(result.migrated).toBe(false);
  expect(history).toEqual([]);
});

it('does not run twice for the same user', async () => {
  const localPantry = new LocalPantryRepository();
  await localPantry.add({ ingredientName: 'rice', quantity: 1, unit: 'kg' });

  const first = makeTargets();
  await migrateGuestData(USER, first.targets);
  expect(first.pantry).toHaveLength(1);

  const second = makeTargets();
  const result = await migrateGuestData(USER, second.targets);
  expect(result.migrated).toBe(false);
  expect(second.pantry).toEqual([]);
});

it('clears the local copies only after every write has succeeded', async () => {
  const localPantry = new LocalPantryRepository();
  await localPantry.add({ ingredientName: 'lentils', quantity: 500, unit: 'g' });

  const { targets } = makeTargets();
  targets.pantry.add = async () => {
    throw new Error('network died mid-migration');
  };

  const result = await migrateGuestData(USER, targets);

  expect(result.migrated).toBe(false);
  // The guest still has their pantry, and the marker was never set, so the
  // next launch tries again. Losing it here would be unrecoverable.
  expect(await localPantry.list()).toHaveLength(1);

  const retry = makeTargets();
  const second = await migrateGuestData(USER, retry.targets);
  expect(second.migrated).toBe(true);
  expect(retry.pantry).toHaveLength(1);
});
