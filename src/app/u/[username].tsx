import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { EmptyState } from '@/components/ui/states';
import { SkeletonList } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useFriends } from '@/features/friends/hooks';
import { useMessagingViewerId, useStartConversation } from '@/features/messages/hooks';
import { usePublicProfile } from '@/features/profile/hooks';
import { useI18n } from '@/i18n';
import { presentError } from '@/lib/errors';
import { useTheme } from '@/theme';

/**
 * Somebody else's profile.
 *
 * Everything rendered here comes from `public_profiles`, a database view whose
 * columns are written out one at a time. That is not an implementation detail
 * — it is the reason this screen cannot leak: there is no allergen, dietary
 * preference, pantry item or email address in the object it receives, so no
 * amount of editing this file can put one on screen.
 *
 * A hidden profile and a nonexistent one render identically on purpose. Saying
 * "this account exists but you may not see it" tells a stranger something the
 * owner chose not to.
 */
export default function PublicProfileScreen() {
  const theme = useTheme();
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { username } = useLocalSearchParams<{ username: string }>();
  const profile = usePublicProfile(username);
  const friends = useFriends();
  const viewerId = useMessagingViewerId();
  const startConversation = useStartConversation();

  if (profile.isLoading) {
    return (
      <ScreenScroll contentGap={theme.spacing.lg}>
        <ScreenHeader title={username ? `@${username}` : ''} />
        <SkeletonList count={2} />
      </ScreenScroll>
    );
  }

  if (!profile.data) {
    return (
      <ScreenScroll contentGap={theme.spacing.lg}>
        <ScreenHeader title={username ? `@${username}` : ''} />
        <EmptyState
          icon="person-outline"
          title={t('profile.notFound')}
          body={t('profile.notFoundBody')}
          testID="public-profile-missing"
        />
      </ScreenScroll>
    );
  }

  const person = profile.data;

  /**
   * Message is offered only to friends.
   *
   * Not a security boundary — `start_conversation` refuses blocked pairs and
   * the policies decide who may send — but a product one: a Message button on
   * every stranger's profile makes the app a way to be contacted by anyone,
   * which is not what people who set a public profile agreed to.
   */
  const friendship = (friends.data ?? []).find((entry) => entry.person.id === person.id);
  const isFriend = Boolean(friendship);

  const message = () => {
    void startConversation
      .mutateAsync(person.id)
      .then((conversationId) => router.push(`/messages/${conversationId}`))
      .catch((error: unknown) => {
        const presented = presentError(error);
        toast.show({ message: t(presented.bodyKey, presented.values), tone: 'danger' });
      });
  };

  return (
    <ScreenScroll contentGap={theme.spacing.lg} testID="public-profile">
      <ScreenHeader title={person.username ? `@${person.username}` : ''} />

      <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
        <Avatar
          url={person.avatarUrl}
          fallback={person.displayName ?? person.username}
          size={84}
        />

        {person.displayName ? <Text variant="title2">{person.displayName}</Text> : null}
        {person.username ? (
          <Text variant="footnote" color="textSecondary">
            @{person.username}
          </Text>
        ) : null}
      </View>

      {person.bio ? (
        <Text variant="body" align="center">
          {person.bio}
        </Text>
      ) : null}

      <View style={{ alignItems: 'center', gap: 4 }}>
        {person.city ? (
          <Text variant="footnote" color="textSecondary">
            {person.city}
          </Text>
        ) : null}
        <Text variant="micro" color="textTertiary">
          {t('profile.joined', { date: formatDate(person.joinedAt, { month: 'long', year: 'numeric' }) })}
        </Text>
        {/*
          "Friends since" belongs here rather than on the friends list row.
          On a 320px row beside an avatar, a name and a Message button it
          truncated to "Friends since A..." — which is not a date, and told
          the reader less than nothing. Here the line has the width to say it.
        */}
        {friendship ? (
          <Text variant="micro" color="textTertiary" testID="public-profile-friends-since">
            {t('friends.since', {
              date: formatDate(friendship.friendsSince, { month: 'long', year: 'numeric' }),
            })}
          </Text>
        ) : null}
      </View>

      {isFriend && viewerId !== null ? (
        <Button
          label={t('friends.message')}
          icon="chatbubble-outline"
          onPress={message}
          loading={startConversation.isPending}
          testID="public-profile-message"
        />
      ) : null}
    </ScreenScroll>
  );
}
