import { View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import {
  INGREDIENTS_BY_SLUG,
  SUGGESTED_KITCHEN_BASICS,
} from '@/features/ingredients/catalogue';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * The things this cook always has.
 *
 * THIS SCREEN EXISTS BECAUSE THE APP USED TO GUESS. It assumed onions, garlic,
 * stock cubes, tomato paste, oil and every spice were in everyone's kitchen,
 * so someone holding rice and tomatoes was told they had six of the seven
 * things Tomato Rice needs. They had two. The app now assumes water and salt
 * and nothing else, and everything past that is a question with an answer the
 * user gives here.
 *
 * It is a short list on purpose. Forty checkboxes do not get read, they get
 * accepted — which would be the same guess wearing a different hat.
 */
export default function BasicsSettingsScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { preferences, updatePreferences } = usePreferences();

  const chosen = preferences.alwaysAvailableIngredients;

  const toggle = (slug: string) => {
    const next = chosen.includes(slug)
      ? chosen.filter((entry) => entry !== slug)
      : [...chosen, slug];
    void updatePreferences({ alwaysAvailableIngredients: next });
  };

  return (
    <ScreenScroll bottomInset={theme.spacing.xxl} contentGap={theme.spacing.lg}>
      <ScreenHeader title={t('basics.title')} subtitle={t('basics.subtitle')} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {SUGGESTED_KITCHEN_BASICS.map((slug) => {
          const ingredient = INGREDIENTS_BY_SLUG.get(slug);
          if (!ingredient) return null;
          return (
            <Chip
              key={slug}
              label={ingredient.name}
              selected={chosen.includes(slug)}
              onPress={() => toggle(slug)}
              testID={`basic-${slug}`}
            />
          );
        })}
      </View>

      <Text variant="footnote" color="textSecondary">
        {t('basics.assumedNote')}
      </Text>
    </ScreenScroll>
  );
}
