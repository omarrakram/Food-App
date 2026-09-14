import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { PressScale } from '@/components/ui/press-scale';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import type { Conversation } from '@/types/domain';

/**
 * One thread in the list.
 *
 * The preview line is the LAST MESSAGE, whoever sent it, because that is what
 * makes a list scannable — "did they reply?" is answered without opening
 * anything. A shared recipe has no body text, so it renders as its own line
 * rather than as an empty one.
 *
 * The unread count is a number, not a dot. A dot says "something happened";
 * a number says how much, and that is the difference between glancing and
 * opening.
 */
export function ConversationRow({
  conversation,
  onPress,
  testID,
}: {
  conversation: Conversation;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const { t, formatDate, formatNumber, isRTL } = useI18n();

  const name = conversation.partner.displayName ?? conversation.partner.username ?? '';
  const unread = conversation.unread > 0;

  // Today shows a clock; anything older shows a date. A thread from last month
  // reading "14:32" is a lie by omission.
  const stamp = conversation.lastMessageAt
    ? isToday(conversation.lastMessageAt)
      ? formatDate(conversation.lastMessageAt, { hour: 'numeric', minute: '2-digit' })
      : formatDate(conversation.lastMessageAt, { day: 'numeric', month: 'short' })
    : '';

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={
        unread ? `${name}. ${t('messages.unread', { count: conversation.unread })}` : name
      }
      onPress={onPress}
      haptic="selection"
      scaleTo={0.98}
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        minHeight: 64,
      }}
      testID={testID}
    >
      <Avatar url={conversation.partner.avatarUrl} fallback={name} size={48} />

      <View style={{ flex: 1, gap: 2 }}>
        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <Text variant={unread ? 'bodyMedium' : 'body'} lines={1} style={{ flex: 1 }}>
            {name}
          </Text>
          {stamp ? (
            <Text variant="micro" color={unread ? 'primary' : 'textTertiary'}>
              {stamp}
            </Text>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}
        >
          {conversation.lastMessagePreview ? (
            <Text
              variant="footnote"
              color={unread ? 'text' : 'textSecondary'}
              lines={1}
              style={{ flex: 1 }}
            >
              {conversation.lastMessagePreview}
            </Text>
          ) : conversation.lastMessageAt ? (
            <>
              <Ionicons
                name="restaurant-outline"
                size={13}
                color={theme.colors.textTertiary}
              />
              <Text variant="footnote" color="textSecondary" lines={1} style={{ flex: 1 }}>
                {t('messages.sharedRecipe')}
              </Text>
            </>
          ) : (
            <Text variant="footnote" color="textTertiary" lines={1} style={{ flex: 1 }}>
              {t('messages.threadEmpty')}
            </Text>
          )}

          {unread ? (
            <View
              testID={`${testID ?? 'conversation'}-unread`}
              style={{
                minWidth: 20,
                paddingHorizontal: 6,
                height: 20,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.primaryStrong,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="micro" style={{ color: theme.colors.textOnPrimary }}>
                {formatNumber(conversation.unread)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </PressScale>
  );
}

function isToday(iso: string): boolean {
  const then = new Date(iso);
  const now = new Date();
  return (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  );
}
