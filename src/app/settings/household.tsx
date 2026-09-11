import { View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Stepper } from '@/components/ui/stepper';
import { Text } from '@/components/ui/text';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { isCountrySupported } from '@/features/pricing/price-book';
import { useI18n } from '@/i18n';
import { currencySymbol } from '@/lib/format/money';
import { useTheme } from '@/theme';
import { COUNTRY_CODES, type CountryCode } from '@/types/domain';

/** Markets we can price for today. Others are accepted but priced as "unknown". */

export default function HouseholdSettingsScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
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
          {t('onboarding.householdBody')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {COUNTRY_CODES.map((code: CountryCode) => (
            <Chip
              key={code}
              label={
                isCountrySupported(code)
                  ? t(`country.${code}` as const)
                  : `${t(`country.${code}` as const)} · ${t('common.comingSoon')}`
              }
              selected={preferences.country === code}
              // Only Egypt has a real price survey; the rest would make the
              // budget features quietly wrong.
              disabled={!isCountrySupported(code)}
              onPress={() => void updatePreferences({ country: code })}
              testID={`country-${code}`}
            />
          ))}
        </View>
        <Text variant="micro" color="textTertiary">
          {currencySymbol(preferences.currency, locale)}
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
