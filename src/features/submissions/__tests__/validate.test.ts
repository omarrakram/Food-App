import { emptyDraft, validateDraft } from '@/features/submissions/validate';
import type { SubmissionDraft } from '@/features/submissions/repository';

/**
 * What has to be true before a recipe reaches a human.
 *
 * These rules duplicate the database's constraints on purpose, and the reason
 * is worth stating: the database is the boundary, and this is the copy that
 * answers while the user is still looking at the field. A moderator's time is
 * the scarce resource, and a submission with no steps is not a judgement call.
 */

function usable(overrides: Partial<SubmissionDraft> = {}): SubmissionDraft {
  return {
    ...emptyDraft(),
    title: 'Lemon roast chicken',
    ingredients: [
      { slug: 'chicken-whole', name: 'chicken', quantity: 1, unit: 'piece', isOptional: false },
      { slug: 'lemon', name: 'lemons', quantity: 3, unit: 'piece', isOptional: false },
    ],
    steps: [
      { instruction: 'Heat the oven.', durationMinutes: null },
      { instruction: 'Roast the chicken.', durationMinutes: 60 },
    ],
    ...overrides,
  };
}

describe('validateDraft', () => {
  it('passes a complete draft', () => {
    expect(validateDraft(usable())).toEqual([]);
  });

  it('refuses a nameless recipe', () => {
    expect(validateDraft(usable({ title: '   ' }))).toContain('title_missing');
  });

  it('refuses one ingredient — that is a note, not a recipe', () => {
    const draft = usable();
    expect(
      validateDraft({ ...draft, ingredients: [draft.ingredients[0]!] }),
    ).toContain('too_few_ingredients');
  });

  it('refuses a single step', () => {
    const draft = usable();
    expect(validateDraft({ ...draft, steps: [draft.steps[0]!] })).toContain('too_few_steps');
  });

  it('catches an empty step left behind by the Add button', () => {
    const draft = usable();
    expect(
      validateDraft({
        ...draft,
        steps: [...draft.steps, { instruction: '', durationMinutes: null }],
      }),
    ).toContain('step_empty');
  });

  it('catches an ingredient row with no name', () => {
    const draft = usable();
    expect(
      validateDraft({
        ...draft,
        ingredients: [
          ...draft.ingredients,
          { slug: null, name: '  ', quantity: null, unit: null, isOptional: false },
        ],
      }),
    ).toContain('ingredient_unnamed');
  });

  it('refuses a cooking time no oven has', () => {
    expect(validateDraft(usable({ cookMinutes: 9000 }))).toContain('time_out_of_range');
    expect(validateDraft(usable({ prepMinutes: -5 }))).toContain('time_out_of_range');
  });

  it('refuses servings outside what the database will take', () => {
    // Matches `recipes_servings_range`. Diverging here would mean the form
    // accepting something the insert then refuses, which is the worst place
    // to find out.
    expect(validateDraft(usable({ baseServings: 0 }))).toContain('servings_out_of_range');
    expect(validateDraft(usable({ baseServings: 51 }))).toContain('servings_out_of_range');
    expect(validateDraft(usable({ baseServings: 50 }))).not.toContain('servings_out_of_range');
  });

  it('refuses a title longer than the column', () => {
    expect(validateDraft(usable({ title: 'a'.repeat(201) }))).toContain('title_too_long');
  });

  it('reports everything at once rather than one thing at a time', () => {
    // A form that reveals its objections one by one is a form people abandon.
    const problems = validateDraft(emptyDraft());
    expect(problems).toContain('title_missing');
    expect(problems).toContain('too_few_ingredients');
    expect(problems).toContain('too_few_steps');
  });
});

describe('emptyDraft', () => {
  it('starts with one step, so the form is not a blank screen', () => {
    expect(emptyDraft().steps).toHaveLength(1);
  });

  it('is not submittable as it stands', () => {
    expect(validateDraft(emptyDraft()).length).toBeGreaterThan(0);
  });
});
