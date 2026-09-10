import { View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Stepper } from '@/components/ui/stepper';
import { Text } from '@/components/ui/text';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import type { CountryCode } from '@/types/domain';

/** Markets we can price for today. Others are accepted but priced as "unknown". */
const COUNTRIES: { code: CountryCode; label: string }[] = [
  { code: 'EG', label: 'Egypt' },
  { code: 'SA', label: 'Saudi Arabia' },
  { code: 'AE', label: 'UAE' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },
];

export default function HouseholdSettingsScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const { preferences, updatePreferences } = usePreferences();

  return (
    <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.xxl}>
      <ScreenHeader title={t('profile.household')} />

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="headline">{t('onboarding.householdTitle')}</Text>
        <Text variant="footnote" color="textSecondary">
          {t('onboarding.householdBody')}
        </Text>
        <Stepper
          value={preferences.householdSize}
          onChange={(householdSize) => void updatePreferences({ householdSize })}
          min={1}
          max={12}
          accessibilityLabel={t('onboarding.householdTitle')}
          testID="household-size"
        />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="headline">{t('onboarding.country')}</Text>
        <Text variant="footnote" color="textSecondary">
          {t('onboarding.locationBody')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {COUNTRIES.map((country) => (
            <Chip
              key={country.code}
              label={country.label}
              selected={preferences.country === country.code}
              onPress={() => void updatePreferences({ country: country.code })}
              testID={`country-${country.code}`}
            />
          ))}
        </View>
        <Text variant="micro" color="textTertiary">
          {preferences.currency}
        </Text>
      </View>

      <Input
        label={t('onboarding.city')}
        value={preferences.city ?? ''}
        onChangeText={(city) => void updatePreferences({ city: city.trim() ? city : null })}
        placeholder={t('onboarding.cityPlaceholder')}
        testID="household-city"
      />
    </ScreenScroll>
  );
}
