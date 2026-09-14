import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DemoBanner } from '@/components/messages/demo-banner';
import { MessageBubble } from '@/components/messages/message-bubble';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import {
  useConversations,
  useMarkRead,
  useMessagingIsLive,
  useMessagingViewerId,
  useSendMessage,
  useThread,
} from '@/features/messages/hooks';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * One conversation.
 *
 * THE SCROLL IS THE HARD PART, and it is worth saying why it is built this
 * way. A thread reads oldest-at-the-top, newest-at-the-bottom, and opens at
 * the bottom. Older messages load when you reach the TOP, which is the
 * opposite of every other paginated screen in this app — so it is an explicit
 * button rather than an inverted list with a scroll-position heuristic. The
 * heuristic version is what makes a chat jump under your thumb while you are
 * reading, and a button cannot do that.
 *
 * The composer sits outside the scroller so it stays put, and
 * `KeyboardAvoidingView` lifts it rather than the whole screen.
 */
export default function ConversationScreen() {
  const theme = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { id, shareRecipeId } = useLocalSearchParams<{
    id: string;
    shareRecipeId?: string;
  }>();

  const isLive = useMessagingIsLive();
  const viewerId = useMessagingViewerId();
  const conversations = useConversations();
  const thread = useThread(id);
  const markRead = useMarkRead();
  const { send, retry, outbox, isSending } = useSendMessage(id);

  const [draft, setDraft] = useState('');
  const scroller = useRef<ScrollView>(null);
  const marked = useRef(false);

  const conversation = useMemo(
    () => (conversations.data ?? []).find((entry) => entry.id === id),
    [conversations.data, id],
  );
  const partnerName =
    conversation?.partner.displayName ?? conversation?.partner.username ?? '';

  // Opening the thread is what clears the badge — in demo mode too, where
  // there is no server to tell but the count should still go away.
  //
  // Once per mount. Re-firing it on every render would write a `last_read_at`
  // per keystroke, and the unread count is derived from that column.
  useEffect(() => {
    if (!id || marked.current) return;
    marked.current = true;
    markRead.mutate(id);
    // `markRead` is a stable mutation object from React Query; including it
    // would re-run this on every render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // A share handed in through the route: "Share → pick a friend" lands here
  // with the recipe already attached, so the user can add a note or just send.
  const [attached, setAttached] = useState<string | null>(shareRecipeId ?? null);

  const rows = useMemo(() => [...thread.messages, ...outbox], [thread.messages, outbox]);

  const submit = () => {
    const body = draft.trim();
    if (!body && !attached) return;
    send(body, attached, viewerId ?? 'me');
    setDraft('');
    setAttached(null);
    requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: theme.layout.contentMaxWidth,
          alignSelf: 'center',
        }}
      >
        {/* Header: who this is, and a way back. */}
        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            paddingTop: insets.top + theme.spacing.sm,
            paddingBottom: theme.spacing.sm,
            paddingHorizontal: theme.layout.screenPadding,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <IconButton
            icon={isRTL ? 'chevron-forward' : 'chevron-back'}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))}
            accessibilityLabel={t('common.back')}
            variant="secondary"
            testID="conversation-back"
          />
          {conversation ? (
            <>
              <Avatar
                url={conversation.partner.avatarUrl}
                fallback={partnerName}
                size={36}
              />
              <View style={{ flex: 1 }}>
                <Text variant="headline" lines={1} testID="conversation-title">
                  {partnerName}
                </Text>
                {conversation.partner.username ? (
                  <Text variant="micro" color="textSecondary" lines={1}>
                    @{conversation.partner.username}
                  </Text>
                ) : null}
              </View>
            </>
          ) : (
            <Text variant="headline" style={{ flex: 1 }}>
              {t('messages.title')}
            </Text>
          )}
        </View>

        <ScrollView
          ref={scroller}
          testID="conversation-thread"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: theme.layout.screenPadding,
            gap: theme.spacing.sm,
          }}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        >
          {isLive ? null : <DemoBanner testID="conversation-demo-banner" />}

          {thread.hasNextPage ? (
            <Button
              label={t('messages.loadOlder')}
              variant="ghost"
              size="sm"
              loading={thread.isFetchingNextPage}
              onPress={() => void thread.fetchNextPage()}
              testID="conversation-load-older"
            />
          ) : null}

          {thread.isLoading ? (
            <SkeletonList count={4} />
          ) : thread.isError ? (
            <ErrorState
              title={t('error.genericTitle')}
              body={t('error.genericBody')}
              action={{ label: t('common.retry'), onPress: () => void thread.refetch() }}
              testID="conversation-error"
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title={t('messages.threadEmpty')}
              body={t('messages.threadEmptyBody')}
              testID="conversation-empty"
            />
          ) : (
            rows.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isMine={message.senderId === (viewerId ?? 'me')}
                // One timestamp per run of messages, on the last of them.
                // Stamping every bubble turns a conversation into a log.
                showTime={index === rows.length - 1 || breaksRun(rows, index)}
                onRetry={
                  message.delivery === 'failed' ? () => retry(message.id) : undefined
                }
                testID={`message-${message.id}`}
              />
            ))
          )}
        </ScrollView>

        {/* Composer */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            paddingHorizontal: theme.layout.screenPadding,
            paddingTop: theme.spacing.sm,
            paddingBottom: insets.bottom + theme.spacing.sm,
            gap: theme.spacing.sm,
            backgroundColor: theme.colors.background,
          }}
        >
          {attached ? (
            <View
              style={{
                flexDirection: isRTL ? 'row-reverse' : 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                backgroundColor: theme.colors.surfaceAlt,
                borderRadius: theme.radius.sm,
                paddingVertical: theme.spacing.xs,
                paddingHorizontal: theme.spacing.sm,
              }}
              testID="conversation-attachment"
            >
              <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
                {t('messages.sharedRecipe')}
              </Text>
              <IconButton
                icon="close"
                size={28}
                variant="ghost"
                onPress={() => setAttached(null)}
                accessibilityLabel={t('common.cancel')}
                testID="conversation-attachment-remove"
              />
            </View>
          ) : null}

          <View
            style={{
              flexDirection: isRTL ? 'row-reverse' : 'row',
              alignItems: 'flex-end',
              gap: theme.spacing.sm,
            }}
          >
            <View style={{ flex: 1 }}>
              <Input
                value={draft}
                onChangeText={setDraft}
                placeholder={t('messages.placeholder')}
                multiline
                onSubmitEditing={submit}
                testID="conversation-input"
              />
            </View>
            <Button
              label={t('messages.send')}
              onPress={submit}
              loading={isSending}
              disabled={!draft.trim() && !attached}
              testID="conversation-send"
            />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/** True when more than five minutes separate this message from the next. */
function breaksRun(rows: { createdAt: string }[], index: number): boolean {
  const here = rows[index];
  const next = rows[index + 1];
  if (!here || !next) return false;
  return Date.parse(next.createdAt) - Date.parse(here.createdAt) > 5 * 60_000;
}
