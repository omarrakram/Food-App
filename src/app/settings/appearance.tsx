import { View } from 'react-native';

import { ListGroup, ListRow } from '@/components/ui/list-row';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { useI18n } from '@/i18n';
import { useTheme, useThemeContext, type ColorSchemePreference } from '@/theme';

const OPTIONS: { value: ColorSchemePreference; labelKey: 'appearance.system' | 'appearance.light' | 'appearance.dark'; icon: 'phone-portrait-outline' | 'sunny-outline' | 'moon-outline' }[] = [
  { value: 'system', labelKey: 'appearance.system', icon: 'phone-portrait-outline' },
  { value: 'light', labelKey: 'appearance.light', icon: 'sunny-outline' },
  { value: 'dark', labelKey: 'appearance.dark', icon: 'moon-outline' },
];

export default function AppearanceSettingsScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { preference, setPreference } = useThemeContext();

  return (
    <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
      <ScreenHeader title={t('profile.appearance')} />
      <ListGroup>
        {OPTIONS.map((option) => (
          <ListRow
            key={option.value}
            title={t(option.labelKey)}
            icon={option.icon}
            iconTone={preference === option.value ? 'primary' : 'neutral'}
            onPress={() => setPreference(option.value)}
            right={
              preference === option.value ? (
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
            testID={`appearance-${option.value}`}
          />
        ))}
      </ListGroup>
    </ScreenScroll>
  );
}
