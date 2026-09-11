import {
  allergensForNames,
  buildAvailabilityIndex,
  matchRecipeIngredients,
  resolveIngredient,
  searchIngredients,
} from '../matching';
import { INGREDIENT_CATALOGUE } from '../catalogue';
import { todayISO } from '../freshness';
import { normaliseIngredientName } from '../normalise';
import type { PantryItem, RecipeIngredient } from '@/types/domain';

const NOW = new Date('2026-09-10T12:00:00');

function isoOffset(days: number): string {
  const date = new Date(NOW);
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

function pantry(
  ingredientName: string,
  expiresOn: string | null = null,
  id = ingredientName,
): PantryItem {
  return {
    id,
    userId: 'local',
    ingredientId: '',
    ingredientName,
    category: 'other',
    quantity: 1,
    unit: null,
    expiresOn,
    isStaple: false,
    note: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function recipeIngredient(
  name: string,
  isOptional = false,
  id = name,
): RecipeIngredient {
  return {
    id,
    ingredientId: null,
    name,
    quantity: 1,
    unit: null,
    preparation: null,
    isOptional,
    sortOrder: 0,
  };
}

describe('resolveIngredient', () => {
  it('resolves the canonical name', () => {
    expect(resolveIngredient('tomatoes')?.slug).toBe('tomatoes');
  });

  it('resolves through aliases, transliterations and Arabic', () => {
    expect(resolveIngredient('firakh')?.slug).toBe('chicken-breast');
    expect(resolveIngredient('فراخ')?.slug).toBe('chicken-breast');
    expect(resolveIngredient('foul')?.slug).toBe('fava-beans');
    expect(resolveIngredient('aish baladi')?.slug).toBe('baladi-bread');
    expect(resolveIngredient('feta')?.slug).toBe('white-cheese');
  });

  it('resolves despite preparation words and plurals', () => {
    expect(resolveIngredient('fresh chopped Tomatoes')?.slug).toBe('tomatoes');
  });

  it('returns null for something we do not know', () => {
    expect(resolveIngredient('dragonfruit marmalade')).toBeNull();
    expect(resolveIngredient('')).toBeNull();
  });
});

describe('searchIngredients', () => {
  it('ranks the best match first', () => {
    const results = searchIngredients('toma');
    expect(results[0]?.slug).toBe('tomatoes');
  });

  it('returns nothing for an empty query', () => {
    expect(searchIngredients('   ')).toHaveLength(0);
  });

  it('respects the limit', () => {
    expect(searchIngredients('e', 3).length).toBeLessThanOrEqual(3);
  });
});

describe('allergensForNames', () => {
  it('derives allergens from ingredient identity', () => {
    expect(allergensForNames(['milk'])).toContain('dairy');
    expect(allergensForNames(['pasta'])).toContain('gluten');
    expect(allergensForNames(['shrimp'])).toContain('shellfish');
    expect(allergensForNames(['peanut butter'])).toContain('peanuts');
  });

  it('deduplicates across ingredients', () => {
    const found = allergensForNames(['milk', 'butter', 'yogurt']);
    expect(found.filter((entry) => entry === 'dairy')).toHaveLength(1);
  });
});

describe('buildAvailabilityIndex', () => {
  it('counts typed ingredients and pantry items', () => {
    const index = buildAvailabilityIndex([pantry('tomatoes')], ['eggs'], { now: NOW });

    expect(index.available.has('tomato')).toBe(true);
    expect(index.available.has('egg')).toBe(true);
  });

  it('EXCLUDES expired pantry items and records why', () => {
    const index = buildAvailabilityIndex([pantry('chicken breast', isoOffset(-1))], [], {
      now: NOW,
      assumeCommonStaples: false,
    });

    expect(index.available.has('chicken breast')).toBe(false);
    expect(index.expired.has('chicken breast')).toBe(true);
  });

  it('flags items expiring soon so recipes using them can be ranked up', () => {
    const index = buildAvailabilityIndex([pantry('tomatoes', isoOffset(1), 'p1')], [], {
      now: NOW,
    });

    expect(index.expiringSoon.has('tomato')).toBe(true);
    expect(index.itemIdByName.get('tomato')).toBe('p1');
  });

  it('assumes common staples so users need not list salt', () => {
    const index = buildAvailabilityIndex([], [], { now: NOW });

    expect(index.available.has('salt')).toBe(true);
    expect(index.assumedStaples.has('salt')).toBe(true);
  });

  it('does not assume a staple the user has marked expired', () => {
    const index = buildAvailabilityIndex([pantry('milk', isoOffset(-2))], [], { now: NOW });

    expect(index.available.has('milk')).toBe(false);
    expect(index.expired.has('milk')).toBe(true);
  });

  it('can be told not to assume staples', () => {
    const index = buildAvailabilityIndex([], [], { now: NOW, assumeCommonStaples: false });
    expect(index.available.has('salt')).toBe(false);
  });
});

describe('matchRecipeIngredients', () => {
  const recipe = {
    ingredients: [
      recipeIngredient('eggs'),
      recipeIngredient('tomatoes'),
      recipeIngredient('mozzarella'),
      recipeIngredient('parsley', true),
    ],
  };

  it('counts required ingredients only', () => {
    const index = buildAvailabilityIndex([], ['eggs', 'tomatoes'], {
      now: NOW,
      assumeCommonStaples: false,
    });
    const result = matchRecipeIngredients(recipe, index);

    // 2 of 3 required; the optional garnish is not in the denominator.
    expect(result.requiredCount).toBe(3);
    expect(result.haveCount).toBe(2);
    expect(result.matchPercent).toBe(67);
    expect(result.missingIngredients.map((entry) => entry.name)).toEqual(['mozzarella']);
  });

  it('reports 100 when everything required is available', () => {
    const index = buildAvailabilityIndex([], ['eggs', 'tomatoes', 'mozzarella'], {
      now: NOW,
      assumeCommonStaples: false,
    });
    expect(matchRecipeIngredients(recipe, index).matchPercent).toBe(100);
  });

  it('scores 100 rather than NaN when a recipe has no required ingredients', () => {
    const index = buildAvailabilityIndex([], [], { now: NOW });
    const optionalOnly = { ingredients: [recipeIngredient('parsley', true)] };

    expect(matchRecipeIngredients(optionalOnly, index).matchPercent).toBe(100);
  });

  it('marks an expired ingredient missing WITH its reason', () => {
    const index = buildAvailabilityIndex([pantry('eggs', isoOffset(-1))], [], {
      now: NOW,
      assumeCommonStaples: false,
    });
    const result = matchRecipeIngredients(recipe, index);
    const eggs = result.matches.find((entry) => entry.name === 'eggs');

    expect(eggs?.isAvailable).toBe(false);
    expect(eggs?.excludedReason).toBe('expired');
  });

  it('labels a staple match so the UI can say it was assumed', () => {
    const index = buildAvailabilityIndex([], [], { now: NOW });
    const saltRecipe = { ingredients: [recipeIngredient('salt')] };
    const result = matchRecipeIngredients(saltRecipe, index);

    expect(result.matches[0]?.matchedVia).toBe('assumed_staple');
  });

  it('collects pantry items the recipe would use before they expire', () => {
    const index = buildAvailabilityIndex([pantry('tomatoes', isoOffset(1), 'p-tomato')], [], {
      now: NOW,
    });
    const result = matchRecipeIngredients(recipe, index);

    expect(result.usesExpiringItems).toContain('p-tomato');
  });
});

// ---------------------------------------------------------------------------
// Catalogue breadth and integrity.
//
// The catalogue grew from 69 ingredients to a few hundred, and that growth is
// exactly when alias collisions start to bite: two entries claiming one word
// means the matcher silently binds it to whichever loaded first. One of these
// caught a real regression — the alias "whole rice" normalises to "rice",
// because "whole" is a noise word, so brown rice took over the word "rice" and
// every rice recipe lost its price.
// ---------------------------------------------------------------------------

describe('catalogue integrity', () => {
  it('recognises a few hundred ingredients', () => {
    expect(INGREDIENT_CATALOGUE.length).toBeGreaterThanOrEqual(250);
  });

  it('has NO two ingredients claiming the same normalised term', () => {
    const owner = new Map<string, string>();
    const collisions: string[] = [];

    for (const ingredient of INGREDIENT_CATALOGUE) {
      for (const term of [ingredient.name, ...ingredient.aliases]) {
        const key = normaliseIngredientName(term);
        if (!key) continue;
        const existing = owner.get(key);
        if (existing && existing !== ingredient.slug) {
          collisions.push(`"${term}" -> "${key}": ${existing} vs ${ingredient.slug}`);
        } else {
          owner.set(key, ingredient.slug);
        }
      }
    }

    expect(collisions).toEqual([]);
  });

  it('gives every ingredient a unique slug', () => {
    const slugs = INGREDIENT_CATALOGUE.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('gives every ingredient an Arabic name', () => {
    const missing = INGREDIENT_CATALOGUE.filter((entry) => !entry.nameAr.trim());
    expect(missing.map((entry) => entry.slug)).toEqual([]);
  });

  it('classifies common foods properly rather than dumping them in "other"', () => {
    // Salmon landing in "other" was the symptom of a catalogue too small to
    // contain it at all.
    const expectations: Record<string, string> = {
      salmon: 'protein',
      tofu: 'protein',
      mushrooms: 'vegetables',
      avocado: 'vegetables',
      mango: 'fruit',
      'white cheese': 'dairy',
      quinoa: 'carbs',
      turmeric: 'spices',
    };

    for (const [name, category] of Object.entries(expectations)) {
      expect(resolveIngredient(name)?.category).toBe(category);
    }
  });

  it('carries allergens on the foods that have them', () => {
    expect(resolveIngredient('salmon')?.allergens).toContain('fish');
    expect(resolveIngredient('calamari')?.allergens).toContain('shellfish');
    expect(resolveIngredient('tofu')?.allergens).toContain('soy');
    expect(resolveIngredient('cashews')?.allergens).toContain('nuts');
    expect(resolveIngredient('peanuts')?.allergens).toContain('peanuts');
    expect(resolveIngredient('tahini')?.allergens).toContain('sesame');
  });
});

describe('resolving English and Arabic names', () => {
  const cases: [string, string][] = [
    ['salmon', 'salmon'],
    ['سالمون', 'salmon'],
    ['bouri', 'mullet'],
    ['بوري', 'mullet'],
    ['mushroom', 'mushroom'],
    ['عيش الغراب', 'mushroom'],
    ['batata', 'sweet-potato'],
    ['بطاطا', 'sweet-potato'],
    ['arnabeet', 'cauliflower'],
    ['قرنبيط', 'cauliflower'],
    ['gargeer', 'rocket'],
    ['جرجير', 'rocket'],
    ['samna', 'ghee'],
    ['سمنة', 'ghee'],
    ['كركم', 'turmeric'],
    ['حبهان', 'cardamom'],
    ['زبيب', 'raisins'],
    ['فستق', 'pistachios'],
    ['سمسم', 'sesame-seeds'],
    ['مشروم', 'mushroom'],
    ['كابوريا', 'crab'],
  ];

  it.each(cases)('resolves %s to %s', (input, slug) => {
    expect(resolveIngredient(input)?.slug).toBe(slug);
  });

  it('still resolves the words the original catalogue owned', () => {
    // Regression guard: the expansion must not steal an existing meaning.
    expect(resolveIngredient('rice')?.slug).toBe('rice');
    expect(resolveIngredient('pepper')?.slug).toBe('black-pepper');
    expect(resolveIngredient('bread')?.slug).toBe('baladi-bread');
    expect(resolveIngredient('coriander')?.slug).toBe('coriander');
    expect(resolveIngredient('chicken')?.slug).toBe('chicken-breast');
    expect(resolveIngredient('pasta')?.slug).toBe('pasta');
  });

  it('tolerates the spelling variants people actually type', () => {
    expect(resolveIngredient('tomatos')?.slug).toBe('tomatoes');
    expect(resolveIngredient('Mushrooms')?.slug).toBe('mushroom');
    expect(resolveIngredient('  avocado  ')?.slug).toBe('avocado');
  });
});
