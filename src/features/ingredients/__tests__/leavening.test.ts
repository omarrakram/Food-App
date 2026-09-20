import { makeRecipeIngredient } from '@/test-utils/factories';
import type { PantryItem } from '@/types/domain';

import {
  buildAvailabilityIndex,
  ingredientFamily,
  matchRecipeIngredients,
  resolveIngredient,
  searchIngredients,
} from '../matching';

/**
 * Baking soda and baking powder are not the same thing.
 *
 * Before this row existed, `بيكنج صودا` resolved to nothing and search offered
 * `baking-powder` — the nearest thing the catalogue had. That is the most
 * expensive shape of wrong answer in the whole catalogue, because the two
 * look interchangeable on a shelf and are not: powder is soda plus an acid
 * plus a buffer, so substituting either way changes how much a batter rises
 * and leaves a soapy or metallic taste. A cook who accepts the suggestion
 * finds out after the oven.
 *
 * These tests assert the separation from both ends, in both languages, and
 * through the pantry as well as the resolver — a suggestion is only half the
 * surface, and the half that silently reports "you have this" is the one that
 * costs an ingredient.
 */

const NOW = new Date('2026-09-10T12:00:00');

function pantry(ingredientName: string): PantryItem {
  return {
    id: ingredientName,
    userId: 'local',
    ingredientId: '',
    ingredientName,
    category: 'other',
    quantity: 1,
    unit: null,
    expiresOn: null,
    isStaple: false,
    note: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function recipeOf(slug: string) {
  return { ingredients: [makeRecipeIngredient({ id: slug, name: slug, slug, sortOrder: 0 })] };
}

describe('baking soda is not baking powder', () => {
  it('resolves every real spelling of soda to soda', () => {
    // Egyptian shelves say بيكنج صودا; the chemical name and the British
    // "bicarb" both turn up in recipes written for an Egyptian kitchen.
    for (const term of [
      'baking soda',
      'bicarb',
      'bicarbonate of soda',
      'sodium bicarbonate',
      'بيكنج صودا',
      'بيكربونات',
      'بيكربونات الصوديوم',
      'صودا الخبز',
      'bikarbonat',
    ]) {
      expect({ term, slug: resolveIngredient(term)?.slug ?? null }).toEqual({
        term,
        slug: 'baking-soda',
      });
    }
  });

  it('leaves baking powder exactly where it was', () => {
    for (const term of ['baking powder', 'بيكنج بودر', 'بيكنج باودر']) {
      expect({ term, slug: resolveIngredient(term)?.slug ?? null }).toEqual({
        term,
        slug: 'baking-powder',
      });
    }
  });

  it('never resolves one to the other', () => {
    expect(resolveIngredient('baking soda')?.slug).not.toBe('baking-powder');
    expect(resolveIngredient('baking powder')?.slug).not.toBe('baking-soda');
    expect(resolveIngredient('بيكنج صودا')?.slug).not.toBe('baking-powder');
    expect(resolveIngredient('بيكنج بودر')?.slug).not.toBe('baking-soda');
  });

  it('does not offer one as the top suggestion for the other', () => {
    // The pre-2C failure, asserted so it cannot come back: `بيكنج صودا` had no
    // row, so the closest match won and the closest match was wrong.
    expect(searchIngredients('بيكنج صودا', 1)[0]?.slug).toBe('baking-soda');
    expect(searchIngredients('baking soda', 1)[0]?.slug).toBe('baking-soda');
    expect(searchIngredients('بيكنج بودر', 1)[0]?.slug).toBe('baking-powder');
  });

  it('does not let a pantry holding one satisfy a recipe needing the other', () => {
    // Where a wrong answer actually costs something: the recipe reads fully
    // matched and the shopping list drops the line.
    const sodaOnly = buildAvailabilityIndex([pantry('baking soda')], [], { now: NOW });
    const powderOnly = buildAvailabilityIndex([pantry('baking powder')], [], { now: NOW });

    expect(matchRecipeIngredients(recipeOf('baking-powder'), sodaOnly).haveCount).toBe(0);
    expect(matchRecipeIngredients(recipeOf('baking-soda'), powderOnly).haveCount).toBe(0);

    // ...and each still matches itself, so the guard is not vacuous.
    expect(matchRecipeIngredients(recipeOf('baking-soda'), sodaOnly).haveCount).toBe(1);
    expect(matchRecipeIngredients(recipeOf('baking-powder'), powderOnly).haveCount).toBe(1);
  });

  it('builds no family that would put them back together', () => {
    // `powder` heads both `baking powder` and `custard powder` and is denied
    // as a form word. If that ever lapsed, the two leaveners would rejoin
    // through the family door rather than the alias door.
    expect(ingredientFamily('powder')).toEqual([]);
    expect(ingredientFamily('بيكنج')).toEqual([]);
    expect(ingredientFamily('soda')).toEqual([]);
  });
});

describe('the rest of the baking shelf resolves from Egyptian terms', () => {
  it('finds each concept from what a cook actually types', () => {
    const cases: readonly [string, string][] = [
      ['كسترد', 'custard-powder'],
      ['كاسترد', 'custard-powder'],
      ['custard', 'custard-powder'],
      ['مستكة', 'mastic'],
      ['mastika', 'mastic'],
      ['محلب', 'mahlab'],
      ['mahlab', 'mahlab'],
      ['ملح ليمون', 'citric-acid'],
      ['citric acid', 'citric-acid'],
      ['ألوان طعام', 'food-colouring'],
      ['food coloring', 'food-colouring'],
    ];

    for (const [term, slug] of cases) {
      expect({ term, slug: resolveIngredient(term)?.slug ?? null }).toEqual({ term, slug });
    }
  });

  it('does not let citric acid take the word for salt', () => {
    // `ملح ليمون` is headed by `ملح` in Arabic, so salt and citric acid share
    // a head noun. Resolution settles it — bare ملح is salt and always was —
    // but the pair is worth an assertion, because a cook who is told they
    // have salt when they have citric acid has been badly misled.
    expect(resolveIngredient('ملح')?.slug).toBe('salt');
    expect(resolveIngredient('ملح ليمون')?.slug).toBe('citric-acid');
    expect(ingredientFamily('ملح')).toEqual([]);
  });
});
