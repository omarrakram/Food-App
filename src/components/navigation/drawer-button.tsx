import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { Pressable } from 'react-native';

import { useI18n } from '@/i18n';
import { hitSlopFor } from '@/components/ui/touch-target';
import { useTheme } from '@/theme';

/**
 * Opens the drawer.
 *
 * The edge swipe is the fast way in and the reason the drawer is a drawer, but
 * it is invisible and undiscoverable, and it does not exist at all for someone
 * navigating by keyboard or screen reader. So there is always a button.
 *
 * `getParent()` because this renders inside the tab navigator, which is a
 * child of the drawer: the tab navigator has no `openDrawer`.
 */
export function DrawerButton({ testID = 'open-drawer' }: { testID?: string }) {
  const theme = useTheme();
  const { t } = useI18n();
  const navigation = useNavigation();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('drawer.open')}
      accessibilityHint={t('drawer.openHint')}
      onPress={() => {
        const parent = navigation.getParent();
        // Typed loosely because the drawer's actions are not in the tab
        // navigator's type. The guard is what makes it safe rather than the
        // cast: on web at a wide layout there may be no drawer to open.
        (parent as unknown as { openDrawer?: () => void } | undefined)?.openDrawer?.();
      }}
      hitSlop={hitSlopFor(24)}
      testID={testID}
      style={({ pressed }) => ({
        opacity: pressed ? 0.6 : 1,
        // A square target rather than a bare glyph, so the press area matches
        // what the eye expects to be pressable.
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Ionicons name="menu" size={24} color={theme.colors.text} />
    </Pressable>
  );
}
