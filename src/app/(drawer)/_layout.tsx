import { Drawer } from 'expo-router/drawer';

import { AppDrawerContent } from '@/components/navigation/drawer-content';
import { useI18n } from '@/i18n';
import { navigationMirrorsItself } from '@/i18n/direction';
import { useTheme } from '@/theme';

/**
 * The drawer sits AROUND the tabs, not instead of them.
 *
 * Five bottom tabs is the right size for the core food experience — Home,
 * Discover, Pantry, Saved, Profile — and the moment Friends, Messages, Submit
 * a Recipe and Admin Review need a home, the tempting move is a sixth tab and
 * then a seventh. That is how "What should I eat?" stops being the obvious
 * thing on screen.
 *
 * So: the tabs keep the food, and everything secondary, social or
 * account-shaped goes in the drawer. The drawer contains exactly one route —
 * the tab group — because it is a way of REACHING screens, not a second place
 * for them to live. Its rows push onto the root stack.
 */
export default function DrawerLayout() {
  const theme = useTheme();
  const { isRTL } = useI18n();

  /*
    The same question every direction decision asks, pointed at the one
    consumer that answers it differently: is something already flipping this
    for me?

    React Navigation reads `I18nManager.isRTL` and nothing else. On native it
    therefore flips the drawer itself, and naming a side here would flip it
    twice — which is what broke this before, displacing the whole content pane
    off the viewport. On web that flag is permanently false whatever the
    document's direction says, so left to itself the drawer opened from the
    LEFT in Arabic while every row inside it read right-to-left.

    `navigationMirrorsItself()` rather than `platformMirrorsRows()`: on web the
    document direction reverses rows and rails, but it does not reach a library
    that never asks the document.
  */
  const drawerPosition = navigationMirrorsItself() ? undefined : isRTL ? 'right' : 'left';

  return (
    <Drawer
      drawerContent={(props) => <AppDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerPosition,
        drawerType: 'front',
        drawerStyle: {
          backgroundColor: theme.colors.background,
          width: 300,
        },
        // The swipe would otherwise fight every horizontal gesture in the app
        // — the Discover collection strip, the results sort chips, the
        // cooking-mode step pager.
        swipeEdgeWidth: 32,
        overlayColor: 'rgba(0, 0, 0, 0.4)',
      }}
    >
      <Drawer.Screen name="(tabs)" />
    </Drawer>
  );
}
