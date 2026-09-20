import { recipeContains } from '@/features/recipes/constraints';
import { makeRecipeIngredient } from '@/test-utils/factories';
import type { PantryItem } from '@/types/domain';

import { interpretQuery } from '@/features/search/interpret';

import { INGREDIENT_CATALOGUE } from '../catalogue';
import { DECLARED_FAMILIES, formWords, headNoun, inferredFamilies } from '../families';
import {
  buildAvailabilityIndex,
  ingredientFamily,
  matchRecipeIngredients,
  resolveIngredient,
  searchIngredients,
} from '../matching';
import { normaliseIngredientName } from '../normalise';

/**
 * A family word names a SET of ingredients rather than one.
 *
 * Two things are being protected here, and they pull in opposite directions.
 *
 * A family must be WIDE ENOUGH that the word means the same thing in both
 * languages: someone typing `فراخ` and someone typing `chicken` are asking the
 * same question, and before the declared layer existed the Arabic word reached
 * five rows while the English one reached seven.
 *
 * A family must be NARROW ENOUGH that it only contains a kind of food. The
 * first implementation inferred a family from any token shared by two names,
 * which made every adjective one — `green` meant five unrelated green things,
 * and "green salad for 4" became a hard requirement for one of them.
 *
 * And throughout: a family narrows a SEARCH. It never fills a pantry.
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

/** A one-line recipe for the named slug. */
function recipeOf(slug: string) {
  return { ingredients: [makeRecipeIngredient({ id: slug, name: slug, slug, sortOrder: 0 })] };
}

const CHICKEN = DECLARED_FAMILIES.find((family) => family.concept === 'chicken')!;
const CHICKEN_SLUGS = CHICKEN.slugs;
const GENERIC_CHICKEN_TERMS = CHICKEN.terms;

// --- the invariant the implementation must actually hold -------------------

describe('a family names more than one ingredient', () => {
  it('never infers a family of one', () => {
    const singletons = inferredFamilies()
      .filter((family) => family.members.length < 2)
      .map((family) => family.token);
    expect(singletons).toEqual([]);
  });

  it('counts DISTINCT ingredients, not repeated names', () => {
    for (const family of inferredFamilies()) {
      const distinct = new Set(family.members.map((member) => member.slug));
      expect({ token: family.token, distinct: distinct.size }).toEqual({
        token: family.token,
        distinct: family.members.length,
      });
    }
  });

  it('treats a word heading exactly one ingredient as no family at all', () => {
    // `gizzard` heads `chicken gizzards` and nothing else; `casing` heads
    // `sausage casing`. Both used to come back as one-item "families", which
    // made a family word and an alias do the same job through two mechanisms
    // with two review paths. A spelling of one ingredient belongs in the alias
    // column, where someone reads it.
    for (const word of ['gizzard', 'casing', 'trotter', 'halva']) {
      const heads = INGREDIENT_CATALOGUE.filter(
        (ingredient) =>
          headNoun(ingredient.name) === word || headNoun(ingredient.nameAr) === word,
      );
      expect({ word, headsAtMostOne: heads.length <= 1, family: ingredientFamily(word) }).toEqual({
        word,
        headsAtMostOne: true,
        family: [],
      });
    }
  });

  it('reads the head of a name from the right end of each language', () => {
    // English builds a noun phrase adjective-first and Arabic head-first.
    // Reading either from the wrong end turns every adjective into a family.
    expect(headNoun('white cheese')).toBe('cheese');
    expect(headNoun('chicken breast')).toBe('breast');
    expect(headNoun('جبنة بيضاء')).toBe('جبنه');
    expect(headNoun('صدور فراخ')).toBe('صدور');
  });

  it('does not treat a modifier as a kind of food', () => {
    // Every one of these was a live family before the head-noun rule, and
    // `green` and `white` were reaching real queries.
    for (const modifier of ['green', 'white', 'black', 'brown', 'hot', 'mixed', 'ground']) {
      expect({ modifier, family: ingredientFamily(modifier) }).toEqual({ modifier, family: [] });
    }
  });
});

// --- the declared layer ----------------------------------------------------

