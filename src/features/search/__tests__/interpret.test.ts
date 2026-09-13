import { createTranslator } from '@/i18n';

import { applyInterpretation, interpretQuery, LOW_CONFIDENCE } from '../interpret';
import type { MealRequest } from '@/types/domain';

const base: MealRequest = {
  mode: 'search',
  alwaysAvailableIngredients: [],
  ingredients: [],
  budgetMinor: null,
  currency: 'EGP',
  country: 'EG',
  servings: 2,
  mealType: null,
  cuisine: null,
  maxMinutes: null,
  minProteinGrams: null,
  maxCalories: null,
  query: null,
  dietaryPreference: 'none',
  dietFlags: [],
  allergens: [],
  dislikedIngredients: [],
  appliances: [],
  skillLevel: 'intermediate',
  requiredIngredients: [],
  excludedIngredients: [],
  pantryMode: 'off',
  maxMissingIngredients: null,
  allowDislikedIngredients: false,
};

const parse = (query: string) => interpretQuery(query, 'EGP');

describe('budget extraction', () => {
  it('reads an explicit ceiling', () => {
    expect(parse('something cheesy under 150 pounds').budgetMinor).toBe(15000);
    expect(parse('a meal for less than 200 EGP').budgetMinor).toBe(20000);
  });

  it('reads a bare amount with a currency word', () => {
    expect(parse('dinner for 120 EGP').budgetMinor).toBe(12000);
    expect(parse('عشاء بـ 100 جنيه').budgetMinor).toBe(10000);
  });

  it('does NOT mistake a time limit for a budget', () => {
    // "under 20 minutes" is the classic false positive.
    const result = parse('dinner in under 20 minutes');
    expect(result.budgetMinor).toBeNull();
    expect(result.maxMinutes).toBe(20);
  });
});

describe('time extraction', () => {
  it('reads minutes and hours', () => {
    expect(parse('dinner in 20 minutes').maxMinutes).toBe(20);
    expect(parse('something in 45 mins').maxMinutes).toBe(45);
    expect(parse('a 2 hour braise').maxMinutes).toBe(120);
  });
});

describe('servings extraction', () => {
  it('reads digits and number words', () => {
    expect(parse('something Egyptian for 4 people').servings).toBe(4);
    expect(parse('something Egyptian for four people').servings).toBe(4);
  });

  it('ignores an implausible count', () => {
    expect(parse('dinner for 400 people').servings).toBeNull();
  });
});

describe('cuisine and meal extraction', () => {
  it('reads cuisine keywords, including dish-name proxies', () => {
    expect(parse('something Egyptian').cuisine).toBe('egyptian');
    expect(parse('a quick pasta').cuisine).toBe('italian');
    expect(parse('thai food tonight').cuisine).toBe('asian');
  });

  it('reads meal keywords in English and Arabic', () => {
    expect(parse('healthy breakfast with eggs').mealType).toBe('breakfast');
    expect(parse('عشاء سريع').mealType).toBe('dinner');
  });
});

describe('nutrition extraction', () => {
  it('reads a high-protein request', () => {
    expect(parse('high protein meal using chicken').minProteinGrams).toBe(30);
    expect(parse('high-protein dinner').minProteinGrams).toBe(30);
  });

  it('reads a low-calorie request', () => {
    expect(parse('something light for lunch').maxCalories).toBe(500);
  });
});

describe('ingredient extraction', () => {
  it('finds catalogue ingredients mentioned in the query', () => {
    expect(parse('high protein meal using chicken').ingredients).toContain('chicken breast');
    expect(parse('something sweet with bananas').ingredients).toContain('bananas');
  });

  it('does not match a substring of another word', () => {
    // "ice" must not match inside "rice", or every query finds ingredients.
    expect(parse('something nice').ingredients).toHaveLength(0);
  });

  it('deduplicates', () => {
    const found = parse('eggs and more eggs').ingredients;
    expect(found.filter((entry) => entry === 'eggs')).toHaveLength(1);
  });
});

describe('confidence', () => {
  it('is high when several constraints are extracted', () => {
    const result = parse('high protein Egyptian dinner under 150 EGP in 30 minutes');
    expect(result.confidence).toBeGreaterThan(LOW_CONFIDENCE);
  });

  it('is low when nothing useful can be extracted', () => {
    // This is the signal that the AI interpreter should be consulted.
    expect(parse('surprise me').confidence).toBeLessThan(LOW_CONFIDENCE);
  });
});

