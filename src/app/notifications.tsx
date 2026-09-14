import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { DemoBanner } from '@/components/messages/demo-banner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PressScale } from '@/components/ui/press-scale';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useRepositories } from '@/features/data/repositories';
import {
  useNotificationActions,
  useNotifications,
  useNotificationsAreLive,
  useUnreadNotifications,
} from '@/features/notifications/hooks';
import { useI18n, type TranslationKey } from '@/i18n';
import { useTheme } from '@/theme';
import type { AppNotification, NotificationKind } from '@/types/domain';

/**
 * What happened while you were away.
 *
 * Every row is a POINTER — a kind and the id of the thing it is about — and
 * tapping one goes to that thing. Nothing here carries a copy of a message
 * body or a recipe title, which is what lets a deleted message or an
 * unpublished recipe stop being advertised by a notification about it.
 *
 * Unread is a background wash rather than a dot, because the useful question
 * looking at a feed is "where did I get to", and a column of dots answers it
 * worse than a block of tinted rows.
 */

const ICON: Record<NotificationKind, keyof typeof Ionicons.glyphMap> = {
  friend_request: 'person-add-outline',
  friend_accepted: 'people-outline',
  message: 'chatbubble-outline',
  recipe_shared: 'restaurant-outline',
  submission_approved: 'checkmark-circle-outline',
  submission_rejected: 'close-circle-outline',
  submission_changes_requested: 'create-outline',
};

const TEXT: Record<NotificationKind, TranslationKey> = {
  friend_request: 'notifications.friendRequest',
  friend_accepted: 'notifications.friendAccepted',
  message: 'notifications.message',
  recipe_shared: 'notifications.recipeShared',
  submission_approved: 'notifications.submissionApproved',
  submission_rejected: 'notifications.submissionRejected',
  submission_changes_requested: 'notifications.submissionChanges',
};

/** Where a row goes when it is tapped. The subject decides. */
function destinationFor(entry: AppNotification): string {
  switch (entry.kind) {
    case 'friend_request':
    case 'friend_accepted':
      return '/friends';
    case 'message':
    case 'recipe_shared':
      return entry.subjectId ? `/messages/${entry.subjectId}` : '/messages';
    case 'submission_approved':
    case 'submission_rejected':
    case 'submission_changes_requested':
      return '/submit/status';
  }
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const { demoMode } = useRepositories();

  const isLive = useNotificationsAreLive();
  const feed = useNotifications();
  const unread = useUnreadNotifications();
  const actions = useNotificationActions();

  const entries = feed.data ?? [];

  if (!isLive && !demoMode) {
    return (
      <ScreenScroll contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('notifications.title')} />
        <EmptyState
          icon="notifications-outline"
          title={t('notifications.needsAccount')}
          body={t('notifications.needsAccountBody')}
          testID="notifications-needs-account"
        />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll bottomInset={theme.spacing.xxl} contentGap={theme.spacing.md}>
      <ScreenHeader
        title={t('notifications.title')}
        right={
          unread > 0 ? (
            <Button
              label={t('notifications.markAllRead')}
              variant="ghost"
              size="sm"
              onPress={() => actions.markAllRead.mutate()}
              testID="notifications-mark-all"
            />
          ) : undefined
        }
      />

      {isLive ? null : <DemoBanner testID="notifications-demo-banner" />}

      {feed.isLoading ? (
        <SkeletonList count={4} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title={t('notifications.empty')}
          body={t('notifications.emptyBody')}
          testID="notifications-empty"
        />
      ) : (
        <View testID="notifications-list">
          {entries.map((entry) => {
            const name = entry.actor?.displayName ?? entry.actor?.username ?? '';
            return (
              <PressScale
                key={entry.id}
                accessibilityRole="button"
                accessibilityLabel={t(TEXT[entry.kind], { name })}
                onPress={() => {
                  actions.markRead.mutate(entry.id);
                  router.push(destinationFor(entry) as never);
                }}
                haptic="selection"
                scaleTo={0.98}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  paddingHorizontal: theme.spacing.sm,
                  borderRadius: theme.radius.sm,
                  minHeight: 56,
                  backgroundColor:
                    entry.readAt === null ? theme.colors.primarySoft : 'transparent',
                }}
                testID={`notification-${entry.id}`}
              >
                {entry.actor ? (
                  <Avatar url={entry.actor.avatarUrl} fallback={name} size={40} />
                ) : (
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: theme.radius.pill,
                      backgroundColor: theme.colors.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons
                      name={ICON[entry.kind]}
                      size={18}
                      color={theme.colors.textSecondary}
                    />
                  </View>
                )}

                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="callout" lines={2}>
                    {t(TEXT[entry.kind], { name })}
                  </Text>
                  <Text variant="micro" color="textTertiary">
                    {formatDate(entry.createdAt, {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>

                <Ionicons
                  name={ICON[entry.kind]}
                  size={16}
                  color={theme.colors.textTertiary}
                />
              </PressScale>
            );
          })}
        </View>
      )}
    </ScreenScroll>
  );
}
