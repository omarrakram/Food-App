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
import { makeRecipeIngredient } from '@/test-utils/factories';
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

function recipeIngredient(name: string, isOptional = false, id = name): RecipeIngredient {
  return makeRecipeIngredient({ id, name, isOptional, sortOrder: 0 });
}

describe('resolveIngredient', () => {
  it('resolves the canonical name', () => {
    expect(resolveIngredient('tomatoes')?.slug).toBe('tomatoes');
  });

  it('resolves through aliases, transliterations and Arabic', () => {
    expect(resolveIngredient('sedr firakh')?.slug).toBe('chicken-breast');
    expect(resolveIngredient('صدر فراخ')?.slug).toBe('chicken-breast');
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
      assumeUniversalBasics: false,
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

  it('never reports an ingredient as available AND expired at once', () => {
    // The two sets are answers to the same question, so an overlap is a
    // contradiction the caller cannot resolve: the filter would count the
    // ingredient and the UI would explain that it had gone off.
    const index = buildAvailabilityIndex([pantry('milk', isoOffset(-2))], ['milk'], { now: NOW });

    for (const key of index.expired) expect(index.available.has(key)).toBe(false);
  });

  it('lets the user override a stale pantry row by typing the ingredient', () => {
    // Typing "milk" is a statement about what is in front of them NOW. It
    // outranks a row they last touched a fortnight ago — silently ignoring a
    // direct answer is worse than trusting it.
    const index = buildAvailabilityIndex([pantry('milk', isoOffset(-2))], ['milk'], { now: NOW });

    expect(index.available.has('milk')).toBe(true);
    expect(index.expired.has('milk')).toBe(false);
  });

  it('can be told not to assume staples', () => {
    const index = buildAvailabilityIndex([], [], { now: NOW, assumeUniversalBasics: false });
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
      assumeUniversalBasics: false,
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
      assumeUniversalBasics: false,
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
      assumeUniversalBasics: false,
    });
    const result = matchRecipeIngredients(recipe, index);
    const eggs = result.matches.find((entry) => entry.name === 'eggs');

    expect(eggs?.isAvailable).toBe(false);
    expect(eggs?.excludedReason).toBe('expired');
  });

  it('says an assumed basic came from an assumption, not from the pantry', () => {
    const index = buildAvailabilityIndex([], [], { now: NOW });
    const saltRecipe = { ingredients: [recipeIngredient('salt')] };
    const result = matchRecipeIngredients(saltRecipe, index);

    // `matchedVia` is now about how the NAME resolved; where the availability
    // came from is a separate question with a separate answer, because the two
    // were conflated and the screen ended up calling an assumption a staple.
    expect(result.matches[0]?.availableVia).toBe('universal_basic');
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
    expect(resolveIngredient('pasta')?.slug).toBe('pasta');
  });

  it('does not own the bare word `chicken`, which names no single cut', () => {
    // This assertion used to read `toBe('chicken-breast')` and sat in the
    // block above as though it were a meaning worth protecting. It was not:
    // breast, thigh, wings and a whole bird are different purchases, and the
    // catalogue answered with whichever row happened to carry the alias. See
    // the chicken-cut block at the end of this file.
    expect(resolveIngredient('chicken')).toBeNull();
  });

  it('tolerates the spelling variants people actually type', () => {
    expect(resolveIngredient('tomatos')?.slug).toBe('tomatoes');
    expect(resolveIngredient('Mushrooms')?.slug).toBe('mushroom');
    expect(resolveIngredient('  avocado  ')?.slug).toBe('avocado');
  });
});

// ---------------------------------------------------------------------------
// Autocomplete relevance. Reported from the app: typing "to" offered garlic,
// apples and pickles. Nothing was broken — their Egyptian transliterations are
// `toum`, `tofah` and `torshi`, so all three really are prefix matches. The
// ranking simply had no way to say that a match on an ingredient's OWN name
// beats a match on one of its nicknames.
// ---------------------------------------------------------------------------

