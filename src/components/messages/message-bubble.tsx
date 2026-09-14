import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import type { Message } from '@/types/domain';

import { SharedRecipeCard } from './shared-recipe-card';

/**
 * One message.
 *
 * THE FAILURE STATE IS THE INTERESTING PART. A message that vanishes when the
 * send fails is the worst possible outcome: the user watched their words
 * appear, looked away, and now believes they were delivered. So a failed send
 * STAYS in the thread, in the danger colour, with the word "Not sent" under it
 * and a Retry the user can press. Nothing about it resembles a delivered
 * message.
 *
 * `sending` is the other half of the same idea — the bubble is dimmed until
 * the server has it, so "appeared on screen" never means "arrived" until it
 * actually does.
 */
export function MessageBubble({
  message,
  isMine,
  showTime,
  onRetry,
  testID,
}: {
  message: Message;
  isMine: boolean;
  showTime: boolean;
  onRetry?: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const { t, formatDate } = useI18n();

  const failed = message.delivery === 'failed';
  const sending = message.delivery === 'sending';

  const bubble = isMine
    ? {
        backgroundColor: failed ? theme.colors.dangerSoft : theme.colors.primarySoft,
        color: failed ? theme.colors.dangerSoftText : theme.colors.primarySoftText,
      }
    : { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text };

  return (
    <View
      testID={testID}
      style={{
        // Deliberately `alignSelf` rather than a row direction: a chat bubble's
        // side means "mine" or "theirs", and RTL must not swap that — in an
        // RTL layout the whole thread mirrors, and mine stays on my side.
        alignSelf: isMine ? 'flex-end' : 'flex-start',
        maxWidth: '82%',
        gap: 2,
        opacity: sending ? 0.6 : 1,
      }}
    >
      {message.sharedRecipeId ? (
        <View style={{ alignSelf: isMine ? 'flex-end' : 'flex-start' }}>
          <SharedRecipeCard
            recipeId={message.sharedRecipeId}
            testID={`${testID ?? 'message'}-recipe`}
          />
        </View>
      ) : null}

      {message.body ? (
        <View
          style={{
            backgroundColor: bubble.backgroundColor,
            borderRadius: theme.radius.lg,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            borderWidth: failed ? 1 : 0,
            borderColor: theme.colors.danger,
          }}
        >
          <Text variant="body" style={{ color: bubble.color }}>
            {message.body}
          </Text>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
          alignSelf: isMine ? 'flex-end' : 'flex-start',
        }}
      >
        {failed ? (
          <>
            <Ionicons name="alert-circle" size={12} color={theme.colors.danger} />
            <Text variant="micro" color="danger">
              {t('messages.failed')}
            </Text>
            {onRetry ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('messages.retry')}
                onPress={onRetry}
                hitSlop={8}
                testID={`${testID ?? 'message'}-retry`}
              >
                <Text variant="micro" color="primary">
                  {t('messages.retry')}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : sending ? (
          <Text variant="micro" color="textTertiary">
            {t('messages.sending')}
          </Text>
        ) : showTime ? (
          <Text variant="micro" color="textTertiary">
            {formatDate(message.createdAt, { hour: 'numeric', minute: '2-digit' })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
