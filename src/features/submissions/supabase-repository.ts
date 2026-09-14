import type { SupabaseClient } from '@supabase/supabase-js';

import { RECIPE_SELECT, rowsToRecipe, type RecipeQueryRow } from '@/features/recipes/mapper';
import { toAppError } from '@/lib/errors';
import type { Database } from '@/lib/supabase/database.types';
import type {
  ModerationDecision,
  ModerationEvent,
  ModerationQueueEntry,
  Recipe,
  RecipeSubmission,
} from '@/types/domain';

import type { SubmissionDraft, SubmissionsRepository } from './repository';

/**
 * Submissions and moderation, against the database.
 *
 * THE SHAPE THAT MATTERS: a submission is a row ABOUT an ordinary private
 * recipe. Creating one writes a normal `recipes` row with the normal children
 * — same validation, same constraints — and then a `recipe_submissions` row
 * pointing at it. There is no second recipe schema, and therefore no
 * copy-back on approval for a field to get lost in.
 *
 * EVERY STATE CHANGE IS AN RPC. `submit_recipe`, `withdraw_submission` and
 * `moderate_submission` are the only ways the status moves, because a status
 * a client can write is a status a client can set to 'approved'. The same goes
 * for publication: `is_public` is unwritable by every client, and
 * `moderate_submission` is the only route to it.
 *
 * `canModerate` asks the SERVER. A client-side role check is a suggestion; the
 * screens use it to decide what to render, and the database decides what
 * actually happens.
 */

type SubmissionRow = Database['public']['Tables']['recipe_submissions']['Row'];

function toSubmission(row: SubmissionRow, title: string): RecipeSubmission {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    authorId: row.author_id,
    title,
    status: row.status,
    revision: row.revision,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    authorNote: row.author_note,
    createdAt: row.created_at,
  };
}

export class SupabaseSubmissionsRepository implements SubmissionsRepository {
  readonly isLive = true;

  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async mine(): Promise<RecipeSubmission[]> {
    try {
      const { data, error } = await this.client
        .from('recipe_submissions')
        .select('*')
        .eq('author_id', this.userId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = data ?? [];
      if (rows.length === 0) return [];

      // A second query rather than a nested select. PostgREST can join these,
      // but the generated types carry no relationship metadata, and casting
      // past that is how a rename becomes a runtime error instead of a
      // compile one.
      const { data: titles, error: titleError } = await this.client
        .from('recipes')
        .select('id, title')
        .in('id', rows.map((row) => row.recipe_id));
      if (titleError) throw titleError;

      const titleById = new Map((titles ?? []).map((row) => [row.id, row.title]));
      return rows.map((row) => toSubmission(row, titleById.get(row.recipe_id) ?? ''));
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  async createDraft(draft: SubmissionDraft): Promise<string> {
    try {
      const recipeId = await this.writeRecipe(draft, null);

      const { data, error } = await this.client
        .from('recipe_submissions')
        .insert({ recipe_id: recipeId, author_id: this.userId, status: 'draft' })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  async updateDraft(submissionId: string, draft: SubmissionDraft): Promise<void> {
    try {
      const { data, error } = await this.client
        .from('recipe_submissions')
        .select('recipe_id')
        .eq('id', submissionId)
        .single();
      if (error) throw error;
      await this.writeRecipe(draft, data.recipe_id);
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  async submit(submissionId: string): Promise<void> {
    try {
      const { error } = await this.client.rpc('submit_recipe', { submission: submissionId });
      if (error) throw error;
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  async withdraw(submissionId: string): Promise<void> {
    try {
      const { error } = await this.client.rpc('withdraw_submission', {
        submission: submissionId,
      });
      if (error) throw error;
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  async canModerate(): Promise<boolean> {
    try {
      const { data, error } = await this.client.rpc('is_moderator');
      if (error) throw error;
      return data === true;
    } catch {
      // A failure here means "do not show the moderator screens", which is the
      // safe answer and not worth an error state of its own.
      return false;
    }
  }

  async queue(): Promise<ModerationQueueEntry[]> {
    try {
      const { data, error } = await this.client.rpc('moderation_queue');
      if (error) throw error;
      return (data ?? []).map((row) => ({
        submissionId: row.submission_id,
        recipeId: row.recipe_id,
        title: row.title,
        authorId: row.author_id,
        authorName: row.author_name,
        authorHandle: row.author_handle,
        status: row.status,
        revision: row.revision,
        submittedAt: row.submitted_at,
      }));
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  async submittedRecipe(recipeId: string): Promise<Recipe | null> {
    try {
      const { data, error } = await this.client
        .from('recipes')
        .select(RECIPE_SELECT)
        .eq('id', recipeId)
        .maybeSingle();
      if (error) throw error;
      return data ? rowsToRecipe(data as unknown as RecipeQueryRow) : null;
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  async history(submissionId: string): Promise<ModerationEvent[]> {
    try {
      const { data, error } = await this.client
        .from('moderation_events')
        .select('*')
        .eq('submission_id', submissionId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        submissionId: row.submission_id,
        actorId: row.actor_id,
        action: row.action,
        note: row.note,
        revision: row.revision,
        createdAt: row.created_at,
      }));
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  async decide(
    submissionId: string,
    decision: ModerationDecision,
    feedback: string | null,
  ): Promise<void> {
    try {
      const { error } = await this.client.rpc('moderate_submission', {
        submission: submissionId,
        decision,
        feedback,
      });
      if (error) throw error;
    } catch (error) {
      throw toAppError(error, 'database');
    }
  }

  /**
   * Writes the recipe behind a submission.
   *
   * `is_public` is never set — the policy would refuse it, and that refusal is
   * the whole safety property. Children are deleted and rewritten rather than
   * diffed: a submission draft is small, and a diff is how a removed
   * ingredient survives a revision.
   */
  private async writeRecipe(draft: SubmissionDraft, existing: string | null): Promise<string> {
    const fields = {
      title: draft.title,
      description: draft.description,
      source: 'user' as const,
      created_by: this.userId,
      is_public: false,
      cuisine: draft.cuisine,
      difficulty: draft.difficulty,
      prep_minutes: draft.prepMinutes,
      cook_minutes: draft.cookMinutes,
      base_servings: draft.baseServings,
      image_url: draft.imageUrl,
    };

    let recipeId = existing;
    if (recipeId) {
      const { error } = await this.client.from('recipes').update(fields).eq('id', recipeId);
      if (error) throw error;
      await this.client.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
      await this.client.from('recipe_steps').delete().eq('recipe_id', recipeId);
    } else {
      const { data, error } = await this.client
        .from('recipes')
        .insert(fields)
        .select('id')
        .single();
      if (error) throw error;
      recipeId = data.id;
    }

    if (draft.ingredients.length > 0) {
      const { error } = await this.client.from('recipe_ingredients').insert(
        draft.ingredients.map((line, index) => ({
          recipe_id: recipeId,
          ingredient_id: null,
          name: line.name,
          slug: line.slug,
          quantity: line.quantity,
          unit: line.unit,
          is_optional: line.isOptional,
          sort_order: index + 1,
        })) as never,
      );
      if (error) throw error;
    }

    if (draft.steps.length > 0) {
      const { error } = await this.client.from('recipe_steps').insert(
        draft.steps.map((step, index) => ({
          recipe_id: recipeId,
          step_number: index + 1,
          instruction: step.instruction,
          duration_minutes: step.durationMinutes,
        })) as never,
      );
      if (error) throw error;
    }

    return recipeId;
  }
}
