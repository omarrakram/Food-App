import { DEMO_NOUR, DEMO_VIEWER_ID, demoPerson } from '@/features/demo/people';
import { getItem, setItem, StorageKeys } from '@/lib/storage';
import type {
  ModerationDecision,
  ModerationEvent,
  ModerationQueueEntry,
  RecipeSubmission,
  Recipe,
} from '@/types/domain';

/**
 * Community submissions and moderation.
 *
 * Verb-shaped, like `FriendsRepository` and `MessagesRepository`, and for the
 * same reason: every verb is a rule the database enforces. `submit` is
 * `submit_recipe()`, `decide` is `moderate_submission()` — which checks the
 * caller's role server-side and is the only route to `recipes.is_public`.
 *
 * There is deliberately no `grantRole`. Roles have no write policy at all, so
 * a method for it would be a method that always fails, and an interface with
 * one invites a screen that offers it.
 */

export type SubmissionDraft = {
  title: string;
  description: string;
  prepMinutes: number;
  cookMinutes: number;
  baseServings: number;
  cuisine: Recipe['cuisine'] | null;
  difficulty: Recipe['difficulty'];
  imageUrl: string | null;
  ingredients: {
    slug: string | null;
    name: string;
    quantity: number | null;
    unit: Recipe['ingredients'][number]['unit'];
    isOptional: boolean;
  }[];
  steps: { instruction: string; durationMinutes: number | null }[];
};

export interface SubmissionsRepository {
  /** The viewer's own submissions, newest first. */
  mine(): Promise<RecipeSubmission[]>;
  /** Creates the private recipe and its draft submission. Returns the id. */
  createDraft(draft: SubmissionDraft): Promise<string>;
  /** Replaces the recipe behind a draft, for a revision after feedback. */
  updateDraft(submissionId: string, draft: SubmissionDraft): Promise<void>;
  /** Sends a draft for review. */
  submit(submissionId: string): Promise<void>;
  /** Pulls a pending submission back out of the queue. */
  withdraw(submissionId: string): Promise<void>;

  // --- Moderation. Empty / refused for anybody without the role. -----------

  /** True when the viewer may moderate. Answered by the server. */
  canModerate(): Promise<boolean>;
  queue(): Promise<ModerationQueueEntry[]>;
  /** The recipe behind a submission, as the moderator will judge it. */
  submittedRecipe(recipeId: string): Promise<Recipe | null>;
  history(submissionId: string): Promise<ModerationEvent[]>;
  decide(submissionId: string, decision: ModerationDecision, feedback: string | null): Promise<void>;

  /** True when this implementation talks to a real backend. */
  readonly isLive: boolean;
}

const NEEDS_ACCOUNT = 'submissions need an account';

/**
 * The signed-out implementation: nothing, honestly.
 *
 * A submission is a request to publish to every user of the product. There is
 * no offline version of that, and a draft saved locally that could never be
 * sent would be a worse outcome than being told to sign in.
 */
export class LocalSubmissionsRepository implements SubmissionsRepository {
  readonly isLive = false;

  async mine(): Promise<RecipeSubmission[]> {
    return [];
  }
  async createDraft(): Promise<string> {
    throw new Error(NEEDS_ACCOUNT);
  }
  async updateDraft(): Promise<void> {
    throw new Error(NEEDS_ACCOUNT);
  }
  async submit(): Promise<void> {
    throw new Error(NEEDS_ACCOUNT);
  }
  async withdraw(): Promise<void> {
    throw new Error(NEEDS_ACCOUNT);
  }
  async canModerate(): Promise<boolean> {
    return false;
  }
  async queue(): Promise<ModerationQueueEntry[]> {
    return [];
  }
  async submittedRecipe(): Promise<Recipe | null> {
    return null;
  }
  async history(): Promise<ModerationEvent[]> {
    return [];
  }
  async decide(): Promise<void> {
    throw new Error(NEEDS_ACCOUNT);
  }
}