describe('the residual left for a title search', () => {
  // The rule: what the interpreter understood becomes a constraint, and only
  // what it did NOT understand may be matched against a recipe title.

  it('is empty when the whole query was understood', () => {
    expect(parse('chicken without bell pepper').keywords).toBe('');
    expect(parse('dinner in 20 minutes').keywords).toBe('');
    expect(parse('egyptian breakfast for 4 people').keywords).toBe('');
  });

  it('keeps a dish name the interpreter has no other use for', () => {
    // The case that makes this worth doing rather than just dropping the
    // title filter whenever anything was understood.
    expect(parse('koshari under 30 minutes').keywords).toBe('koshari');
    expect(parse('shakshuka for breakfast').keywords).toBe('shakshuka');
  });

  it('keeps a plain dish-name search as it was', () => {
    expect(parse('koshari').keywords).toBe('koshari');
  });

  it('turns a bare ingredient name into a constraint rather than a title', () => {
    // "molokhia" is in the ingredient catalogue, so it is understood — and
    // requiring the ingredient finds every molokhia recipe, including the ones
    // whose titles do not contain the word.
    const interpretation = parse('molokhia');
    expect(interpretation.ingredients).toContain('molokhia');
    expect(interpretation.keywords).toBe('');
  });

  it('drops the negated food, not just the word "without"', () => {
    // Leaving "bell pepper" in the residual would search for a title
    // containing the very thing the user ruled out.
    const keywords = parse('koshari without bell pepper').keywords;
    expect(keywords).toBe('koshari');
    expect(keywords).not.toContain('pepper');
  });

  it('drops an alias the user typed as surely as the canonical name', () => {
    expect(parse('pasta with capsicum').keywords).not.toContain('capsicum');
  });
});

