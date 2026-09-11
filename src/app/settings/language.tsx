import * as Updates from 'expo-updates';
import { useState } from 'react';
import { I18nManager, Platform, View } from 'react-native';

import { Button } from '@/components/ui/button';
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
  const [isRestarting, setIsRestarting] = useState(false);

  // Writing direction is applied by the native layer at startup, so a switch
  // between Arabic and English only half-lands until the app reloads: the
  // strings change, the layout does not. Rather than leave the user wondering
  // why, offer the restart directly.
  const directionPending = isRTL !== I18nManager.isRTL;

  const restart = async () => {
    setIsRestarting(true);
    try {
      if (Platform.OS === 'web') {
        // `reloadAsync` is a native-only mechanism; on web a plain reload does
        // exactly the same job.
        window.location.reload();
        return;
      }
      await Updates.reloadAsync();
    } catch {
      // A reload can legitimately fail in a dev client. The notice stays up,
      // so the user can close and reopen the app themselves.
      setIsRestarting(false);
    }
  };

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

      {directionPending ? (
        <View
          style={{
            gap: theme.spacing.md,
            padding: theme.spacing.lg,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.warningSoft,
          }}
        >
          <Text variant="footnote" style={{ color: theme.colors.warningSoftText }}>
            {t('language.restartNotice')}
          </Text>
          <Button
            label={t('language.restartNow')}
            icon="refresh"
            size="md"
            loading={isRestarting}
            onPress={() => void restart()}
            testID="language-restart"
          />
        </View>
      ) : (
        <Text variant="footnote" color="textTertiary">
          {t('language.directionApplied')}
        </Text>
      )}
    </ScreenScroll>
  );
}