// ---------------------------------------------------------------------------
// Demo mode
// ---------------------------------------------------------------------------

type DemoSubmissionsState = {
  submissions: RecipeSubmission[];
  /** The recipe behind each submission, as the author wrote it. */
  recipes: Record<string, SubmissionDraft>;
  events: ModerationEvent[];
  /** Whether the viewer is previewing as a moderator. */
  moderating: boolean;
};

/**
 * How the preview decides whether the viewer is a moderator.
 *
 * In the real app this is `is_moderator()` — a server-side check against a
 * table no client can write. There is no server here, so the preview has a
 * switch instead, and the moderator screens say plainly that this is a preview
 * of what a moderator sees rather than a role anybody has been granted.
 *
 * This must never be mistaken for the production authorization model. It is
 * not one: it is a way of LOOKING at a screen that, in production, only a
 * grant made by the service role can reach.
 */
const DEMO_MODERATOR_DEFAULT = true;

function seedSubmissions(): DemoSubmissionsState {
  const draft: SubmissionDraft = {
    title: 'Nour’s lemon roast chicken',
    description: 'A whole chicken, a lot of lemon, and an hour of not watching it.',
    prepMinutes: 15,
    cookMinutes: 60,
    baseServings: 4,
    cuisine: 'egyptian',
    difficulty: 'easy',
    imageUrl: null,
    ingredients: [
      { slug: 'chicken-whole', name: 'whole chicken', quantity: 1, unit: 'piece', isOptional: false },
      { slug: 'lemon', name: 'lemons', quantity: 3, unit: 'piece', isOptional: false },
      { slug: 'garlic', name: 'garlic', quantity: 6, unit: 'clove', isOptional: false },
      { slug: 'olive-oil', name: 'olive oil', quantity: 3, unit: 'tbsp', isOptional: false },
    ],
    steps: [
      { instruction: 'Heat the oven to 200°C.', durationMinutes: null },
      { instruction: 'Rub the chicken with oil, salt and the zest of one lemon.', durationMinutes: 5 },
      { instruction: 'Roast for an hour, basting once.', durationMinutes: 60 },
    ],
  };

  return {
    submissions: [
      {
        id: 'demo-sub-1',
        recipeId: 'demo-recipe-1',
        authorId: DEMO_NOUR.id,
        title: draft.title,
        status: 'pending',
        revision: 1,
        submittedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
        decidedAt: null,
        authorNote: null,
        createdAt: new Date(Date.now() - 26 * 3_600_000).toISOString(),
      },
      {
        id: 'demo-sub-2',
        recipeId: 'demo-recipe-2',
        authorId: DEMO_VIEWER_ID,
        title: 'Weeknight lentil soup',
        status: 'changes_requested',
        revision: 1,
        submittedAt: new Date(Date.now() - 50 * 3_600_000).toISOString(),
        decidedAt: new Date(Date.now() - 40 * 3_600_000).toISOString(),
        authorNote: 'Please add quantities for the spices, and say how long to simmer.',
        createdAt: new Date(Date.now() - 60 * 3_600_000).toISOString(),
      },
    ],
    recipes: {
      'demo-recipe-1': draft,
      'demo-recipe-2': {
        ...draft,
        title: 'Weeknight lentil soup',
        description: 'Lentils, an onion, and whatever spice is nearest.',
        cookMinutes: 30,
        ingredients: [
          { slug: 'red-lentils', name: 'red lentils', quantity: 250, unit: 'g', isOptional: false },
          { slug: 'onions', name: 'onion', quantity: 1, unit: 'piece', isOptional: false },
          { slug: 'cumin', name: 'cumin', quantity: null, unit: null, isOptional: false },
        ],
        steps: [{ instruction: 'Simmer everything until soft.', durationMinutes: null }],
      },
    },
    events: [
      {
        id: 'demo-ev-1',
        submissionId: 'demo-sub-1',
        actorId: DEMO_NOUR.id,
        action: 'submit',
        note: null,
        revision: 1,
        createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      },
    ],
    moderating: DEMO_MODERATOR_DEFAULT,
  };
}

