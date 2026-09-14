import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { DemoBanner } from '@/components/messages/demo-banner';
import { Badge } from '@/components/ui/badge';
import { PressScale } from '@/components/ui/press-scale';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import {
  useCanModerate,
  useModerationQueue,
  useSubmissionsAreLive,
} from '@/features/submissions/hooks';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * The review queue.
 *
 * THE ROLE CHECK HERE IS NOT THE SECURITY BOUNDARY, and saying so out loud
 * matters because it looks like one. `useCanModerate` asks the server, and the
 * screen uses the answer to decide what to RENDER. Someone who skips the
 * screen entirely and calls `moderate_submission` directly is refused by the
 * database, which checks the role again with the caller's own credentials. A
 * hidden button has never stopped anybody; the policy has.
 *
 * Oldest first, deliberately. A newest-first queue is how a submission waits
 * forever, and the person who waited longest is the one most likely to give up
 * on the product.
 */
export default function ModerationQueueScreen() {
  const theme = useTheme();
  const { t, formatDate } = useI18n();
  const router = useRouter();

  const isLive = useSubmissionsAreLive();
  const canModerate = useCanModerate();
  const queue = useModerationQueue(canModerate.data === true);

  if (canModerate.isLoading) {
    return (
      <ScreenScroll contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('moderate.title')} />
        <SkeletonList count={3} />
      </ScreenScroll>
    );
  }

  // Same screen for "not a moderator" and "no such thing here": telling a
  // stranger that a moderation queue exists and they are not in it is a
  // detail about the product's staffing they have no business learning.
  if (canModerate.data !== true) {
    return (
      <ScreenScroll contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('moderate.title')} />
        <EmptyState
          icon="lock-closed-outline"
          title={t('moderate.notAllowed')}
          body={t('moderate.notAllowedBody')}
          testID="moderate-not-allowed"
        />
      </ScreenScroll>
    );
  }

  const entries = queue.data ?? [];

  return (
    <ScreenScroll bottomInset={theme.spacing.xxl} contentGap={theme.spacing.lg}>
      <ScreenHeader title={t('moderate.title')} subtitle={t('moderate.subtitle')} />

      {isLive ? null : <DemoBanner testID="moderate-demo-banner" />}

      {isLive ? null : (
        <View
          testID="moderate-preview-note"
          style={{
            borderWidth: 1,
            borderColor: theme.colors.warning,
            backgroundColor: theme.colors.warningSoft,
            borderRadius: theme.radius.md,
            padding: theme.spacing.md,
          }}
        >
          <Text variant="footnote" color="warningSoftText">
            {t('moderate.previewRole')}
          </Text>
        </View>
      )}

      {queue.isLoading ? (
        <SkeletonList count={3} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title={t('moderate.empty')}
          body={t('moderate.emptyBody')}
          testID="moderate-empty"
        />
      ) : (
        <View style={{ gap: theme.spacing.md }} testID="moderate-queue">
          {entries.map((entry) => (
            <PressScale
              key={entry.submissionId}
              accessibilityRole="button"
              accessibilityLabel={entry.title}
              onPress={() => router.push(`/moderate/${entry.submissionId}`)}
              haptic="selection"
              scaleTo={0.98}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                padding: theme.spacing.md,
                gap: theme.spacing.xs,
                backgroundColor: theme.colors.surface,
              }}
              testID={`moderate-entry-${entry.submissionId}`}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
              >
                <Text variant="headline" style={{ flex: 1 }} lines={2}>
                  {entry.title}
                </Text>
                {entry.revision > 1 ? (
                  <Badge
                    label={t('moderate.revised', { count: entry.revision })}
                    tone="warning"
                    size="sm"
                  />
                ) : null}
              </View>
              <Text variant="footnote" color="textSecondary">
                {entry.authorHandle ? `@${entry.authorHandle}` : (entry.authorName ?? '')}
              </Text>
              <Text variant="micro" color="textTertiary">
                {entry.submittedAt
                  ? t('moderate.waitingSince', {
                      date: formatDate(entry.submittedAt, {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      }),
                    })
                  : ''}
              </Text>
            </PressScale>
          ))}
        </View>
      )}
    </ScreenScroll>
  );
}
