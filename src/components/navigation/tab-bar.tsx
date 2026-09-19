import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps, BottomTabNavigationOptions } from 'expo-router/js-tabs';
import { Platform, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressScale } from '@/components/ui/press-scale';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/**
 * Custom bottom tab bar.
 *
 * We render our own rather than styling the default so the active tab can use
 * the app's pill treatment and spring animation, and so the bar honours the
 * theme tokens exactly. Icons are declared per-route in `(tabs)/_layout.tsx`
 * and read here from `options.tabBarIcon`'s sibling metadata.
 */

const ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  index: { active: 'home', inactive: 'home-outline' },
  discover: { active: 'compass', inactive: 'compass-outline' },
  pantry: { active: 'file-tray-full', inactive: 'file-tray-outline' },
  saved: { active: 'heart', inactive: 'heart-outline' },
  profile: { active: 'person-circle', inactive: 'person-circle-outline' },
};

function TabItem({
  routeName,
  label,
  isFocused,
  onPress,
  onLongPress,
}: {
  routeName: string;
  label: string;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();

  // Driving the spring from inside the worklet (rather than assigning to a
  // shared value during render) keeps the animation declarative: Reanimated
  // re-runs this when `isFocused` changes and animates to the new target.
  const iconStyle = useAnimatedStyle(() => {
    const config = { damping: 16, stiffness: 220 };
    return {
      transform: [
        { translateY: withSpring(isFocused ? -2 : 0, config) },
        { scale: withSpring(isFocused ? 1.06 : 1, config) },
      ],
    };
  });

  const icons = ICONS[routeName] ?? { active: 'ellipse', inactive: 'ellipse-outline' };
  const color = isFocused ? theme.colors.tabBarActive : theme.colors.tabBarInactive;

  return (
    <PressScale
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={label}
      testID={`tab-${routeName}`}
      onPress={onPress}
      onLongPress={onLongPress}
      haptic="selection"
      scaleTo={0.9}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingTop: theme.spacing.sm,
      }}
    >
      <Animated.View style={iconStyle}>
        <Ionicons name={isFocused ? icons.active : icons.inactive} size={23} color={color} />
      </Animated.View>
      {/* `micro` carries wide tracking for uppercase eyebrows; a sentence-case
          tab label wants none of it. */}
      <Text
        variant="micro"
        style={{ color, fontWeight: isFocused ? '700' : '600', letterSpacing: 0 }}
        lines={1}
      >
        {label}
      </Text>
    </PressScale>
  );
}

export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    // The bar itself spans the window so its background and border reach the
    // edges; the buttons inside are capped to the same width as every screen,
    // so five tabs do not stretch across a desktop monitor.
    <View
      style={{
        backgroundColor: theme.colors.tabBarBackground,
        borderTopWidth: 1,
        borderTopColor: theme.colors.tabBarBorder,
        paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 0 : theme.spacing.sm),
        minHeight: theme.layout.tabBarHeight,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          width: '100%',
          maxWidth: theme.layout.contentMaxWidth,
        }}
      >
      {state.routes.map((route, index) => {
        const options: Partial<BottomTabNavigationOptions> = descriptors[route.key]?.options ?? {};
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : (options.title ?? route.name);
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <TabItem
            key={route.key}
            routeName={route.name}
            label={label}
            isFocused={isFocused}
            onPress={onPress}
            onLongPress={onLongPress}
          />
        );
      })}
      </View>
    </View>
  );
}