/**
 * Submissions against this device, for previewing the screens without a
 * backend.
 *
 * The state machine is real — a draft submits, a moderator's request for
 * changes comes back to the author with feedback, a resubmission bumps the
 * revision, an approval is the only thing that would publish. What is NOT real
 * is the authorization: in production `canModerate` is a server-side role
 * check against a table with no write policy, and here it is a flag. The
 * moderator screens say so.
 */
export class DemoSubmissionsRepository implements SubmissionsRepository {
  readonly isLive = false;

  private async state(): Promise<DemoSubmissionsState> {
    return (await getItem<DemoSubmissionsState>(StorageKeys.demoSubmissions)) ?? seedSubmissions();
  }

  private async save(next: DemoSubmissionsState): Promise<void> {
    await setItem(StorageKeys.demoSubmissions, next);
  }

  async mine(): Promise<RecipeSubmission[]> {
    const state = await this.state();
    return state.submissions
      .filter((entry) => entry.authorId === DEMO_VIEWER_ID)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createDraft(draft: SubmissionDraft): Promise<string> {
    const state = await this.state();
    const id = `demo-sub-${Date.now()}`;
    const recipeId = `demo-recipe-${Date.now()}`;
    await this.save({
      ...state,
      submissions: [
        {
          id,
          recipeId,
          authorId: DEMO_VIEWER_ID,
          title: draft.title,
          status: 'draft',
          revision: 1,
          submittedAt: null,
          decidedAt: null,
          authorNote: null,
          createdAt: new Date().toISOString(),
        },
        ...state.submissions,
      ],
      recipes: { ...state.recipes, [recipeId]: draft },
    });
    return id;
  }

  async updateDraft(submissionId: string, draft: SubmissionDraft): Promise<void> {
    const state = await this.state();
    const entry = state.submissions.find((row) => row.id === submissionId);
    if (!entry) return;
    await this.save({
      ...state,
      submissions: state.submissions.map((row) =>
        row.id === submissionId ? { ...row, title: draft.title } : row,
      ),
      recipes: { ...state.recipes, [entry.recipeId]: draft },
    });
  }

  async submit(submissionId: string): Promise<void> {
    const state = await this.state();
    const entry = state.submissions.find((row) => row.id === submissionId);
    if (!entry) throw new Error('no such submission');
    if (entry.status !== 'draft' && entry.status !== 'changes_requested') {
      throw new Error('that submission is not editable');
    }

    const revision = entry.status === 'changes_requested' ? entry.revision + 1 : entry.revision;
    await this.save({
      ...state,
      submissions: state.submissions.map((row) =>
        row.id === submissionId
          ? {
              ...row,
              status: 'pending',
              revision,
              submittedAt: new Date().toISOString(),
              decidedAt: null,
            }
          : row,
      ),
      events: [
        ...state.events,
        {
          id: `demo-ev-${Date.now()}`,
          submissionId,
          actorId: DEMO_VIEWER_ID,
          action: entry.status === 'changes_requested' ? 'resubmit' : 'submit',
          note: null,
          revision,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }

  async withdraw(submissionId: string): Promise<void> {
    const state = await this.state();
    await this.save({
      ...state,
      submissions: state.submissions.map((row) =>
        row.id === submissionId && row.status === 'pending'
          ? { ...row, status: 'draft', submittedAt: null }
          : row,
      ),
    });
  }

  async canModerate(): Promise<boolean> {
    return (await this.state()).moderating;
  }

  async queue(): Promise<ModerationQueueEntry[]> {
    const state = await this.state();
    if (!state.moderating) return [];
    return state.submissions
      .filter((entry) => entry.status === 'pending')
      .map((entry) => {
        const author = demoPerson(entry.authorId);
        return {
          submissionId: entry.id,
          recipeId: entry.recipeId,
          title: entry.title,
          authorId: entry.authorId,
          authorName: author?.displayName ?? 'You',
          authorHandle: author?.username ?? 'you',
          status: entry.status,
          revision: entry.revision,
          submittedAt: entry.submittedAt,
        };
      })
      .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
  }

  async submittedRecipe(recipeId: string): Promise<Recipe | null> {
    const state = await this.state();
    const draft = state.recipes[recipeId];
    if (!draft) return null;
    return draftToRecipe(recipeId, draft);
  }

  async history(submissionId: string): Promise<ModerationEvent[]> {
    const state = await this.state();
    if (!state.moderating) return [];
    return state.events
      .filter((event) => event.submissionId === submissionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async decide(
    submissionId: string,
    decision: ModerationDecision,
    feedback: string | null,
  ): Promise<void> {
    const state = await this.state();
    if (!state.moderating) throw new Error('not a moderator');
    if (decision !== 'approve' && !feedback?.trim()) {
      throw new Error('feedback is required');
    }

    const entry = state.submissions.find((row) => row.id === submissionId);
    if (!entry || entry.status !== 'pending') throw new Error('that submission is not pending');

    const status =
      decision === 'approve'
        ? ('approved' as const)
        : decision === 'reject'
          ? ('rejected' as const)
          : ('changes_requested' as const);

    await this.save({
      ...state,
      submissions: state.submissions.map((row) =>
        row.id === submissionId
          ? { ...row, status, decidedAt: new Date().toISOString(), authorNote: feedback }
          : row,
      ),
      events: [
        ...state.events,
        {
          id: `demo-ev-${Date.now()}`,
          submissionId,
          actorId: DEMO_VIEWER_ID,
          action: decision,
          note: feedback,
          revision: entry.revision,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }
}

/**
 * A draft, rendered as a recipe so the moderator screen can use the same
 * components the rest of the app does.
 *
 * `isPublic` is false and stays false: approving in demo mode changes the
 * submission's status and nothing else, because there is no catalogue here to
 * publish into and pretending otherwise would misrepresent what approval does.
 */
function draftToRecipe(recipeId: string, draft: SubmissionDraft): Recipe {
  return {
    id: recipeId,
    slug: null,
    title: draft.title,
    titleAr: null,
    description: draft.description,
    descriptionAr: null,
    imageUrl: draft.imageUrl,
    image: null,
    source: 'user',
    cuisine: draft.cuisine,
    mealTypes: [],
    dietTags: [],
    allergens: [],
    requiredAppliances: [],
    tags: [],
    difficulty: draft.difficulty,
    prepMinutes: draft.prepMinutes,
    cookMinutes: draft.cookMinutes,
    baseServings: draft.baseServings,
    // A community submission has no reliable figures, and '—' is better than
    // a guess presented as data.
    nutrition: {
      calories: null,
      proteinGrams: null,
      carbsGrams: null,
      fatGrams: null,
      fiberGrams: null,
    },
    ingredients: draft.ingredients.map((line, index) => ({
      id: `${recipeId}-i${index}`,
      ingredientId: null,
      slug: line.slug,
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      preparation: null,
      isOptional: line.isOptional,
      isGarnish: false,
      isPantryStaple: false,
      notes: null,
      sortOrder: index + 1,
    })),
    steps: draft.steps.map((step, index) => ({
      id: `${recipeId}-s${index}`,
      stepNumber: index + 1,
      instruction: step.instruction,
      instructionAr: null,
      durationMinutes: step.durationMinutes,
      safetyNote: null,
      safetyNoteAr: null,
      ingredientRefs: [],
    })),
    createdAt: new Date().toISOString(),
  };
}
