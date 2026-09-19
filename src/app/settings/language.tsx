import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list-row';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useI18n, type Language } from '@/i18n';
import { isDirectionRestartPending } from '@/i18n/direction';
import { useTheme } from '@/theme';

const OPTIONS: { value: Language; labelKey: 'language.english' | 'language.arabic' }[] = [
  { value: 'en', labelKey: 'language.english' },
  { value: 'ar', labelKey: 'language.arabic' },
];

export default function LanguageSettingsScreen() {
  const theme = useTheme();
  const { t, language, setLanguage } = useI18n();
  const [isRestarting, setIsRestarting] = useState(false);

  // The native writing-direction flag is read once at startup, so on native a
  // switch between Arabic and English leaves the parts this code cannot
  // mirror itself — the drawer's side, gesture directions — pointing the old
  // way until the app reloads. Rather than leave the user wondering, offer the
  // restart directly.
  //
  // It is deliberately NOT offered on web, where there is no native flag and
  // nothing is pending. The old test compared `isRTL` against
  // `I18nManager.isRTL`, which on web is `undefined`, so this notice was
  // showing permanently on the web build — in English as well as Arabic.
  const directionPending = isDirectionRestartPending(language);

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
            // `language-choice-`, not `language-`: `language-restart` sits
            // on the same screen, and a prefix selector for the shorter name
            // would reach the restart button as if it were a language.
            testID={`language-choice-${option.value}`}
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
