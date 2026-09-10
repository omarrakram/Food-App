import { violatesAllergens } from '@/features/recipes/rank';

import {
  AI_LIMITS,
  extractJson,
  INTERPRET_JSON_SCHEMA,
  parseInterpretResponse,
  parseSuggestResponse,
  SUGGEST_JSON_SCHEMA,
  toDomainRecipe,
  type GeneratedRecipe,
} from '../schema';

function validRecipe(overrides: Partial<GeneratedRecipe> = {}): GeneratedRecipe {
  return {
    title: 'Garlic Rice',
    description: 'Simple rice with garlic.',
    cuisine: 'egyptian',
    mealTypes: ['dinner'],
    difficulty: 'easy',
    prepMinutes: 5,
    cookMinutes: 20,
    servings: 2,
    calories: 400,
    proteinGrams: 8,
    carbsGrams: 70,
    fatGrams: 6,
    ingredients: [
      { name: 'rice', quantity: 200, unit: 'g', preparation: 'rinsed', isOptional: false },
      { name: 'garlic', quantity: 2, unit: 'clove', preparation: null, isOptional: false },
    ],
    steps: [
      {
        instruction: 'Rinse the rice until the water runs clear.',
        durationMinutes: 2,
        ingredientRefs: ['rice'],
        safetyNote: null,
      },
    ],
    allergens: [],
    dietTags: ['vegan'],
    requiredAppliances: ['stove'],
    tags: ['quick'],
    ...overrides,
  };
}

describe('SUGGEST_JSON_SCHEMA', () => {
  it('is a strict schema the API will accept', () => {
    // Structured outputs require additionalProperties:false and explicit
    // required lists. Generating from Zod is what guarantees that.
    const schema = SUGGEST_JSON_SCHEMA as Record<string, unknown>;
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['recipes']);
  });

  it('bounds the number of recipes so one response cannot run away', () => {
    const properties = (SUGGEST_JSON_SCHEMA as unknown as {
      properties: Record<string, { maxItems?: number }>;
    }).properties;

    expect(properties.recipes?.maxItems).toBe(AI_LIMITS.maxRecipes);
  });

  it('generates an interpret schema too', () => {
    const schema = INTERPRET_JSON_SCHEMA as Record<string, unknown>;
    expect(schema.additionalProperties).toBe(false);
  });
});

