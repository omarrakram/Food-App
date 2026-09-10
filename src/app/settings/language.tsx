import { View } from 'react-native';

import { ListGroup, ListRow } from '@/components/ui/list-row';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useI18n, type Language } from '@/i18n';
import { useTheme } from '@/theme';

const OPTIONS: { value: Language; labelKey: 'language.english' | 'language.arabic' }[] = [
  { value: 'en', labelKey: 'language.english' },
  { value: 'ar', labelKey: 'language.arabic' },
];

export default function LanguageSettingsScreen() {
  const theme = useTheme();
  const { t, language, setLanguage, isRTL } = useI18n();

  return (
    <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
      <ScreenHeader title={t('profile.language')} />

      <ListGroup>
        {OPTIONS.map((option) => (
          <ListRow
            key={option.value}
            title={t(option.labelKey)}
            icon="language-outline"
            iconTone={language === option.value ? 'primary' : 'neutral'}
            onPress={() => setLanguage(option.value)}
            right={
              language === option.value ? (
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: theme.colors.primary,
                  }}
                />
              ) : undefined
            }
            testID={`language-${option.value}`}
          />
        ))}
      </ListGroup>

      {/* Changing writing direction needs a native reload; say so rather than
          silently half-applying it. */}
      <Text variant="footnote" color="textTertiary">
        {isRTL ? t('language.restartNotice') : t('language.restartNotice')}
      </Text>
    </ScreenScroll>
  );
}
