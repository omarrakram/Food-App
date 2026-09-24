import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

/**
 * A tiny AsyncStorage-backed collection.
 *
 * Backs the signed-out ("guest") experience: pantry, saved recipes and the
 * shopping list all work before the user ever creates an account, and the same
 * rows are pushed to Supabase on first sign-in. Keeping the storage shape equal
 * to the domain type makes that migration a straight copy.
 */

export type WithId = { id: string };

export function newId(): string {
  return Crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export class LocalCollection<T extends WithId> {
  constructor(private readonly key: string) {}

  async list(): Promise<T[]> {
    try {
      const raw = await AsyncStorage.getItem(this.key);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      // Corrupt local data should degrade to "empty", never crash the screen.
      return [];
    }
  }

  async replaceAll(items: readonly T[]): Promise<void> {
    await AsyncStorage.setItem(this.key, JSON.stringify(items));
  }

  async insert(item: T): Promise<T> {
    const items = await this.list();
    await this.replaceAll([...items, item]);
    return item;
  }

  async update(id: string, patch: Partial<T>): Promise<T | null> {
    const items = await this.list();
    let updated: T | null = null;
    const next = items.map((item) => {
      if (item.id !== id) return item;
      updated = { ...item, ...patch };
      return updated;
    });
    if (updated) await this.replaceAll(next);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const items = await this.list();
    await this.replaceAll(items.filter((item) => item.id !== id));
  }

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(this.key);
  }
}

export const LocalCollectionKeys = {
  pantry: 'akla.local.pantry',
  saved: 'akla.local.saved',
  shoppingList: 'akla.local.shoppingList',
  history: 'akla.local.history',
  aiRecipes: 'akla.local.aiRecipes',
  cart: 'akla.local.cart',
  addresses: 'akla.local.addresses',
} as const;
