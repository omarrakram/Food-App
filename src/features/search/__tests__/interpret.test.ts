import { applyInterpretation, interpretQuery, LOW_CONFIDENCE } from '../interpret';
import type { MealRequest } from '@/types/domain';

const base: MealRequest = {
  mode: 'search',
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
  allergens: [],
  dislikedIngredients: [],
  appliances: [],
  skillLevel: 'intermediate',
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

describe('applyInterpretation', () => {
  it('layers extracted constraints onto the base request', () => {
    const query = 'high protein Egyptian dinner under 150 EGP in 30 minutes for 4 people';
    const request = applyInterpretation(base, parse(query), query);

    expect(request.mode).toBe('search');
    expect(request.query).toBe(query);
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
