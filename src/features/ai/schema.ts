import { z } from 'zod';

// Relative imports, not the `@/` alias: this module is loaded by BOTH the
// React Native bundler and the Deno runtime that executes the edge functions,
// and Deno cannot resolve the alias. Keeping one copy of the contract is worth
// the two relative paths — a drifting duplicate is how a schema change reaches
// production validated on one side only.
import {
  ALLERGENS,
  APPLIANCES,
  CUISINES,
  DIETARY_PREFERENCES,
  DIFFICULTIES,
  MEAL_TYPES,
  UNITS,
  type Recipe,
} from '../../types/domain.ts';

/**
 * The contract between the app and the model.
 *
 * The model's output is untrusted: it is constrained by a JSON Schema on the
 * request, validated by these Zod schemas on the response, and then re-checked
 * against the user's allergens by the ranking engine. Anything that fails
 * validation is discarded — a partially-valid recipe is never repaired and
 * shown.
 */

// --- Limits ---------------------------------------------------------------
// Bounds are part of the schema, not just documentation: they cap how much a
// single response can cost to validate and render, and stop a runaway
// generation producing a 400-step recipe.

export const AI_LIMITS = {
  maxRecipes: 6,
  maxIngredients: 25,
  maxSteps: 15,
  maxTitleLength: 120,
  maxDescriptionLength: 320,
  maxInstructionLength: 600,
  maxMinutes: 480,
  maxServings: 12,
} as const;

const nonEmptyString = (max: number) => z.string().trim().min(1).max(max);

export const GeneratedIngredientSchema = z.object({
  name: nonEmptyString(80),
  quantity: z.number().min(0).max(10000).nullable(),
  unit: z.enum(UNITS).nullable(),
  preparation: z.string().max(120).nullable(),
  isOptional: z.boolean(),
});

export const GeneratedStepSchema = z.object({
  instruction: nonEmptyString(AI_LIMITS.maxInstructionLength),
  durationMinutes: z.number().int().min(0).max(AI_LIMITS.maxMinutes).nullable(),
  /** Ingredient names this step uses, surfaced beside it in cooking mode. */
  ingredientRefs: z.array(z.string().max(80)).max(AI_LIMITS.maxIngredients),
  /**
   * FOOD SAFETY: required (may be null) rather than optional, so the model is
   * always prompted to consider whether a step needs handling guidance.
   */
  safetyNote: z.string().max(300).nullable(),
});

export const GeneratedRecipeSchema = z.object({
  title: nonEmptyString(AI_LIMITS.maxTitleLength),
  description: z.string().trim().max(AI_LIMITS.maxDescriptionLength),
  cuisine: z.enum(CUISINES).nullable(),
  mealTypes: z.array(z.enum(MEAL_TYPES)).min(1).max(MEAL_TYPES.length),
  difficulty: z.enum(DIFFICULTIES),
  prepMinutes: z.number().int().min(0).max(AI_LIMITS.maxMinutes),
  cookMinutes: z.number().int().min(0).max(AI_LIMITS.maxMinutes),
  servings: z.number().int().min(1).max(AI_LIMITS.maxServings),
  calories: z.number().int().min(0).max(5000).nullable(),
  proteinGrams: z.number().min(0).max(500).nullable(),
  carbsGrams: z.number().min(0).max(500).nullable(),
  fatGrams: z.number().min(0).max(500).nullable(),
  ingredients: z.array(GeneratedIngredientSchema).min(1).max(AI_LIMITS.maxIngredients),
  steps: z.array(GeneratedStepSchema).min(1).max(AI_LIMITS.maxSteps),
  /** Every allergen present anywhere in the recipe. Re-verified client-side. */
  allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length),
  dietTags: z.array(z.enum(DIETARY_PREFERENCES)).max(DIETARY_PREFERENCES.length),
  requiredAppliances: z.array(z.enum(APPLIANCES)).min(1).max(APPLIANCES.length),
  tags: z.array(z.string().max(40)).max(10),
});

export const SuggestResponseSchema = z.object({
  recipes: z.array(GeneratedRecipeSchema).min(1).max(AI_LIMITS.maxRecipes),
});

export const InterpretResponseSchema = z.object({
  ingredients: z.array(z.string().max(80)).max(20),
  budgetMinor: z.number().int().min(0).max(100_000_000).nullable(),
  maxMinutes: z.number().int().min(1).max(AI_LIMITS.maxMinutes).nullable(),
  minProteinGrams: z.number().int().min(0).max(300).nullable(),
  maxCalories: z.number().int().min(0).max(5000).nullable(),
  servings: z.number().int().min(1).max(AI_LIMITS.maxServings).nullable(),
  mealType: z.enum(MEAL_TYPES).nullable(),
  cuisine: z.enum(CUISINES).nullable(),
  tags: z.array(z.string().max(40)).max(6),
});

