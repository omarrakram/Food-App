import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { DemoBanner } from '@/components/messages/demo-banner';
import { RecipeImage } from '@/components/recipe/recipe-image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import {
  useCanModerate,
  useModerationHistory,
  useModerationQueue,
  useSubmissionActions,
  useSubmittedRecipe,
  useSubmissionsAreLive,
} from '@/features/submissions/hooks';
import { useI18n } from '@/i18n';
import { presentError } from '@/lib/errors';
import { useTheme } from '@/theme';
import type { ModerationDecision } from '@/types/domain';

/**
 * Reviewing one submission.
 *
 * Everything a decision needs is on this screen: the author, the photo, every
 * ingredient, every step, and the history of what was asked for last time.
 * A moderator who has to open three screens to decide will decide from one of
 * them.
 *
 * The feedback field is required for a refusal and the buttons enforce it
 * before the call is made — but the database enforces it too, which is what
 * makes it true. `moderate_submission` refuses a reject with an empty note
 * regardless of what any client sends.
 */
export default function ModerateSubmissionScreen() {
  const theme = useTheme();
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const { id } = useLocalSearchParams<{ id: string }>();
  const isLive = useSubmissionsAreLive();
  const canModerate = useCanModerate();
  const queue = useModerationQueue(canModerate.data === true);
  const actions = useSubmissionActions();

  const entry = useMemo(
    () => (queue.data ?? []).find((row) => row.submissionId === id),
    [queue.data, id],
  );
  const recipe = useSubmittedRecipe(entry?.recipeId);
  const history = useModerationHistory(id);

  const [feedback, setFeedback] = useState('');
  const [needsFeedback, setNeedsFeedback] = useState(false);

  if (canModerate.data !== true) {
    return (
      <ScreenScroll contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('moderate.title')} />
        <EmptyState
          icon="lock-closed-outline"
          title={t('moderate.notAllowed')}
          body={t('moderate.notAllowedBody')}
          testID="moderate-detail-not-allowed"
        />
      </ScreenScroll>
    );
  }

  const decide = (decision: ModerationDecision) => {
    const note = feedback.trim();
    if (decision !== 'approve' && !note) {
      setNeedsFeedback(true);
      return;
    }
    setNeedsFeedback(false);

    void actions.decide
      .mutateAsync({ id: id!, decision, feedback: note || null })
      .then(() => {
        toast.show({ message: t(`moderate.done_${decision}`), tone: 'success' });
        router.replace('/moderate');
      })
      .catch((error: unknown) => {
        const presented = presentError(error);
        toast.show({ message: t(presented.bodyKey, presented.values), tone: 'danger' });
      });
  };

  if (queue.isLoading || recipe.isLoading) {
    return (
      <ScreenScroll contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('moderate.reviewTitle')} />
        <SkeletonList count={4} />
      </ScreenScroll>
    );
  }

  if (!entry || !recipe.data) {
    return (
      <ScreenScroll contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('moderate.reviewTitle')} />
        <EmptyState
          icon="document-outline"
          title={t('moderate.gone')}
          body={t('moderate.goneBody')}
          testID="moderate-gone"
        />
      </ScreenScroll>
    );
  }

  const dish = recipe.data;

  return (
    <ScreenScroll
      bottomInset={theme.spacing.xxl}
      contentGap={theme.spacing.xl}
      testID="moderate-review"
    >
      <ScreenHeader title={t('moderate.reviewTitle')} subtitle={entry.title} />

      {isLive ? null : <DemoBanner testID="moderate-review-demo-banner" />}

      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title2">{dish.title}</Text>
        <Text variant="footnote" color="textSecondary">
          {entry.authorHandle ? `@${entry.authorHandle}` : (entry.authorName ?? '')}
          {entry.revision > 1 ? ` · ${t('moderate.revised', { count: entry.revision })}` : ''}
        </Text>
      </View>

      <RecipeImage
        recipe={dish}
        aspectRatio={theme.layout.cardImageAspect}
        style={{ borderRadius: theme.radius.md }}
        testID="moderate-photo"
      />

      {dish.description ? <Text variant="body">{dish.description}</Text> : null}

      <Section title={t('submit.timeAndServings')}>
        <Text variant="callout" color="textSecondary">
          {t('moderate.timeLine', {
            prep: dish.prepMinutes,
            cook: dish.cookMinutes,
            servings: dish.baseServings,
          })}
        </Text>
      </Section>

      <Section title={t('submit.ingredients')}>
        <View style={{ gap: theme.spacing.xs }} testID="moderate-ingredients">
          {dish.ingredients.map((line) => (
            <View
              key={line.id}
              style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}
            >
              <Text variant="callout" style={{ flex: 1 }}>
                {line.name}
              </Text>
              <Text variant="footnote" color="textSecondary">
                {line.quantity === null ? t('moderate.noQuantity') : line.quantity}
                {line.unit ? ` ${line.unit}` : ''}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title={t('submit.steps')}>
        <View style={{ gap: theme.spacing.sm }} testID="moderate-steps">
          {dish.steps.map((step) => (
            <View key={step.id} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Text variant="micro" color="textTertiary">
                {step.stepNumber}
              </Text>
              <Text variant="callout" style={{ flex: 1 }}>
                {step.instruction}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      {(history.data ?? []).length > 0 ? (
        <Section title={t('moderate.history')} subtitle={t('moderate.historyNote')}>
          <View style={{ gap: theme.spacing.sm }} testID="moderate-history">
            {(history.data ?? []).map((event) => (
              <View key={event.id} style={{ gap: 2 }}>
                <Text variant="micro" color="textTertiary">
                  {t(`moderate.action_${event.action}`)} ·{' '}
                  {formatDate(event.createdAt, {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
                {event.note ? <Text variant="footnote">{event.note}</Text> : null}
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      <Section title={t('moderate.feedback')} subtitle={t('moderate.feedbackHint')}>
        <View style={{ gap: theme.spacing.sm }}>
          <Input
            value={feedback}
            onChangeText={(next) => {
              setFeedback(next);
              if (next.trim()) setNeedsFeedback(false);
            }}
            placeholder={t('moderate.feedbackPlaceholder')}
            multiline
            testID="moderate-feedback"
          />
          {needsFeedback ? (
            <Text variant="footnote" color="danger" testID="moderate-feedback-required">
              {t('moderate.feedbackRequired')}
            </Text>
          ) : null}
        </View>
      </Section>

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          label={t('moderate.approve')}
          size="lg"
          onPress={() => decide('approve')}
          loading={actions.decide.isPending}
          testID="moderate-approve"
        />
        <Button
          label={t('moderate.requestChanges')}
          variant="secondary"
          onPress={() => decide('request_changes')}
          testID="moderate-request-changes"
        />
        <Button
          label={t('moderate.reject')}
          variant="ghost"
          onPress={() => decide('reject')}
          testID="moderate-reject"
        />
        <Text variant="micro" color="textTertiary" align="center">
          {t('moderate.approveNote')}
        </Text>
      </View>
    </ScreenScroll>
  );
}
