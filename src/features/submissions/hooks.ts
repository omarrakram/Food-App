import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRepositories } from '@/features/data/repositories';
import { toAppError } from '@/lib/errors';
import type { ModerationDecision } from '@/types/domain';

import type { SubmissionDraft } from './repository';

/**
 * Submissions and moderation, as React Query.
 *
 * `useCanModerate` is the one worth reading twice. It asks the SERVER whether
 * the viewer holds a role, and every moderator screen gates on it — but it is
 * only deciding what to RENDER. The database decides what happens: a crafted
 * client that skips this check reaches `moderate_submission`, which checks the
 * role again and refuses. A UI flag is never an authorization boundary, and
 * this one is not pretending to be.
 */

const key = {
  mine: (scope: string) => ['akla', 'submissions', scope, 'mine'] as const,
  canModerate: (scope: string) => ['akla', 'submissions', scope, 'can-moderate'] as const,
  queue: (scope: string) => ['akla', 'submissions', scope, 'queue'] as const,
  recipe: (scope: string, recipeId: string) =>
    ['akla', 'submissions', scope, 'recipe', recipeId] as const,
  history: (scope: string, submissionId: string) =>
    ['akla', 'submissions', scope, 'history', submissionId] as const,
};

export function useMySubmissions() {
  const { submissions, scopeKey } = useRepositories();

  return useQuery({
    queryKey: key.mine(scopeKey),
    queryFn: async () => {
      try {
        return await submissions.mine();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

/** Whether to SHOW the moderator screens. Not an authorization boundary. */
export function useCanModerate() {
  const { submissions, scopeKey } = useRepositories();

  return useQuery({
    queryKey: key.canModerate(scopeKey),
    queryFn: () => submissions.canModerate(),
    // A role does not change mid-session in any flow the app has.
    staleTime: 5 * 60_000,
  });
}

export function useModerationQueue(enabled = true) {
  const { submissions, scopeKey } = useRepositories();

  return useQuery({
    queryKey: key.queue(scopeKey),
    enabled,
    queryFn: async () => {
      try {
        return await submissions.queue();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    staleTime: 15_000,
  });
}

export function useSubmittedRecipe(recipeId: string | undefined) {
  const { submissions, scopeKey } = useRepositories();

  return useQuery({
    queryKey: key.recipe(scopeKey, recipeId ?? 'none'),
    enabled: Boolean(recipeId),
    queryFn: async () => {
      if (!recipeId) return null;
      try {
        return await submissions.submittedRecipe(recipeId);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

export function useModerationHistory(submissionId: string | undefined) {
  const { submissions, scopeKey } = useRepositories();

  return useQuery({
    queryKey: key.history(scopeKey, submissionId ?? 'none'),
    enabled: Boolean(submissionId),
    queryFn: async () => {
      if (!submissionId) return [];
      try {
        return await submissions.history(submissionId);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

export function useSubmissionActions() {
  const { submissions, scopeKey } = useRepositories();
  const client = useQueryClient();

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: key.mine(scopeKey) });
    await client.invalidateQueries({ queryKey: key.queue(scopeKey) });
  };

  return {
    createDraft: useMutation({
      mutationFn: (draft: SubmissionDraft) => submissions.createDraft(draft),
      onSuccess: refresh,
    }),
    updateDraft: useMutation({
      mutationFn: ({ id, draft }: { id: string; draft: SubmissionDraft }) =>
        submissions.updateDraft(id, draft),
      onSuccess: refresh,
    }),
    submit: useMutation({
      mutationFn: (id: string) => submissions.submit(id),
      onSuccess: refresh,
    }),
    withdraw: useMutation({
      mutationFn: (id: string) => submissions.withdraw(id),
      onSuccess: refresh,
    }),
    decide: useMutation({
      mutationFn: ({
        id,
        decision,
        feedback,
      }: {
        id: string;
        decision: ModerationDecision;
        feedback: string | null;
      }) => submissions.decide(id, decision, feedback),
      onSuccess: refresh,
    }),
  };
}

/** True when a submission actually reaches a review queue somebody reads. */
export function useSubmissionsAreLive(): boolean {
  const { submissions } = useRepositories();
  return submissions.isLive;
}
