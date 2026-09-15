import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PersonRow } from '@/components/friends/person-row';
import { DemoBanner } from '@/components/messages/demo-banner';
import { Input } from '@/components/ui/input';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-provider';
import { useRepositories } from '@/features/data/repositories';
import {
  useFriendActions,
  useFriends,
  useIncomingRequests,
  useOutgoingRequests,
} from '@/features/friends/hooks';
import { useStartConversation } from '@/features/messages/hooks';
import { normaliseHandleInput } from '@/features/profile/handle';
import { useProfileSearch } from '@/features/profile/hooks';
import { useI18n } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { presentError } from '@/lib/errors';
import { useTheme } from '@/theme';

type Tab = 'friends' | 'incoming' | 'sent';

/**
 * Friends.
 *
 * Search is by username and nothing else. Not email, not phone number — a
 * search that accepts either turns the app into a way of confirming whether a
 * given address or number has an account here, and the person being looked up
 * never consented to that. The hint under the field says so, because a user
 * typing an email into it deserves to know why it found nothing.
 */
export default function FriendsScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { isEnabled, user } = useAuth();
  const { demoMode } = useRepositories();

  const [tab, setTab] = useState<Tab>('friends');
  const [query, setQuery] = useState('');

  const friends = useFriends();
  const incoming = useIncomingRequests();
  const outgoing = useOutgoingRequests();
  const search = useProfileSearch(query);
  const actions = useFriendActions();
  const startConversation = useStartConversation();

  const run = (promise: Promise<unknown>, successKey?: 'friends.requestSent') => {
    void promise
      .then(() => {
        if (successKey) toast.show({ message: t(successKey), tone: 'success' });
      })
      .catch((error: unknown) => {
        const presented = presentError(error);
        toast.show({ message: t(presented.bodyKey, presented.values), tone: 'danger' });
      });
  };

  /**
   * Opens the thread with someone, creating it if there is not one yet.
   *
   * `startWith` is the server function, so a pair where either has blocked the
   * other is refused THERE rather than here — a client-side check would be a
   * second implementation of the rule and the one that goes stale.
   */
  const openChat = (userId: string) => {
    void startConversation
      .mutateAsync(userId)
      .then((conversationId) => router.push(`/messages/${conversationId}`))
      .catch((error: unknown) => {
        const presented = presentError(error);
        toast.show({ message: t(presented.bodyKey, presented.values), tone: 'danger' });
      });
  };

  const confirmUnfriend = (userId: string) => {
    void (async () => {
      const confirmed = await confirmAction({
        title: t('friends.unfriendConfirm'),
        message: t('friends.unfriendBody'),
        confirmLabel: t('friends.unfriend'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (confirmed) run(actions.unfriend.mutateAsync(userId));
    })();
  };

  const confirmBlock = (userId: string) => {
    void (async () => {
      const confirmed = await confirmAction({
        title: t('friends.blockConfirm'),
        message: t('friends.blockBody'),
        confirmLabel: t('friends.block'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (confirmed) run(actions.block.mutateAsync(userId));
    })();
  };

  // Demo mode has a viewer and seeded people, so the preview shows the real
  // screen (badged) rather than a sign-in wall it cannot get past.
  if (!demoMode && (!isEnabled || !user)) {
    return (
      <ScreenScroll contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('friends.title')} />
        <EmptyState
          icon="people-outline"
          title={t('friends.needsAccount')}
          body={t('profile.signInPrompt')}
          testID="friends-needs-account"
        />
      </ScreenScroll>
    );
  }

  const searching = query.trim().length >= 2;
  // Someone already in one of the three lists should not be offered "Add":
  // the request would be refused by the database, and the button would be a
  // promise the app cannot keep.
  const knownIds = new Set([
    ...(friends.data ?? []).map((entry) => entry.person.id),
    ...(incoming.data ?? []).map((entry) => entry.person.id),
    ...(outgoing.data ?? []).map((entry) => entry.person.id),
    ...(user ? [user.id] : []),
  ]);

  return (
    <ScreenScroll bottomInset={theme.spacing.xxl} contentGap={theme.spacing.lg}>
      <ScreenHeader title={t('friends.title')} />

      {demoMode ? <DemoBanner testID="friends-demo-banner" /> : null}

      <View style={{ gap: theme.spacing.xs }}>
        <Input
          value={query}
          onChangeText={(next) => setQuery(normaliseHandleInput(next))}
          placeholder={t('friends.searchPlaceholder')}
          leadingIcon="search"
          trailingIcon={query ? 'close-circle' : undefined}
          onTrailingIconPress={() => setQuery('')}
          autoCapitalize="none"
          autoCorrect={false}
          testID="friends-search"
        />
        <Text variant="micro" color="textTertiary">
          {t('friends.searchHint')}
        </Text>
      </View>

      {searching ? (
        <View testID="friends-search-results">
          {search.isLoading ? (
            <SkeletonList count={2} />
          ) : (search.data ?? []).length === 0 ? (
            <EmptyState
              icon="person-outline"
              title={t('friends.searchEmpty')}
              body={t('friends.searchEmptyBody')}
              testID="friends-search-empty"
            />
          ) : (
            (search.data ?? []).map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                testID={`friends-result-${person.id}`}
                actions={
                  knownIds.has(person.id)
                    ? []
                    : [
                        {
                          labelKey: 'friends.add',
                          variant: 'primary',
                          onPress: () =>
                            run(actions.send.mutateAsync(person.id), 'friends.requestSent'),
                          testID: `friends-add-${person.id}`,
                        },
                      ]
                }
              />
            ))
          )}
        </View>
      ) : (
        <>
          <SegmentedControl<Tab>
            options={[
              { value: 'friends', label: t('friends.tabFriends') },
              { value: 'incoming', label: t('friends.tabIncoming') },
              { value: 'sent', label: t('friends.tabSent') },
            ]}
            value={tab}
            onChange={setTab}
            testID="friends-tabs"
          />

          {tab === 'friends' ? (
            friends.isLoading ? (
              <SkeletonList count={3} />
            ) : (friends.data ?? []).length === 0 ? (
              <EmptyState
                icon="people-outline"
                title={t('friends.empty')}
                body={t('friends.emptyBody')}
                testID="friends-empty"
              />
            ) : (
              (friends.data ?? []).map((entry) => (
                <PersonRow
                  key={entry.person.id}
                  person={entry.person}
                  testID={`friend-${entry.person.id}`}
                  actions={[
                    {
                      labelKey: 'friends.message',
                      variant: 'primary',
                      onPress: () => openChat(entry.person.id),
                      testID: `friends-message-${entry.person.id}`,
                    },
                  ]}
                  overflow={[
                    {
                      labelKey: 'friends.unfriend',
                      icon: 'person-remove-outline',
                      destructive: true,
                      onPress: () => confirmUnfriend(entry.person.id),
                      testID: `friends-unfriend-${entry.person.id}`,
                    },
                    {
                      labelKey: 'friends.block',
                      icon: 'ban-outline',
                      destructive: true,
                      onPress: () => confirmBlock(entry.person.id),
                      testID: `friends-block-${entry.person.id}`,
                    },
                  ]}
                />
              ))
            )
          ) : null}

          {tab === 'incoming' ? (
            incoming.isLoading ? (
              <SkeletonList count={2} />
            ) : (incoming.data ?? []).length === 0 ? (
              <EmptyState
                icon="mail-outline"
                title={t('friends.noIncoming')}
                body={t('friends.noIncomingBody')}
                testID="friends-no-incoming"
              />
            ) : (
              (incoming.data ?? []).map((request) => (
                <PersonRow
                  key={request.id}
                  person={request.person}
                  testID={`friends-incoming-${request.id}`}
                  actions={[
                    {
                      labelKey: 'friends.accept',
                      variant: 'primary',
                      onPress: () => run(actions.accept.mutateAsync(request.id)),
                      testID: `friends-accept-${request.id}`,
                    },
                    {
                      labelKey: 'friends.decline',
                      variant: 'ghost',
                      onPress: () => run(actions.decline.mutateAsync(request.id)),
                    },
                  ]}
                />
              ))
            )
          ) : null}

          {tab === 'sent' ? (
            outgoing.isLoading ? (
              <SkeletonList count={2} />
            ) : (outgoing.data ?? []).length === 0 ? (
              <EmptyState
                icon="paper-plane-outline"
                title={t('friends.noSent')}
                body={t('friends.noSentBody')}
                testID="friends-no-sent"
              />
            ) : (
              (outgoing.data ?? []).map((request) => (
                <PersonRow
                  key={request.id}
                  person={request.person}
                  testID={`friends-sent-${request.id}`}
                  actions={[
                    {
                      labelKey: 'friends.cancel',
                      onPress: () => run(actions.cancel.mutateAsync(request.id)),
                      testID: `friends-cancel-${request.id}`,
                    },
                  ]}
                />
              ))
            )
          ) : null}
        </>
      )}
    </ScreenScroll>
  );
}
