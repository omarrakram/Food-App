import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { DemoBanner } from '@/components/messages/demo-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import {
  useMySubmissions,
  useSubmissionActions,
  useSubmissionsAreLive,
} from '@/features/submissions/hooks';
import { useI18n, type TranslationKey } from '@/i18n';
import { presentError } from '@/lib/errors';
import { useTheme } from '@/theme';
import type { SubmissionStatus } from '@/types/domain';

/**
 * What happened to the recipes I sent in.
 *
 * The status is stated plainly and so is what to do about it. "Pending" with
 * no further information is what makes a submission feel lost; a person who
 * can see that theirs is third in a queue, or that a moderator asked for
 * quantities, does not need to ask anybody.
 *
 * `authorNote` is the feedback a moderator wrote FOR the author. The internal
 * moderation history is a different thing, lives in a table authors cannot
 * read, and never appears here.
 */

const STATUS_LABEL: Record<SubmissionStatus, TranslationKey> = {
  draft: 'submissions.statusDraft',
  pending: 'submissions.statusPending',
  changes_requested: 'submissions.statusChanges',
  approved: 'submissions.statusApproved',
  rejected: 'submissions.statusRejected',
};

const STATUS_TONE: Record<SubmissionStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  pending: 'info',
  changes_requested: 'warning',
  approved: 'success',
  rejected: 'danger',
};

export default function SubmissionStatusScreen() {
  const theme = useTheme();
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const isLive = useSubmissionsAreLive();
  const mine = useMySubmissions();
  const actions = useSubmissionActions();

  const fail = (error: unknown) => {
    const presented = presentError(error);
    toast.show({ message: t(presented.bodyKey, presented.values), tone: 'danger' });
  };

  return (
    <ScreenScroll bottomInset={theme.spacing.xxl} contentGap={theme.spacing.lg}>
      <ScreenHeader title={t('submissions.title')} subtitle={t('submissions.subtitle')} />

      {isLive ? null : <DemoBanner testID="submissions-demo-banner" />}

      {mine.isLoading ? (
        <SkeletonList count={2} />
      ) : (mine.data ?? []).length === 0 ? (
        <EmptyState
          icon="restaurant-outline"
          title={t('submissions.empty')}
          body={t('submissions.emptyBody')}
          action={{ label: t('submit.title'), onPress: () => router.push('/submit') }}
          testID="submissions-empty"
        />
      ) : (
        <View style={{ gap: theme.spacing.md }} testID="submissions-list">
          {(mine.data ?? []).map((entry) => (
            <View
              key={entry.id}
              testID={`submission-${entry.id}`}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                padding: theme.spacing.md,
                gap: theme.spacing.sm,
                backgroundColor: theme.colors.surface,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                }}
              >
                <Text variant="headline" style={{ flex: 1 }} lines={2}>
                  {entry.title}
                </Text>
                <Badge
                  label={t(STATUS_LABEL[entry.status])}
                  tone={STATUS_TONE[entry.status]}
                  testID={`submission-status-${entry.id}`}
                />
              </View>

              <Text variant="micro" color="textTertiary">
                {entry.submittedAt
                  ? t('submissions.sentOn', {
                      date: formatDate(entry.submittedAt, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }),
                    })
                  : t('submissions.notSentYet')}
                {entry.revision > 1 ? ` · ${t('submissions.revision', { count: entry.revision })}` : ''}
              </Text>

              {entry.authorNote ? (
                <View
                  style={{
                    backgroundColor: theme.colors.surfaceAlt,
                    borderRadius: theme.radius.sm,
                    padding: theme.spacing.sm,
                    gap: 2,
                  }}
                  testID={`submission-note-${entry.id}`}
                >
                  <Text variant="micro" color="textTertiary">
                    {t('submissions.moderatorSaid')}
                  </Text>
                  <Text variant="footnote">{entry.authorNote}</Text>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                {entry.status === 'draft' || entry.status === 'changes_requested' ? (
                  <Button
                    label={t('submissions.edit')}
                    size="sm"
                    onPress={() => router.push(`/submit?id=${entry.id}`)}
                    testID={`submission-edit-${entry.id}`}
                  />
                ) : null}
                {entry.status === 'pending' ? (
                  <Button
                    label={t('submissions.withdraw')}
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      void actions.withdraw.mutateAsync(entry.id).catch(fail)
                    }
                    testID={`submission-withdraw-${entry.id}`}
                  />
                ) : null}
                {entry.status === 'approved' ? (
                  <Button
                    label={t('submissions.view')}
                    size="sm"
                    variant="secondary"
                    onPress={() => router.push(`/recipe/${entry.recipeId}`)}
                    testID={`submission-view-${entry.id}`}
                  />
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}

      <Button
        label={t('submit.title')}
        icon="add"
        onPress={() => router.push('/submit')}
        testID="submissions-new"
      />
    </ScreenScroll>
  );
}