describe('parseSuggestResponse', () => {
  it('accepts a well-formed response', () => {
    const result = parseSuggestResponse({ recipes: [validRecipe()] });
    expect(result.ok).toBe(true);
  });

  it('REJECTS a response missing a required field', () => {
    const { title: _title, ...withoutTitle } = validRecipe();
    const result = parseSuggestResponse({ recipes: [withoutTitle] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('title');
  });

  it('REJECTS an unknown enum value', () => {
    // A hallucinated allergen must not become a silently-ignored field.
    const result = parseSuggestResponse({
      recipes: [validRecipe({ allergens: ['unobtainium'] as never })],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an empty recipe list', () => {
    expect(parseSuggestResponse({ recipes: [] }).ok).toBe(false);
  });

  it('rejects a recipe with no ingredients or no steps', () => {
    expect(parseSuggestResponse({ recipes: [validRecipe({ ingredients: [] })] }).ok).toBe(false);
    expect(parseSuggestResponse({ recipes: [validRecipe({ steps: [] })] }).ok).toBe(false);
  });

  it('rejects out-of-range numbers', () => {
    expect(parseSuggestResponse({ recipes: [validRecipe({ cookMinutes: 99999 })] }).ok).toBe(
      false,
    );
    expect(parseSuggestResponse({ recipes: [validRecipe({ servings: 0 })] }).ok).toBe(false);
  });

  it('rejects more recipes than the limit', () => {
    const many = Array.from({ length: AI_LIMITS.maxRecipes + 1 }, () => validRecipe());
    expect(parseSuggestResponse({ recipes: many }).ok).toBe(false);
  });

  it('rejects a non-object payload outright', () => {
    expect(parseSuggestResponse(null).ok).toBe(false);
    expect(parseSuggestResponse('recipes!').ok).toBe(false);
    expect(parseSuggestResponse([validRecipe()]).ok).toBe(false);
  });

  it('reports paths and codes only, never the offending value', () => {
    const result = parseSuggestResponse({
      recipes: [validRecipe({ title: 'SECRET-VALUE-SHOULD-NOT-LEAK'.repeat(20) })],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain('SECRET-VALUE');
  });
});

describe('parseInterpretResponse', () => {
  it('accepts a valid interpretation', () => {
    const result = parseInterpretResponse({
      ingredients: ['chicken'],
      budgetMinor: 15000,
      maxMinutes: 30,
      minProteinGrams: 30,
      maxCalories: null,
      servings: 4,
      mealType: 'dinner',
      cuisine: 'egyptian',
      tags: ['quick'],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a negative budget', () => {
    const result = parseInterpretResponse({
      ingredients: [],
      budgetMinor: -1,
      maxMinutes: null,
      minProteinGrams: null,
      maxCalories: null,
      servings: null,
      mealType: null,
      cuisine: null,
      tags: [],
    });
    expect(result.ok).toBe(false);
  });
});

describe('extractJson', () => {
  it('parses bare JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('recovers JSON from a fenced block', () => {
    const result = extractJson('Here you go:\n```json\n{"a":1}\n```\nHope that helps!');
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it('recovers JSON surrounded by prose', () => {
    expect(extractJson('Sure! {"a":1} Done.')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('REJECTS truncated JSON rather than trusting a partial parse', () => {
    expect(extractJson('{"a":1, "b":').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(extractJson('   ').ok).toBe(false);
  });
});

describe('toDomainRecipe', () => {
  let counter = 0;
  const makeId = () => `id-${(counter += 1)}`;

  beforeEach(() => {
    counter = 0;
  });

  it('maps a generated recipe onto the domain type', () => {
    const recipe = toDomainRecipe(validRecipe(), makeId, '2026-09-10T00:00:00.000Z');

    expect(recipe.source).toBe('ai_generated');
    expect(recipe.title).toBe('Garlic Rice');
    expect(recipe.baseServings).toBe(2);
    expect(recipe.ingredients).toHaveLength(2);
    expect(recipe.steps[0]?.stepNumber).toBe(1);
    expect(recipe.createdAt).toBe('2026-09-10T00:00:00.000Z');
  });

  it('has no image, so the UI renders its placeholder', () => {
    expect(toDomainRecipe(validRecipe(), makeId).imageUrl).toBeNull();
  });

  it('tags the recipe as generated without losing the model tags', () => {
    const recipe = toDomainRecipe(validRecipe({ tags: ['quick', 'cheap'] }), makeId);
    expect(recipe.tags).toEqual(['ai-generated', 'quick', 'cheap']);
  });

  it('gives every ingredient and step a distinct id', () => {
    const recipe = toDomainRecipe(validRecipe(), makeId);
    const ids = [recipe.id, ...recipe.ingredients.map((i) => i.id), ...recipe.steps.map((s) => s.id)];

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves ingredientId null — generated names are not yet canonicalised', () => {
    const recipe = toDomainRecipe(validRecipe(), makeId);
    expect(recipe.ingredients.every((entry) => entry.ingredientId === null)).toBe(true);
  });
});

describe('allergen re-check after generation', () => {
  const makeId = () => Math.random().toString(36).slice(2);

  it('CATCHES a generated recipe that hides an allergen from its own list', () => {
    // The model claimed no allergens but used milk. The declared list is not
    // trusted: the ranking engine derives allergens from the ingredients too.
    const lying = validRecipe({
      allergens: [],
      ingredients: [
        { name: 'rice', quantity: 200, unit: 'g', preparation: null, isOptional: false },
        { name: 'milk', quantity: 200, unit: 'ml', preparation: null, isOptional: false },
      ],
    });

    const recipe = toDomainRecipe(lying, makeId);
    expect(violatesAllergens(recipe, ['dairy'])).toBe(true);
  });

  it('catches an allergen hidden in an optional ingredient', () => {
    const garnished = validRecipe({
      allergens: [],
      ingredients: [
        { name: 'rice', quantity: 200, unit: 'g', preparation: null, isOptional: false },
        { name: 'walnuts', quantity: 20, unit: 'g', preparation: null, isOptional: true },
      ],
    });

    expect(violatesAllergens(toDomainRecipe(garnished, makeId), ['nuts'])).toBe(true);
  });

  it('lets a genuinely safe generated recipe through', () => {
    expect(violatesAllergens(toDomainRecipe(validRecipe(), makeId), ['dairy', 'nuts'])).toBe(
      false,
    );
  });
});
