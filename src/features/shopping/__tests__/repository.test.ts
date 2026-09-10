import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  buildShoppingItem,
  estimateListTotal,
  LocalShoppingRepository,
  mergeQuantities,
  LOCAL_LIST_ID,
} from '../repository';
import type { ShoppingListItem } from '@/types/domain';

describe('mergeQuantities', () => {
  const base = { name: 'tomatoes', quantity: 2, unit: 'piece' as const };

  it('adds quantities in the same unit', () => {
    // The headline behaviour: 2 tomatoes + 3 tomatoes = 5 tomatoes.
    expect(mergeQuantities(base, { quantity: 3, unit: 'piece' })).toEqual({
      quantity: 5,
      unit: 'piece',
    });
  });

  it('converts between compatible units, keeping the existing one', () => {
    const existing = { name: 'rice', quantity: 500, unit: 'g' as const };
    expect(mergeQuantities(existing, { quantity: 1, unit: 'kg' })).toEqual({
      quantity: 1500,
      unit: 'g',
    });
  });

  it('adopts the addition when the existing line has no quantity', () => {
    expect(mergeQuantities({ ...base, quantity: null }, { quantity: 4, unit: 'piece' })).toEqual({
      quantity: 4,
      unit: 'piece',
    });
  });

  it('keeps the existing amount when the addition has no quantity', () => {
    expect(mergeQuantities(base, { quantity: null, unit: 'piece' })).toEqual({
      quantity: 2,
      unit: 'piece',
    });
  });

  it('refuses to add nonsense when units cannot be reconciled', () => {
    // Better a slightly stale quantity than "2 pieces + 1 bunch = 3 pieces".
    const existing = { name: 'parsley', quantity: 2, unit: 'bunch' as const };
    expect(mergeQuantities(existing, { quantity: 1, unit: 'clove' })).toEqual({
      quantity: 2,
      unit: 'bunch',
    });
  });
});

describe('buildShoppingItem', () => {
  it('resolves the canonical name, unit and category', () => {
    const item = buildShoppingItem({ name: 'Tomatoes' }, LOCAL_LIST_ID);

    expect(item.name).toBe('tomatoes');
    expect(item.category).toBe('vegetables');
    expect(item.unit).toBe('piece');
  });

  it('accepts an ingredient we do not know about', () => {
    const item = buildShoppingItem({ name: 'dragonfruit jam' }, LOCAL_LIST_ID);

    expect(item.name).toBe('dragonfruit jam');
    expect(item.category).toBe('other');
  });

  it('leaves every grocery-provider field null in V1', () => {
    const item = buildShoppingItem({ name: 'rice' }, LOCAL_LIST_ID);

    expect(item.supermarketId).toBeNull();
    expect(item.storeProductId).toBeNull();
    expect(item.sku).toBeNull();
    expect(item.livePriceMinor).toBeNull();
    expect(item.availability).toBeNull();
  });
});

describe('LocalShoppingRepository', () => {
  let repository: LocalShoppingRepository;

  beforeEach(async () => {
    await AsyncStorage.clear();
    repository = new LocalShoppingRepository();
  });

  it('MERGES duplicates across recipes into one line', async () => {
    await repository.add({ name: 'tomatoes', quantity: 2, unit: 'piece', sourceRecipeId: 'r1' });
    await repository.add({ name: 'tomatoes', quantity: 3, unit: 'piece', sourceRecipeId: 'r2' });

    const items = await repository.list();

    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(5);
    expect(items[0]?.sourceRecipeIds).toEqual(['r1', 'r2']);
  });

  it('merges through normalisation, not exact string equality', async () => {
    await repository.add({ name: 'Tomatoes', quantity: 1, unit: 'piece' });
    await repository.add({ name: 'tomato', quantity: 1, unit: 'piece' });

    expect(await repository.list()).toHaveLength(1);
  });

  it('un-checks an item that is added again', async () => {
    const item = await repository.add({ name: 'rice', quantity: 1, unit: 'kg' });
    await repository.setChecked(item.id, true);

    await repository.add({ name: 'rice', quantity: 1, unit: 'kg' });
    const items = await repository.list();

    expect(items[0]?.isChecked).toBe(false);
  });

  it('adds many sequentially so each merge sees the previous one', async () => {
    await repository.addMany([
      { name: 'eggs', quantity: 2, unit: 'piece' },
      { name: 'eggs', quantity: 4, unit: 'piece' },
      { name: 'milk', quantity: 500, unit: 'ml' },
    ]);

    const items = await repository.list();
    const eggs = items.find((entry) => entry.name === 'eggs');

    expect(items).toHaveLength(2);
    expect(eggs?.quantity).toBe(6);
  });

  it('lists unchecked items before checked ones', async () => {
    const first = await repository.add({ name: 'apples' });
    await repository.add({ name: 'butter' });
    await repository.setChecked(first.id, true);

    const items = await repository.list();
    expect(items[0]?.name).toBe('butter');
    expect(items[1]?.isChecked).toBe(true);
  });

  it('clears only the checked items', async () => {
    const first = await repository.add({ name: 'rice' });
    await repository.add({ name: 'milk' });
    await repository.setChecked(first.id, true);

    await repository.clearChecked();
    const items = await repository.list();

    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('milk');
  });

  it('removes an item', async () => {
    const item = await repository.add({ name: 'rice' });
    await repository.remove(item.id);

    expect(await repository.list()).toHaveLength(0);
  });
});

describe('estimateListTotal', () => {
  function item(overrides: Partial<ShoppingListItem>): ShoppingListItem {
    return { ...buildShoppingItem({ name: 'rice' }, LOCAL_LIST_ID), ...overrides };
  }

  it('totals unchecked items as an estimate', () => {
    const result = estimateListTotal(
      [item({ name: 'rice', quantity: 1, unit: 'kg' })],
      'EG',
      'EGP',
    );

    expect(result.priced.source).toBe('estimate');
    expect(result.priced.money.amountMinor).toBeGreaterThan(0);
  });

  it('EXCLUDES checked items — they are already in the basket', () => {
    const items = [
      item({ id: 'a', name: 'rice', quantity: 1, unit: 'kg', isChecked: false }),
      item({ id: 'b', name: 'sugar', quantity: 1, unit: 'kg', isChecked: true }),
    ];

    const all = estimateListTotal(items, 'EG', 'EGP');
    const uncheckedOnly = estimateListTotal([items[0]!], 'EG', 'EGP');

    expect(all.priced.money.amountMinor).toBe(uncheckedOnly.priced.money.amountMinor);
  });

  it('reports how many lines it could not price', () => {
    const result = estimateListTotal(
      [item({ name: 'dragonfruit jam', quantity: 1, unit: 'pack' })],
      'EG',
      'EGP',
    );

    expect(result.unpricedCount).toBe(1);
    expect(result.priced.isFallback).toBe(true);
  });

  it('returns zero for an empty list rather than throwing', () => {
    expect(estimateListTotal([], 'EG', 'EGP').priced.money.amountMinor).toBe(0);
  });
});