export type GeneratedRecipe = z.infer<typeof GeneratedRecipeSchema>;
export type SuggestResponse = z.infer<typeof SuggestResponseSchema>;
export type InterpretResponse = z.infer<typeof InterpretResponseSchema>;

/**
 * JSON Schemas sent to the model as `output_config.format`.
 *
 * Generated from the Zod schemas above so the constraint the model is given
 * and the validation the response is checked against can never disagree.
 */
export const SUGGEST_JSON_SCHEMA = z.toJSONSchema(SuggestResponseSchema, {
  target: 'draft-2020-12',
});

export const INTERPRET_JSON_SCHEMA = z.toJSONSchema(InterpretResponseSchema, {
  target: 'draft-2020-12',
});

/**
 * Parses a raw model response.
 *
 * Returns a discriminated result rather than throwing: the caller's job is to
 * retry once and then fall back to local results, and an exception would make
 * that flow read like an error path when it is an expected one.
 */
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function parseSuggestResponse(raw: unknown): ParseResult<SuggestResponse> {
  const result = SuggestResponseSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: summariseIssues(result.error) };
}

export function parseInterpretResponse(raw: unknown): ParseResult<InterpretResponse> {
  const result = InterpretResponseSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: summariseIssues(result.error) };
}

/**
 * Compact, loggable description of what failed validation.
 *
 * Paths and codes only — never the offending values, which are model output
 * derived from user text and must not reach logs.
 */
function summariseIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`)
    .join('; ');
}

/**
 * Extracts a JSON object from a model response body.
 *
 * With `output_config.format` the text block is already bare JSON, but a
 * response that arrived some other way (an older model, a retry that ignored
 * the format) may wrap it in prose or a fenced block. Recovering the object is
 * cheap; trusting a partial parse is not, so anything that does not parse
 * cleanly is rejected outright.
 */
export function extractJson(text: string): ParseResult<unknown> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'empty response' };

  const candidates = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // Try the next candidate.
    }
  }

  return { ok: false, error: 'response was not valid JSON' };
}

/**
 * Converts a validated generated recipe into the app's domain type.
 *
 * `makeId` is injected so tests are deterministic and the client can use the
 * platform's crypto. Ids must be UUIDs: a generated recipe the user saves
 * becomes a row in `recipes`, whose primary key is a uuid.
 */
export function toDomainRecipe(
  generated: GeneratedRecipe,
  makeId: () => string,
  createdAt: string = new Date().toISOString(),
): Recipe {
  return {
    id: makeId(),
    slug: null,
    title: generated.title,
    description: generated.description,
    // The model answers in one language. We do not machine-translate a recipe
    // behind the user's back — a mistranslated step is a bad dinner and a
    // mistranslated safety note is worse — so the renderer falls back to what
    // the model actually wrote.
    titleAr: null,
    descriptionAr: null,
    // Generated recipes have no photograph. The card and detail screens both
    // render a themed placeholder for a null image rather than a broken one.
    imageUrl: null,
    source: 'ai_generated',
    cuisine: generated.cuisine,
    mealTypes: generated.mealTypes,
    difficulty: generated.difficulty,
    prepMinutes: generated.prepMinutes,
    cookMinutes: generated.cookMinutes,
    baseServings: generated.servings,
    nutrition: {
      calories: generated.calories,
      proteinGrams: generated.proteinGrams,
      carbsGrams: generated.carbsGrams,
      fatGrams: generated.fatGrams,
      fiberGrams: null,
    },
    ingredients: generated.ingredients.map((ingredient, index) => ({
      id: makeId(),
      ingredientId: null,
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      preparation: ingredient.preparation,
      isOptional: ingredient.isOptional,
      sortOrder: index,
    })),
    steps: generated.steps.map((step, index) => ({
      id: makeId(),
      stepNumber: index + 1,
      instruction: step.instruction,
      instructionAr: null,
      durationMinutes: step.durationMinutes,
      ingredientRefs: step.ingredientRefs,
      safetyNote: step.safetyNote,
      safetyNoteAr: null,
    })),
    allergens: generated.allergens,
    dietTags: generated.dietTags,
    requiredAppliances: generated.requiredAppliances,
    tags: [...new Set(['ai-generated', ...generated.tags])],
    createdAt,
  };
}
