import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';

import { useRowDirection } from '@/components/ui/direction';
import { PressScale } from '@/components/ui/press-scale';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * Says, unmissably, that nothing here reaches anybody.
 *
 * THE RULE: a demo action must never be mistakable for a successful server
 * action. The preview needs working screens to walk through, which means the
 * buttons have to do something — so what makes it honest is this banner, on
 * every screen the demo repositories feed.
 *
 * WHY IT IS A LINE RATHER THAN A CARD. It used to be a four-line paragraph,
 * repeated identically at the top of eight screens. Repetition at that volume
 * is how a warning becomes wallpaper: by the third screen nobody is reading
 * it, which is the opposite of what a warning is for. One line, always
 * present, in the warning colour and never in any colour the app uses for
 * success — and the full explanation one tap away for anybody who wants it.
 *
 * What did NOT change: it is on every screen, it never collapses to nothing,
 * and it never sits below the fold. The compact form still names the thing
 * ("DEMO MODE") and states the consequence ("stays on this device") without
 * being expanded, so the tap is for detail, not for the warning itself.
 */
export function DemoBanner({ testID }: { testID?: string }) {
  const theme = useTheme();
  const { t } = useI18n();
  const row = useRowDirection();
  const [expanded, setExpanded] = useState(false);

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      // The full text is the label whether or not it is on screen: a screen
      // reader user should not have to expand a warning to hear it.
      accessibilityLabel={`${t('demo.title')}. ${t('demo.body')}`}
      accessibilityHint={expanded ? undefined : t('demo.expandHint')}
      onPress={() => setExpanded((open) => !open)}
      haptic="selection"
      scaleTo={0.995}
      testID={testID ?? 'demo-banner'}
      style={{
        borderWidth: 1,
        borderColor: theme.colors.warning,
        backgroundColor: theme.colors.warningSoft,
        borderRadius: theme.radius.sm,
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        gap: expanded ? 4 : 0,
      }}
    >
      <View
        style={{
          flexDirection: row,
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}
      >
        <Ionicons name="flask-outline" size={13} color={theme.colors.warning} />
        <Text variant="micro" color="warningSoftText" style={{ flex: 1 }} lines={1}>
          {t('demo.compact')}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={13}
          color={theme.colors.warningSoftText}
        />
      </View>

      {expanded ? (
        <Text variant="micro" color="warningSoftText" testID="demo-banner-detail">
          {t('demo.body')}
        </Text>
      ) : null}
    </PressScale>
  );
}