describe('applyInterpretation', () => {
  it('layers extracted constraints onto the base request', () => {
    const query = 'high protein Egyptian dinner under 150 EGP in 30 minutes for 4 people';
    const request = applyInterpretation(base, parse(query), query);

    expect(request.mode).toBe('search');
    // REGRESSION: this used to assert the RAW query survived into
    // `request.query`. Once the query became a title filter in the database
    // layer, that made every structured search return nothing — no recipe is
    // called "high protein Egyptian dinner under 150 EGP in 30 minutes for 4
    // people". Everything here was understood, so there is no title left to
    // look for.
    expect(request.query).toBeNull();
    expect(request.budgetMinor).toBe(15000);
    expect(request.maxMinutes).toBe(30);
    expect(request.servings).toBe(4);
    expect(request.cuisine).toBe('egyptian');
    expect(request.mealType).toBe('dinner');
    expect(request.minProteinGrams).toBe(30);
  });

  it('never overwrites the caller safety constraints', () => {
    // Allergens and diet come from the profile, not the query string — a
    // search must not be able to relax them.
    const guarded: MealRequest = {
      ...base,
      allergens: ['nuts'],
      dietaryPreference: 'vegan',
    };
    const request = applyInterpretation(guarded, parse('peanut butter dessert'), 'x');

    expect(request.allergens).toEqual(['nuts']);
    expect(request.dietaryPreference).toBe('vegan');
  });

  it('keeps base values where the query said nothing', () => {
    const request = applyInterpretation(base, parse('surprise me'), 'surprise me');

    expect(request.servings).toBe(base.servings);
    expect(request.budgetMinor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The queries a person actually types. Every one of these runs locally and
// deterministically: no paid call is made to understand a search box.
// ---------------------------------------------------------------------------

describe('the phrases people type', () => {
  const parse = (query: string) => interpretQuery(query, 'EGP');

  it('"high protein dinner under 150 EGP"', () => {
    const result = parse('high protein dinner under 150 EGP');

    expect(result.minProteinGrams).toBe(30);
    expect(result.mealType).toBe('dinner');
    expect(result.budgetMinor).toBe(15000);
  });

  it('"dinner in 20 minutes"', () => {
    const result = parse('dinner in 20 minutes');

    expect(result.mealType).toBe('dinner');
    expect(result.maxMinutes).toBe(20);
  });

  it('"Egyptian food for four people"', () => {
    const result = parse('Egyptian food for four people');

    expect(result.cuisine).toBe('egyptian');
    expect(result.servings).toBe(4);
  });

  it('"something beefy" — a vague query is understood weakly, not wrongly', () => {
    const result = parse('something beefy');

    // Nothing is invented: no budget, no time, no meal type.
    expect(result.budgetMinor).toBeNull();
    expect(result.maxMinutes).toBeNull();
    expect(result.mealType).toBeNull();
    expect(result.confidence).toBeLessThan(LOW_CONFIDENCE);
  });

  it('finds the ingredient a query asks for', () => {
    expect(parse('pasta with tomatoes').ingredients).toEqual(
      expect.arrayContaining(['pasta', 'tomatoes']),
    );
  });

  it('EXCLUDES what a query rules out instead of searching for it', () => {
    const result = parse('something without chicken');

    expect(result.excludedIngredients).toContain('chicken breast');
    // The critical half: "without chicken" must not become "with chicken".
    expect(result.ingredients).not.toContain('chicken breast');
  });

  it('handles the other ways people phrase an exclusion', () => {
    expect(parse('pasta with no mushrooms').excludedIngredients).toContain('mushrooms');
    // "dairy" is an allergen rather than an ingredient, so the phrase to test
    // is one naming an actual food.
    expect(parse('dinner free of milk, quick').excludedIngredients).toContain('milk');
    expect(parse('حاجة بدون بصل').excludedIngredients).toContain('onions');
  });

  it('keeps the positive ingredients when a query does both', () => {
    const result = parse('rice with chicken but without tomatoes');

    expect(result.ingredients).toContain('rice');
    expect(result.excludedIngredients).toContain('tomatoes');
    expect(result.ingredients).not.toContain('tomatoes');
  });

  it('tolerates typos and spelling variants', () => {
    expect(parse('tomatos and eggs').ingredients).toEqual(
      expect.arrayContaining(['tomatoes', 'eggs']),
    );
  });

  it('resolves Arabic ingredient names', () => {
    expect(parse('عايز أكلة فيها فراخ').ingredients).toContain('chicken breast');
  });

  it('reads calories and cooking time together', () => {
    const result = parse('light lunch under 30 minutes');

    expect(result.maxCalories).toBe(500);
    expect(result.maxMinutes).toBe(30);
    expect(result.mealType).toBe('lunch');
  });

  it('never returns a budget it did not see', () => {
    expect(parse('quick pasta').budgetMinor).toBeNull();
  });
});

describe('exclusions survive into the request', () => {
  it('adds them to the list the ranker already filters on', () => {
    const interpretation = interpretQuery('something without chicken', 'EGP');
    const applied = applyInterpretation(base, interpretation, 'something without chicken');

    expect(applied.dislikedIngredients).toContain('chicken breast');
  });

  it('does not drop the user’s standing dislikes', () => {
    const withDislike = { ...base, dislikedIngredients: ['liver'] };
    const interpretation = interpretQuery('pasta without mushrooms', 'EGP');
    const applied = applyInterpretation(withDislike, interpretation, 'pasta without mushrooms');

    expect(applied.dislikedIngredients).toEqual(expect.arrayContaining(['liver', 'mushrooms']));
  });

  it('leaves allergies and diet untouched — they are enforced separately', () => {
    const guardedRequest = {
      ...base,
      allergens: ['nuts' as const],
      dietaryPreference: 'vegan' as const,
    };
    const interpretation = interpretQuery('dinner without onions', 'EGP');
    const applied = applyInterpretation(guardedRequest, interpretation, 'dinner without onions');

    expect(applied.allergens).toEqual(['nuts']);
    expect(applied.dietaryPreference).toBe('vegan');
  });
});

describe('Arabic numerals', () => {
  // An Arabic keyboard produces ١٥٠, and every number pattern in this module is
  // `\d`, which is ASCII-only. Before this, "أقل من ١٥٠ جنيه" understood
  // nothing at all — no budget, no time, no servings.
  it('reads a budget written in Arabic-Indic digits', () => {
    const result = interpretQuery('حاجة بالجبنة بأقل من ١٥٠ جنيه', 'EGP');
    expect(result.budgetMinor).toBe(15000);
  });

  it('reads a cooking time written in Arabic-Indic digits', () => {
    expect(interpretQuery('عشاء في ٢٠ دقيقة', 'EGP').maxMinutes).toBe(20);
  });

  it('still reads ASCII digits', () => {
    expect(interpretQuery('dinner in 20 minutes', 'EGP').maxMinutes).toBe(20);
  });
});

describe('the seeded examples are not decoration', () => {
  // Every example chip on the search screen submits its own text. One the
  // parser cannot read teaches the user a phrasing that does not work — which
  // is exactly what the Arabic ones would have done if they were translated
  // without being checked against the patterns.
  //
  // Read from the dictionaries rather than copied, so editing an example in
  // ar.ts without checking it against the parser fails here.
  const keys = [
    'search.example1',
    'search.example2',
    'search.example3',
    'search.example4',
    'search.example5',
  ] as const;

  const examples = (['en', 'ar'] as const).flatMap((language) => {
    const t = createTranslator(language);
    return keys.map((key) => [`${language}: ${t(key)}`, t(key)] as const);
  });

  it.each(examples)('understands %s', (_label, example) => {
    const result = interpretQuery(example, 'EGP');
    const understood =
      result.budgetMinor !== null ||
      result.maxMinutes !== null ||
      result.servings !== null ||
      result.cuisine !== null ||
      result.mealType !== null ||
      result.ingredients.length > 0 ||
      result.tags.length > 0 ||
      result.minProteinGrams !== null ||
      result.maxCalories !== null;

    expect(understood).toBe(true);
  });
});
