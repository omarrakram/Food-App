import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { DemoBanner } from '@/components/messages/demo-banner';
import { Button } from '@/components/ui/button';
import { PersonRow } from '@/components/friends/person-row';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useFriends } from '@/features/friends/hooks';
import {
  useMessagingIsLive,
  useMessagingViewerId,
  useStartConversation,
} from '@/features/messages/hooks';
import { recipeShareText, recipeShareUrl } from '@/features/sharing/links';
import { useI18n } from '@/i18n';
import { presentError } from '@/lib/errors';
import { useTheme } from '@/theme';

/**
 * Sharing a recipe.
 *
 * TWO ROUTES OUT, and they are genuinely different things rather than two
 * buttons for one.
 *
 * IN-APP: pick someone you already have a conversation with (or start one) and
 * the recipe arrives as a card carrying its ID. No copy of the content
 * travels, so the card renders the recipe as it is now — and one that is later
 * unpublished stops rendering rather than persisting in a chat log.
 *
 * EXTERNAL: a URL, for people who are not in the app. The OS share sheet where
 * there is one, the clipboard where there is not — the web build has no native
 * share on every browser, and a Copy link that always works beats a Share that
 * sometimes does nothing.
 *
 * The people list is the FRIEND list, and pressing Share opens the thread with
 * the recipe already attached rather than sending immediately. Two reasons: a
 * share with no way to add "try this, it's what you had last week" is a worse
 * share, and a one-tap send from a sheet is a one-tap mistake. The thread is
 * found or created by `start_conversation`, so a blocked pair is refused by the
 * database rather than by a client-side check that can go stale.
 */
export function RecipeShareSheet({
  visible,
  onClose,
  recipeId,
  recipeTitle,
}: {
  visible: boolean;
  onClose: () => void;
  recipeId: string;
  recipeTitle: string;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const isLive = useMessagingIsLive();
  const viewerId = useMessagingViewerId();
  const friends = useFriends();
  const start = useStartConversation();
  const [busy, setBusy] = useState<string | null>(null);

  const openThread = (userId: string) => {
    setBusy(userId);
    void start
      .mutateAsync(userId)
      .then((conversationId) => {
        onClose();
        router.push(`/messages/${conversationId}?shareRecipeId=${recipeId}`);
      })
      .catch((error: unknown) => {
        const presented = presentError(error);
        toast.show({ message: t(presented.bodyKey, presented.values), tone: 'danger' });
      })
      .finally(() => setBusy(null));
  };

  const shareExternally = () => {
    void (async () => {
      try {
        // React Native's Share is a no-op on some web browsers and throws on
        // others; either way the clipboard is the fallback that always works.
        const result = await Share.share({
          message: recipeShareText(recipeTitle, recipeId),
          title: recipeTitle,
        });
        if (result.action === Share.dismissedAction) return;
      } catch {
        await Clipboard.setStringAsync(recipeShareUrl(recipeId));
        toast.show({ message: t('recipe.shareLinkCopied'), tone: 'success' });
      }
    })();
  };

  const copyLink = () => {
    void (async () => {
      await Clipboard.setStringAsync(recipeShareUrl(recipeId));
      toast.show({ message: t('recipe.shareLinkCopied'), tone: 'success' });
    })();
  };

  const people = friends.data ?? [];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('recipe.shareTitle')}
      testID="recipe-share-sheet"
    >
      <View style={{ gap: theme.spacing.lg }}>
        {isLive ? null : <DemoBanner testID="share-demo-banner" />}

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="subhead" color="textSecondary">
            {t('recipe.shareToChat')}
          </Text>

          {viewerId === null ? (
            <Text variant="footnote" color="textTertiary">
              {t('messages.needsAccountBody')}
            </Text>
          ) : friends.isLoading ? (
            <SkeletonList count={2} />
          ) : people.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title={t('recipe.shareNoFriends')}
              testID="share-no-friends"
            />
          ) : (
            people.map((friend) => (
              <PersonRow
                key={friend.person.id}
                person={friend.person}
                testID={`share-to-${friend.person.id}`}
                actions={[
                  {
                    labelKey: 'recipe.share',
                    variant: 'primary',
                    loading: busy === friend.person.id,
                    onPress: () => openThread(friend.person.id),
                    testID: `share-send-${friend.person.id}`,
                  },
                ]}
              />
            ))
          )}
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="subhead" color="textSecondary">
            {t('recipe.shareExternally')}
          </Text>
          <Button
            label={t('recipe.shareLink')}
            icon="link-outline"
            variant="secondary"
            onPress={copyLink}
            testID="share-copy-link"
          />
          <Button
            label={t('recipe.shareElsewhere')}
            icon="share-outline"
            variant="ghost"
            onPress={shareExternally}
            testID="share-external"
          />
        </View>
      </View>
    </Sheet>
  );
}
