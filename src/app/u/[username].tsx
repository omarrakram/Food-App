import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { EmptyState } from '@/components/ui/states';
import { SkeletonList } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { usePublicProfile } from '@/features/profile/hooks';
import { useI18n } from '@/i18n';
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
  const { username } = useLocalSearchParams<{ username: string }>();
  const profile = usePublicProfile(username);

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
      </View>
    </ScreenScroll>
  );
}