describe('ingredient autocomplete ranks by how good the evidence is', () => {
  const names = (query: string, limit = 8) =>
    searchIngredients(query, limit).map((entry) => entry.name);

  it('puts canonical prefix matches above alias prefix matches', () => {
    const top = names('to', 6);

    for (const wanted of ['tomatoes', 'tofu', 'toast bread']) {
      expect({ wanted, rank: top.indexOf(wanted) }).toEqual({
        wanted,
        rank: expect.any(Number),
      });
      expect(top).toContain(wanted);
    }
    // The three the report named, all matching only through a transliterated
    // alias, must not be crowding out the real answers.
    for (const alias of ['garlic', 'apples', 'pickles']) {
      expect({ alias, inTopSix: top.includes(alias) }).toEqual({ alias, inTopSix: false });
    }
  });

  it('is deterministic — the same query gives the same order every time', () => {
    expect(names('to')).toEqual(names('to'));
    expect(names('chick')).toEqual(names('chick'));
  });

  it('puts an exact match first', () => {
    expect(names('rice')[0]).toBe('rice');
    expect(names('lemon')[0]).toBe('lemon');
    expect(names('eggs')[0]).toBe('eggs');
  });

  it('finds the obvious thing for a short English prefix', () => {
    expect(names('chick', 3)).toContain('chickpeas');
    expect(names('chick', 5)).toContain('chicken breast');
    expect(names('lem', 3)).toContain('lemon');
  });

  it('ranks Arabic queries by the same rules', () => {
    // طماطم — tomatoes. The canonical Arabic name, not an alias.
    expect(names('طم', 4)).toContain('tomatoes');
    expect(names('طماطم')[0]).toBe('tomatoes');
    // فراخ — chicken.
    expect(names('فراخ', 5)).toContain('chicken breast');
    // عيش — bread.
    expect(names('عيش', 5).length).toBeGreaterThan(0);
  });

  it('still tolerates a typo once the query is long enough to be sure', () => {
    expect(names('tomatos', 3)).toContain('tomatoes');
    expect(names('mushrom', 3)).toContain('mushrooms');
    expect(names('brocoli', 3)).toContain('broccoli');
  });

  it('does NOT guess from two letters — that is where the noise came from', () => {
    // A short query has a confident answer, so nothing fuzzy is offered
    // alongside it. Every result here matches on a real prefix.
    for (const name of names('to')) {
      const entry = INGREDIENT_CATALOGUE.find((item) => item.name === name)!;
      const haystack = [entry.name, entry.nameAr, ...entry.aliases].map((value) =>
        normaliseIngredientName(value),
      );
      expect({ name, hasPrefix: haystack.some((value) => value.includes('to')) }).toEqual({
        name,
        hasPrefix: true,
      });
    }
  });

  it('returns nothing for a query that resembles nothing', () => {
    expect(names('zzqqxx')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Chicken cuts. A bird is not a cut of itself.
//
// `whole chicken` used to return `chicken-breast`, with full confidence and no
// fuzzy tier involved, because `chicken-breast` carried `chicken` as an alias
// and `whole` was stripped as a preparation word. Someone who had a whole bird
// in the freezer was told they had breast fillets, and someone who had breast
// fillets was told they could cook a recipe calling for a whole bird.
//
// Two changes fixed it and both are load-bearing, which is why these tests
// assert the behaviour rather than either mechanism: a `whole-chicken` row,
// and a leading `whole` protected in the normaliser — without the second, every
// alias written for the new row would have normalised back to `chicken` and
// landed on the breast again.
// ---------------------------------------------------------------------------
describe('chicken cuts are not interchangeable', () => {
  it('resolves a whole bird to the whole bird, not to breast', () => {
    expect(resolveIngredient('whole chicken')?.slug).toBe('whole-chicken');
    expect(resolveIngredient('farkha')?.slug).toBe('whole-chicken');
    expect(resolveIngredient('فرخة')?.slug).toBe('whole-chicken');
    expect(resolveIngredient('whole chicken')?.slug).not.toBe('chicken-breast');
  });

  it('keeps chicken breast meaning chicken breast', () => {
    expect(resolveIngredient('chicken breast')?.slug).toBe('chicken-breast');
    expect(resolveIngredient('chicken breasts')?.slug).toBe('chicken-breast');
    expect(resolveIngredient('sedr')?.slug).toBe('chicken-breast');
    expect(resolveIngredient('صدر فراخ')?.slug).toBe('chicken-breast');
  });

  it('keeps chicken thigh meaning chicken thigh', () => {
    expect(resolveIngredient('chicken thigh')?.slug).toBe('chicken-thigh');
    expect(resolveIngredient('werk')?.slug).toBe('chicken-thigh');
    expect(resolveIngredient('أوراك فراخ')?.slug).toBe('chicken-thigh');
  });

  it('offers the cuts for a generic query instead of picking one', () => {
    // The generic word is not a lie the catalogue is allowed to tell, and it
    // is not a dead end either: it is a question, and the answer is a list.
    expect(resolveIngredient('chicken')).toBeNull();
    expect(resolveIngredient('فراخ')).toBeNull();

    const suggested = searchIngredients('chicken', 8).map((item) => item.slug);
    expect(suggested).toEqual(expect.arrayContaining(['chicken-breast', 'chicken-thigh']));
    expect(suggested.length).toBeGreaterThan(1);
  });

  it('does not let a generic pantry entry claim a specific cut', () => {
    // The failure this guards against is silent and expensive: the recipe
    // reads 100% matched, the shopping list drops the line, and the cook finds
    // out at the pan.
    const index = buildAvailabilityIndex([pantry('chicken')], [], { now: NOW });
    const recipe = {
      ingredients: [recipeIngredient('chicken breast'), recipeIngredient('rice')],
    };

    const result = matchRecipeIngredients(recipe, index);
    const breast = result.matches.find((match) => match.name === 'chicken breast')!;

    expect(breast.isAvailable).toBe(false);
    expect(result.missingIngredients.map((match) => match.name)).toContain('chicken breast');
  });

  it('does not let a whole bird in the pantry stand in for a cut, or the reverse', () => {
    const wholeBird = buildAvailabilityIndex([pantry('whole chicken')], [], { now: NOW });
    const breastOnly = buildAvailabilityIndex([pantry('chicken breast')], [], { now: NOW });

    const needsBreast = { ingredients: [recipeIngredient('chicken breast')] };
    const needsWholeBird = { ingredients: [recipeIngredient('whole chicken')] };

    expect(matchRecipeIngredients(needsBreast, wholeBird).haveCount).toBe(0);
    expect(matchRecipeIngredients(needsWholeBird, breastOnly).haveCount).toBe(0);

    // ...and each still matches itself, so the guard above is not just a pair
    // of names that never match anything.
    expect(matchRecipeIngredients(needsBreast, breastOnly).haveCount).toBe(1);
    expect(matchRecipeIngredients(needsWholeBird, wholeBird).haveCount).toBe(1);
  });
});
