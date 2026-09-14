import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * Says, unmissably, that nothing here reaches anybody.
 *
 * The rule this exists to keep: a demo action must never be mistakable for a
 * successful server action. The preview needs working screens to walk through,
 * which means the buttons have to do something — so what makes it honest is
 * this banner, on every screen the demo repositories feed, in the warning
 * colour rather than any of the ones the app uses for success.
 */
export function DemoBanner({ testID }: { testID?: string }) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <View
      testID={testID ?? 'demo-banner'}
      style={{
        borderWidth: 1,
        borderColor: theme.colors.warning,
        backgroundColor: theme.colors.surfaceAlt,
        borderRadius: theme.radius.md,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        gap: 2,
      }}
    >
      <Text variant="footnote" color="warning">
        {t('demo.title')}
      </Text>
      <Text variant="micro" color="textSecondary">
        {t('demo.body')}
      </Text>
    </View>
  );
}
