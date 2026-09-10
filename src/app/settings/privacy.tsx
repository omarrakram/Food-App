import { Alert, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list-row';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useRepositories } from '@/features/data/repositories';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

export default function PrivacySettingsScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const toast = useToast();
  const { preferences, updatePreferences } = usePreferences();
  const { history } = useRepositories();

  const clearHistory = () => {
    Alert.alert(t('profile.privacy'), t('saved.emptyRecentBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.clearAll'),
        style: 'destructive',
        onPress: () => {
          void history.clear();
          toast.show({ message: t('common.done'), tone: 'success' });
        },
      },
    ]);
  };

  return (
    <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
      <ScreenHeader title={t('profile.privacy')} />

      <ListGroup>
        <ListRow
          title={t('profile.privacy')}
          subtitle={t('saved.tabRecent')}
          icon="analytics-outline"
          toggle={{
            value: preferences.personalisationEnabled,
            onChange: (personalisationEnabled) => void updatePreferences({ personalisationEnabled }),
          }}
          testID="privacy-personalisation"
        />
      </ListGroup>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="footnote" color="textSecondary">
          {t('saved.emptyCookedBody')}
        </Text>
        <Button
          label={t('common.clearAll')}
          variant="secondary"
          icon="trash-outline"
          onPress={clearHistory}
          size="md"
          fullWidth
          testID="privacy-clear-history"
        />
      </View>
    </ScreenScroll>
  );
}