describe('the declared chicken family', () => {
  it('is complete: every chicken row in the catalogue is a member', () => {
    // The guard against silent staleness. Adding an eighth chicken row fails
    // this until someone decides whether it belongs to the family.
    for (const family of DECLARED_FAMILIES) {
      const candidates = INGREDIENT_CATALOGUE.filter((ingredient) =>
        family.memberTokens.some((token) => {
          const needle = normaliseIngredientName(token);
          return [ingredient.name, ingredient.nameAr]
            .map((value) => ` ${normaliseIngredientName(value)} `)
            .some((haystack) => haystack.includes(` ${needle} `));
        }),
      ).map((ingredient) => ingredient.slug);

      const missing = candidates.filter((slug) => !family.slugs.includes(slug));
      expect({ concept: family.concept, missing }).toEqual({ concept: family.concept, missing: [] });
    }
  });

  it('covers every cut, the offal and the whole bird', () => {
    expect([...CHICKEN_SLUGS].sort()).toEqual(
      [
        'chicken-breast',
        'chicken-drumstick',
        'chicken-gizzards',
        'chicken-liver',
        'chicken-thigh',
        'chicken-wings',
        'whole-chicken',
      ].sort(),
    );
  });

  it('means the same set in English, Arabic and Franco-Arab', () => {
    // The point of declaring it. Inference reads canonical names, and `فراخ`
    // appears in `صدور فراخ` but not in `فرخة` or `كوانس`, so the Arabic word
    // would otherwise mean less than the English one.
    for (const term of GENERIC_CHICKEN_TERMS) {
      expect({ term, members: ingredientFamily(term).map((item) => item.slug) }).toEqual({
        term,
        members: [...CHICKEN_SLUGS],
      });
    }
  });

  it('never lets a generic term resolve to one ingredient', () => {
    // A resolution would win over the family and quietly reinstate the bug
    // this milestone removed: one cut answering for all of them.
    for (const family of DECLARED_FAMILIES) {
      for (const term of family.terms) {
        expect({ term, resolved: resolveIngredient(term)?.slug ?? null }).toEqual({
          term,
          resolved: null,
        });
      }
    }
  });
});

// --- what the family is FOR ------------------------------------------------

describe('excluding a family word rules out every member', () => {
  for (const term of ['chicken', 'فراخ', 'دجاج']) {
    it(`"without ${term}" rules out all seven`, () => {
      for (const slug of CHICKEN_SLUGS) {
        expect({ term, slug, excluded: recipeContains(recipeOf(slug), term) }).toEqual({
          term,
          slug,
          excluded: true,
        });
      }
    });

    it(`"without ${term}" does not rule out other meat or fish`, () => {
      for (const slug of ['tilapia', 'beef-steak', 'lamb', 'turkey', 'duck', 'pigeon']) {
        expect({ term, slug, excluded: recipeContains(recipeOf(slug), term) }).toEqual({
          term,
          slug,
          excluded: false,
        });
      }
    });
  }
});

describe('requiring a family word accepts any member', () => {
  for (const term of ['chicken', 'فراخ', 'دجاج']) {
    it(`"with ${term}" is satisfied by any chicken recipe`, () => {
      for (const slug of CHICKEN_SLUGS) {
        expect({ term, slug, satisfied: recipeContains(recipeOf(slug), term) }).toEqual({
          term,
          slug,
          satisfied: true,
        });
      }
    });
  }

  it('is not satisfied by a recipe with no chicken in it', () => {
    expect(recipeContains(recipeOf('tilapia'), 'chicken')).toBe(false);
    expect(recipeContains(recipeOf('tilapia'), 'فراخ')).toBe(false);
  });
});

describe('a family word never fills a pantry', () => {
  for (const term of ['chicken', 'فراخ', 'دجاج']) {
    it(`"${term}" in the pantry claims no specific cut`, () => {
      // The expensive failure this prevents: the recipe reads fully matched,
      // the shopping list drops the line, and the cook finds out at the pan.
      const index = buildAvailabilityIndex([pantry(term)], [], { now: NOW });

      for (const slug of CHICKEN_SLUGS) {
        const result = matchRecipeIngredients(recipeOf(slug), index);
        expect({ term, slug, have: result.haveCount }).toEqual({ term, slug, have: 0 });
      }
    });
  }

  it('still lets a specific cut in the pantry match its own recipe', () => {
    // Otherwise the guard above would pass on a matcher that matches nothing.
    const index = buildAvailabilityIndex([pantry('chicken breast')], [], { now: NOW });
    expect(matchRecipeIngredients(recipeOf('chicken-breast'), index).haveCount).toBe(1);
    expect(matchRecipeIngredients(recipeOf('chicken-thigh'), index).haveCount).toBe(0);
  });
});

