import type { SubmissionDraft } from './repository';

/**
 * What has to be true before a recipe goes to a human.
 *
 * These are the SAME rules the database enforces (`recipes_title_length`,
 * `recipes_prep_range`, and so on), restated where the user can act on them.
 * That duplication is deliberate and the direction matters: the database is
 * the boundary, and this exists so the answer arrives while the user is still
 * looking at the field rather than as a constraint violation after Submit.
 *
 * A moderator's time is the scarce resource here. A submission with no steps
 * is not a judgement call, so it should never reach the queue.
 */

export const SUBMISSION_LIMITS = {
  titleMax: 200,
  descriptionMax: 2000,
  minutesMax: 1440,
  servingsMin: 1,
  servingsMax: 50,
  minIngredients: 2,
  minSteps: 2,
  stepMax: 1000,
} as const;

export type DraftProblem =
  | 'title_missing'
  | 'title_too_long'
  | 'description_too_long'
  | 'too_few_ingredients'
  | 'ingredient_unnamed'
  | 'too_few_steps'
  | 'step_empty'
  | 'step_too_long'
  | 'time_out_of_range'
  | 'servings_out_of_range';

export function validateDraft(draft: SubmissionDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const title = draft.title.trim();

  if (!title) problems.push('title_missing');
  if (title.length > SUBMISSION_LIMITS.titleMax) problems.push('title_too_long');
  if (draft.description.length > SUBMISSION_LIMITS.descriptionMax) {
    problems.push('description_too_long');
  }

  const named = draft.ingredients.filter((line) => line.name.trim().length > 0);
  if (named.length < SUBMISSION_LIMITS.minIngredients) problems.push('too_few_ingredients');
  if (named.length !== draft.ingredients.length) problems.push('ingredient_unnamed');

  const written = draft.steps.filter((step) => step.instruction.trim().length > 0);
  if (written.length < SUBMISSION_LIMITS.minSteps) problems.push('too_few_steps');
  if (written.length !== draft.steps.length) problems.push('step_empty');
  if (draft.steps.some((step) => step.instruction.length > SUBMISSION_LIMITS.stepMax)) {
    problems.push('step_too_long');
  }

  const outOfRange = (value: number) =>
    !Number.isFinite(value) || value < 0 || value > SUBMISSION_LIMITS.minutesMax;
  if (outOfRange(draft.prepMinutes) || outOfRange(draft.cookMinutes)) {
    problems.push('time_out_of_range');
  }

  if (
    !Number.isFinite(draft.baseServings) ||
    draft.baseServings < SUBMISSION_LIMITS.servingsMin ||
    draft.baseServings > SUBMISSION_LIMITS.servingsMax
  ) {
    problems.push('servings_out_of_range');
  }

  return problems;
}

/** An empty draft, so the form never starts from `undefined`. */
export function emptyDraft(): SubmissionDraft {
  return {
    title: '',
    description: '',
    prepMinutes: 10,
    cookMinutes: 20,
    baseServings: 4,
    cuisine: null,
    difficulty: 'easy',
    imageUrl: null,
    ingredients: [],
    steps: [{ instruction: '', durationMinutes: null }],
  };
}
