import type { PantryRepository } from '@/features/pantry/repository';
import type { LocalSavedRepository, SavedRepository } from '@/features/saved/repository';
import type { ShoppingRepository } from '@/features/shopping/repository';
import { LocalPantryRepository } from '@/features/pantry/repository';
import { LocalSavedRepository as LocalSaved } from '@/features/saved/repository';
import { LocalShoppingRepository } from '@/features/shopping/repository';
import { logError, logInfo } from '@/lib/logger';
import { getItem, setItem, StorageKeys } from '@/lib/storage';

/**
 * Copies a guest's local data to the server on their first sign-in.
 *
 * The app is usable signed out, so by the time someone creates an account they
 * may already have a pantry, saved recipes and a shopping list. Losing that at
 * the moment they commit to the product would be the worst possible time.
 *
 * Properties that matter:
 *  - **Idempotent.** A per-user marker means a second sign-in does not
 *    duplicate rows, and the remote repositories merge by name anyway.
 *  - **Non-destructive.** Local rows are only cleared after every copy has
 *    succeeded. A failure halfway leaves the guest data intact to retry.
 *  - **Best effort.** A migration failure must never block sign-in; it is
 *    logged and retried on the next launch.
 */

export type MigrationTargets = {
  pantry: PantryRepository;
  saved: SavedRepository;
  shopping: ShoppingRepository;
};

export type MigrationResult = {
  migrated: boolean;
  pantryItems: number;
  savedRecipes: number;
  shoppingItems: number;
};

async function alreadyMigrated(userId: string): Promise<boolean> {
  const users = (await getItem<string[]>(StorageKeys.migratedUsers)) ?? [];
  return users.includes(userId);
}

async function markMigrated(userId: string): Promise<void> {
  const users = (await getItem<string[]>(StorageKeys.migratedUsers)) ?? [];
  if (!users.includes(userId)) {
    await setItem(StorageKeys.migratedUsers, [...users, userId]);
  }
}

export async function migrateGuestData(
  userId: string,
  targets: MigrationTargets,
): Promise<MigrationResult> {
  const empty: MigrationResult = {
    migrated: false,
    pantryItems: 0,
    savedRecipes: 0,
    shoppingItems: 0,
  };

  if (await alreadyMigrated(userId)) return empty;

  const localPantry = new LocalPantryRepository();
  const localSaved: LocalSavedRepository = new LocalSaved();
  const localShopping = new LocalShoppingRepository();

  try {
    const [pantryItems, savedRecipes, shoppingItems] = await Promise.all([
      localPantry.list(),
      localSaved.list(),
      localShopping.list(),
    ]);

    if (pantryItems.length === 0 && savedRecipes.length === 0 && shoppingItems.length === 0) {
      await markMigrated(userId);
      return empty;
    }

    for (const item of pantryItems) {
      await targets.pantry.add({
        ingredientName: item.ingredientName,
        quantity: item.quantity,
        unit: item.unit,
        expiresOn: item.expiresOn,
        isStaple: item.isStaple,
        category: item.category,
        note: item.note,
      });
    }

    for (const entry of savedRecipes) {
      // Generated recipes migrate too. `save` writes the recipe row first when
      // one is needed — owned by this user and private — so a guest who saved
      // an AI suggestion still has it after signing in. It used to be dropped
      // on the floor here because the foreign key had nothing to point at.
      await targets.saved.save(entry.recipe);
    }

    if (shoppingItems.length > 0) {
      await targets.shopping.addMany(
        shoppingItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          sourceRecipeId: item.sourceRecipeIds[0] ?? null,
        })),
      );
    }

    // Only now is it safe to drop the local copies.
    await Promise.all([localPantry.clear(), localSaved.clear(), localShopping.clear()]);
    await markMigrated(userId);

    logInfo('guest_data_migrated', {
      pantryItems: pantryItems.length,
      savedRecipes: savedRecipes.length,
      shoppingItems: shoppingItems.length,
    });

    return {
      migrated: true,
      pantryItems: pantryItems.length,
      savedRecipes: savedRecipes.length,
      shoppingItems: shoppingItems.length,
    };
  } catch (error) {
    // Leave the local data and the unset marker alone so the next launch
    // retries. Sign-in itself is unaffected.
    logError('guest_data_migration_failed', error);
    return empty;
  }
}