describe('the cuts stay distinct from each other', () => {
  it('keeps a whole bird apart from every cut', () => {
    expect(resolveIngredient('whole chicken')?.slug).toBe('whole-chicken');
    for (const slug of CHICKEN_SLUGS.filter((entry) => entry !== 'whole-chicken')) {
      const index = buildAvailabilityIndex([pantry('whole chicken')], [], { now: NOW });
      expect({ slug, have: matchRecipeIngredients(recipeOf(slug), index).haveCount }).toEqual({
        slug,
        have: 0,
      });
    }
  });

  it('resolves each cut to itself and to nothing else', () => {
    const cases: readonly [string, string][] = [
      ['chicken breast', 'chicken-breast'],
      ['sedr', 'chicken-breast'],
      ['chicken thigh', 'chicken-thigh'],
      ['werk', 'chicken-thigh'],
      ['drumstick', 'chicken-drumstick'],
      ['drumsticks', 'chicken-drumstick'],
      ['دبابيس', 'chicken-drumstick'],
      ['دبابيس فراخ', 'chicken-drumstick'],
      ['chicken wings', 'chicken-wings'],
      ['kawanes', 'chicken-gizzards'],
      ['farkha', 'whole-chicken'],
    ];

    for (const [term, slug] of cases) {
      expect({ term, slug: resolveIngredient(term)?.slug ?? null }).toEqual({ term, slug });
    }
  });

  it('no longer answers `drumsticks` with a thigh', () => {
    // The Stage 2A conflict, now settled: أوراك is the leg quarter and is still
    // the thigh row's, but a drumstick is its own purchase.
    expect(resolveIngredient('drumsticks')?.slug).not.toBe('chicken-thigh');
    expect(resolveIngredient('أوراك')?.slug).toBe('chicken-thigh');
  });
});

// --- a form is not a kind ---------------------------------------------------

describe('a word naming a FORM is not a family', () => {
  it('keeps every denied word pointing at something real', () => {
    // A deny list that names nothing is decoration. Each entry must still be a
    // head noun in the catalogue, so one that stops mattering gets noticed and
    // removed rather than accumulating.
    for (const word of formWords()) {
      const headed = INGREDIENT_CATALOGUE.filter(
        (ingredient) =>
          headNoun(ingredient.name) === word || headNoun(ingredient.nameAr) === word,
      ).length;
      expect({ word, headed: headed > 0 }).toEqual({ word, headed: true });
    }
  });

  it('offers no family for a form word', () => {
    for (const word of formWords()) {
      expect({ word, family: ingredientFamily(word) }).toEqual({ word, family: [] });
    }
  });

  it('leaves form words out of the audit as well as the lookup', () => {
    // Otherwise the report would keep advertising families the app refuses to
    // serve, and the next reader would trust the report.
    const audited = inferredFamilies().map((family) => family.token);
    for (const word of formWords()) expect(audited).not.toContain(word);
  });

  it('does not turn a form word in a query into a requirement', () => {
    // Each of these asked for something the catalogue does not stock, and each
    // came back demanding unrelated things that merely share a form.
    const cases: readonly [string, readonly string[]][] = [
      ['protein powder', []],
      ['ice cubes', ['ice']],
      ['oat flakes', ['oats']],
    ];

    for (const [query, expected] of cases) {
      expect({ query, required: interpretQuery(query, 'EGP').ingredients }).toEqual({
        query,
        required: [...expected],
      });
    }
  });

  it('still finds the real ingredient when the form word is qualified', () => {
    // The deny list must not cost the specific products their own names.
    expect(resolveIngredient('chili powder')?.slug).toBe('chili-powder');
    expect(resolveIngredient('baking powder')?.slug).toBe('baking-powder');
    expect(resolveIngredient('stock cube')?.slug).toBe('stock-cube');
    expect(resolveIngredient('corn flakes')?.slug).toBe('corn-flakes');
    expect(resolveIngredient('chili flakes')?.slug).toBe('chili-flakes');
  });
});

// --- lexical ambiguity, which is a different thing --------------------------

describe('رومي belongs to no one', () => {
  it('resolves to nothing at all', () => {
    // It meant `turkey`, because the turkey row held the bare word. In an
    // Egypt-first catalogue that is the least likely reading of the three: at
    // a deli counter رومي is the cheese, and فلفل رومي is a bell pepper.
    // Turkey is normally said as ديك رومي.
    expect(resolveIngredient('رومي')).toBeNull();
  });

  it('offers every sense rather than choosing one', () => {
    const suggested = searchIngredients('رومي', 8).map((item) => item.slug);
    expect(suggested).toEqual(expect.arrayContaining(['roumy-cheese', 'turkey']));
  });

  it('is NOT modelled as a family, because it is not one', () => {
    // A family is a claim that its members answer the same question. A cheese,
    // a bird and a pepper do not; they share a word and nothing else. The
    // honest model is to own nothing and let the reader pick.
    expect(ingredientFamily('رومي')).toEqual([]);
  });

  it('still resolves the qualified forms exactly', () => {
    expect(resolveIngredient('ديك رومي')?.slug).toBe('turkey');
    expect(resolveIngredient('deek roumi')?.slug).toBe('turkey');
    expect(resolveIngredient('dik roumi')?.slug).toBe('turkey');
    expect(resolveIngredient('جبنة رومي')?.slug).toBe('roumy-cheese');
    expect(resolveIngredient('gebna roumi')?.slug).toBe('roumy-cheese');
  });

  it('does not let a bare رومي query require either one', () => {
    expect(interpretQuery('رومي', 'EGP').ingredients).toEqual([]);
    expect(interpretQuery('ديك رومي', 'EGP').ingredients).toEqual(['turkey']);
  });
});
