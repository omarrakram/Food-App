import { Drawer } from 'expo-router/drawer';

import { AppDrawerContent } from '@/components/navigation/drawer-content';
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

  return (
    <Drawer
      drawerContent={(props) => <AppDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        // `drawerPosition` is deliberately NOT set. React Navigation already
        // flips the drawer to the right when `I18nManager.isRTL`, so passing
        // `isRTL ? 'right' : 'left'` double-flips it — and on web that did not
        // merely mirror the drawer, it displaced the entire content pane off
        // the viewport (a 390pt-wide screen rendering its close button at
        // x=653). Left to itself the library gets it right.
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
