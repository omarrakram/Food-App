import { Ionicons } from '@expo/vector-icons';
import {
  useDrawerStatus,
  type DrawerContentComponentProps,
} from 'expo-router/build/react-navigation/drawer';
import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { PressScale } from '@/components/ui/press-scale';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useOwnProfile } from '@/features/profile/hooks';
import { useI18n, type TranslationKey } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { useTheme } from '@/theme';

/**
 * The drawer.
 *
 * It reaches the parts of the app the bottom tabs should not grow to hold.
 * The tabs are the food — Home, Discover, Pantry, Saved, Profile — and they
 * are repeated at the top of this list because a drawer that omits where you
 * already are reads as a different app rather than another way through the
 * same one.
 *
 * Rows appear only when their destination exists. A greyed-out "Friends" that
 * does nothing teaches the user the app is unfinished; an absent one teaches
 * nothing, which is correct until Phase I lands.
 */

type DrawerRow = {
  key: string;
  labelKey: TranslationKey;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
};

/** The core food experience. Same destinations as the tab bar, by design. */
const PRIMARY_ROWS: DrawerRow[] = [
  { key: 'home', labelKey: 'tabs.home', icon: 'home-outline', href: '/' },
  { key: 'discover', labelKey: 'tabs.discover', icon: 'compass-outline', href: '/discover' },
  { key: 'pantry', labelKey: 'tabs.pantry', icon: 'file-tray-full-outline', href: '/pantry' },
  { key: 'shopping', labelKey: 'profile.shoppingList', icon: 'cart-outline', href: '/shopping-list' },
  { key: 'saved', labelKey: 'tabs.saved', icon: 'bookmark-outline', href: '/saved' },
];

/**
 * Social. Empty until Phase I–N, and deliberately so — see the note above
 * about rows that go nowhere.
 */
const SOCIAL_ROWS: DrawerRow[] = [];

const ACCOUNT_ROWS: DrawerRow[] = [
  { key: 'profile', labelKey: 'profile.edit', icon: 'person-circle-outline', href: '/settings/profile' },
  { key: 'settings', labelKey: 'tabs.profile', icon: 'settings-outline', href: '/profile' },
  { key: 'about', labelKey: 'profile.about', icon: 'help-circle-outline', href: '/settings/about' },
];

function Row({
  row,
  onNavigate,
}: {
  row: DrawerRow;
  onNavigate: (href: string) => void;
}) {
  const theme = useTheme();
  const { t, isRTL } = useI18n();

  return (
    <PressScale
      accessibilityRole="link"
      accessibilityLabel={t(row.labelKey)}
      onPress={() => onNavigate(row.href)}
      haptic="selection"
      scaleTo={0.98}
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        // Comfortably above the 44pt minimum: this is a one-handed reach at
        // the far edge of the screen.
        minHeight: 48,
        borderRadius: theme.radius.md,
      }}
      testID={`drawer-${row.key}`}
    >
      <Ionicons name={row.icon} size={22} color={theme.colors.textSecondary} />
      <Text variant="body" style={{ flex: 1 }}>
        {t(row.labelKey)}
      </Text>
    </PressScale>
  );
}

function Divider() {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 1,
        backgroundColor: theme.colors.border,
        marginVertical: theme.spacing.sm,
        marginHorizontal: theme.spacing.lg,
      }}
    />
  );
}

export function AppDrawerContent({ navigation }: DrawerContentComponentProps) {
  const theme = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const { user, isEnabled, signOut, isGuest } = useAuth();
  const profile = useOwnProfile();

  /**
   * A closed drawer must not be readable by assistive technology.
   *
   * React Navigation keeps the drawer mounted and slides it off-screen, and it
   * does not hide the contents from the accessibility tree — so without this a
   * screen-reader user anywhere in the app can swipe straight into "Home,
   * Discover, Pantry, Log out" with no drawer visible and no way to tell where
   * those announcements are coming from.
   */
  const isOpen = useDrawerStatus() === 'open';
  const hidden = !isOpen;

  const name = profile.data?.displayName ?? preferences.displayName ?? t('profile.guest');
  const handle = profile.data?.username;

  // Closing first means the drawer is not still sliding shut over the screen
  // it just pushed. Doing it after `push` leaves a visible overlap.
  const go = (href: string) => {
    navigation.closeDrawer();
    router.push(href as never);
  };

  const confirmSignOut = () => {
    void (async () => {
      navigation.closeDrawer();
      const confirmed = await confirmAction({
        title: t('profile.signOutConfirm'),
        confirmLabel: t('profile.signOut'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!confirmed) return;
      await signOut();
      router.replace('/(auth)/welcome');
    })();
  };

  return (
    <ScrollView
      testID="app-drawer"
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      aria-hidden={hidden}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.lg,
        paddingBottom: insets.bottom + theme.spacing.xl,
        gap: theme.spacing.xs,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Identity, and a way to change it. */}
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={t('profile.edit')}
        onPress={() => go('/settings/profile')}
        haptic="selection"
        scaleTo={0.985}
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.lg,
        }}
        testID="drawer-identity"
      >
        <Avatar url={profile.data?.avatarUrl} fallback={name} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline" lines={1}>
            {name}
          </Text>
          {handle ? (
            <Text variant="footnote" color="textSecondary" lines={1}>
              @{handle}
            </Text>
          ) : (
            <Text variant="footnote" color="textTertiary" lines={1}>
              {isEnabled && !user ? t('profile.signInPrompt') : t('profile.editSub')}
            </Text>
          )}
        </View>
      </PressScale>

      <Divider />

      {PRIMARY_ROWS.map((row) => (
        <Row key={row.key} row={row} onNavigate={go} />
      ))}

      {SOCIAL_ROWS.length > 0 ? (
        <>
          <Divider />
          {SOCIAL_ROWS.map((row) => (
            <Row key={row.key} row={row} onNavigate={go} />
          ))}
        </>
      ) : null}

      <Divider />

      {ACCOUNT_ROWS.map((row) => (
        <Row key={row.key} row={row} onNavigate={go} />
      ))}

      {/*
        Sign out only when there is a session to end. A guest pressing it would
        be told they had been signed out of an account they never had.
      */}
      {user ? (
        <>
          <Divider />
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={t('profile.signOut')}
            onPress={confirmSignOut}
            haptic="selection"
            scaleTo={0.98}
            style={{
              flexDirection: isRTL ? 'row-reverse' : 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              paddingVertical: theme.spacing.md,
              paddingHorizontal: theme.spacing.lg,
              minHeight: 48,
            }}
            testID="drawer-sign-out"
          >
            <Ionicons name="log-out-outline" size={22} color={theme.colors.danger} />
            <Text variant="body" color="danger">
              {t('profile.signOut')}
            </Text>
          </PressScale>
        </>
      ) : isGuest && isEnabled ? (
        <>
          <Divider />
          <Row
            row={{
              key: 'sign-in',
              labelKey: 'auth.getStarted',
              icon: 'log-in-outline',
              href: '/(auth)/welcome',
            }}
            onNavigate={go}
          />
        </>
      ) : null}
    </ScrollView>
  );
}
