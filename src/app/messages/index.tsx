import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { DemoBanner } from '@/components/messages/demo-banner';
import { ConversationRow } from '@/components/messages/conversation-row';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import {
  useConversations,
  useMessagingIsLive,
  useMessagingViewerId,
} from '@/features/messages/hooks';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * Conversations.
 *
 * Signed out, this is a sign-in prompt rather than an empty list: an empty
 * list says "you have no conversations", which is not the reason, and a user
 * who believes that will not go looking for the account they need.
 *
 * The exception is demo mode, which HAS a viewer and seeded threads — and
 * carries the banner saying none of it leaves the device.
 */
export default function MessagesScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const isLive = useMessagingIsLive();
  // No viewer means no account — and in demo mode there IS a viewer, so the
  // preview shows the real screen rather than a sign-in wall.
  const viewerId = useMessagingViewerId();
  const conversations = useConversations();

  return (
    <ScreenScroll bottomInset={theme.spacing.xxl} contentGap={theme.spacing.md}>
      <ScreenHeader title={t('messages.title')} subtitle={t('messages.subtitle')} />

      {isLive ? null : <DemoBanner testID="messages-demo-banner" />}

      {viewerId === null ? (
        <EmptyState
          icon="chatbubbles-outline"
          title={t('messages.needsAccount')}
          body={t('messages.needsAccountBody')}
          testID="messages-needs-account"
        />
      ) : conversations.isLoading ? (
        <SkeletonList count={3} />
      ) : conversations.isError ? (
        <ErrorState
          title={t('error.genericTitle')}
          body={t('error.genericBody')}
          action={{ label: t('common.retry'), onPress: () => void conversations.refetch() }}
          testID="messages-error"
        />
      ) : (conversations.data ?? []).length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title={t('messages.empty')}
          body={t('messages.emptyBody')}
          testID="messages-empty"
        />
      ) : (
        <View testID="messages-list">
          {(conversations.data ?? []).map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              onPress={() => router.push(`/messages/${conversation.id}`)}
              testID={`conversation-${conversation.id}`}
            />
          ))}
        </View>
      )}
    </ScreenScroll>
  );
}
