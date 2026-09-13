import { View } from 'react-native';

import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { creditedImages } from '@/features/recipes/images';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * Photograph credits.
 *
 * CC BY and CC BY-SA oblige us to name the photographer and the licence. That
 * obligation does not go away because a credit under every thumbnail would
 * look cluttered — it moves here, and the recipe detail links to it.
 *
 * Built from the generated image index, so a photograph cannot be shipped
 * without appearing on this screen: there is no second list to forget to
 * update.
 */
export default function CreditsScreen() {
  const theme = useTheme();
  const { t } = useI18n();

  const credited = creditedImages();

  return (
    <ScreenScroll bottomInset={theme.spacing.xxl} contentGap={theme.spacing.lg}>
      <ScreenHeader title={t('credits.title')} />

      <Text variant="body" color="textSecondary">
        {t('credits.intro')}
      </Text>

      {credited.length === 0 ? (
        <EmptyState
          icon="images-outline"
          title={t('credits.none')}
          body={t('credits.noneBody')}
          testID="credits-empty"
        />
      ) : (
        <View style={{ gap: theme.spacing.md }} testID="credits-list">
          {credited.map(([slug, image]) => (
            <View key={slug} style={{ gap: 2 }}>
              <Text variant="callout">{slug}</Text>
              <Text variant="footnote" color="textSecondary">
                {image.attribution}
              </Text>
              <Text variant="micro" color="textTertiary" lines={1}>
                {image.sourcePage}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScreenScroll>
  );
}
