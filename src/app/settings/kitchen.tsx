import { View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { APPLIANCES, SKILL_LEVELS, type Appliance } from '@/types/domain';

export default function KitchenSettingsScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { preferences, updatePreferences } = usePreferences();

  const toggleAppliance = (appliance: Appliance) => {
    const next = preferences.appliances.includes(appliance)
      ? preferences.appliances.filter((entry) => entry !== appliance)
      : [...preferences.appliances, appliance];
    void updatePreferences({ appliances: next });
  };

  return (
    <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.xxl}>
      <ScreenHeader title={t('profile.kitchen')} />

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="headline">{t('onboarding.appliancesLabel')}</Text>
        <Text variant="footnote" color="textSecondary">
          {t('onboarding.appliancesBody')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {APPLIANCES.map((appliance) => (
            <Chip
              key={appliance}
              label={t(`appliance.${appliance}` as const)}
              selected={preferences.appliances.includes(appliance)}
              onPress={() => toggleAppliance(appliance)}
              testID={`appliance-${appliance}`}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="headline">{t('onboarding.skillLabel')}</Text>
        <Text variant="footnote" color="textSecondary">
          {t('onboarding.kitchenBody')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {SKILL_LEVELS.map((level) => (
            <Chip
              key={level}
              label={t(`skill.${level}` as const)}
              selected={preferences.skillLevel === level}
              onPress={() => void updatePreferences({ skillLevel: level })}
              testID={`skill-${level}`}
            />
          ))}
        </View>
      </View>
    </ScreenScroll>
  );
}
