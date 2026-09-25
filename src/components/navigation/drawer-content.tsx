import { Ionicons } from '@expo/vector-icons';
import {
  useDrawerStatus,
  type DrawerContentComponentProps,
} from 'expo-router/build/react-navigation/drawer';
import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRowDirection } from '@/components/ui/direction';
import { Avatar } from '@/components/ui/avatar';
import { PressScale } from '@/components/ui/press-scale';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { useMerchantSelection } from '@/features/commerce/hooks';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useUnreadTotal } from '@/features/messages/hooks';
import { useUnreadNotifications } from '@/features/notifications/hooks';
import { useCanModerate } from '@/features/submissions/hooks';
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
  /** Unread count, when the destination has one. Zero renders nothing. */
  badge?: number;
};

/** The core food experience. Same destinations as the tab bar, by design. */
const PRIMARY_ROWS: DrawerRow[] = [
  { key: 'home', labelKey: 'tabs.home', icon: 'home-outline', href: '/' },
  { key: 'discover', labelKey: 'tabs.discover', icon: 'compass-outline', href: '/discover' },
  { key: 'pantry', labelKey: 'tabs.pantry', icon: 'file-tray-full-outline', href: '/pantry' },
  {
    key: 'shopping',
    labelKey: 'profile.shoppingList',
    icon: 'cart-outline',
    href: '/shopping-list',
  },
  { key: 'saved', labelKey: 'tabs.saved', icon: 'bookmark-outline', href: '/saved' },
];

/**
 * The cart, which exists only where a branch does.
 *
 * Kept out of `PRIMARY_ROWS` and rendered conditionally for the same reason
 * Friends was: a row leading to a shop that cannot serve this country is a
 * promise the app cannot keep. `isOrderingAvailable` is the single answer to
 * that question and every commerce entry point asks it.
 */
const CART_ROW: DrawerRow = {
  key: 'cart',
  labelKey: 'cart.title',
  icon: 'bag-handle-outline',
  href: '/cart',
};

/** Social and community. */
const SOCIAL_ROWS: DrawerRow[] = [
  {
    key: 'notifications',
    labelKey: 'notifications.title',
    icon: 'notifications-outline',
    href: '/notifications',
  },
  { key: 'friends', labelKey: 'friends.title', icon: 'people-outline', href: '/friends' },
  { key: 'messages', labelKey: 'messages.title', icon: 'chatbubbles-outline', href: '/messages' },
  { key: 'submit', labelKey: 'submit.title', icon: 'restaurant-outline', href: '/submit' },
  {
    key: 'submissions',
    labelKey: 'submissions.title',
    icon: 'document-text-outline',
    href: '/submit/status',
  },
];

/**
 * The review queue, for the people who staff it.
 *
 * Rendered only when the SERVER says the viewer holds the role — and only as a
 * way of reaching a screen the database would refuse them anyway. A hidden row
 * is a courtesy, not a control: `moderate_submission` checks the role again
 * with the caller's own credentials.
 */
const MODERATOR_ROW: DrawerRow = {
  key: 'moderate',
  labelKey: 'moderate.title',
  icon: 'shield-checkmark-outline',
  href: '/moderate',
};

/**
 * Account.
 *
 * "Settings" rather than "Profile" on the gear row. `/profile` is a list of
 * settings — preferences, household, kitchen, appearance, language — and
 * calling it Profile put two rows named after the same noun two lines apart,
 * one of which edited an identity and the other of which did not. The bottom
 * tab keeps its own label; this is about the drawer, where both were visible
 * at once.
 */
const ACCOUNT_ROWS: DrawerRow[] = [
  {
    key: 'profile',
    labelKey: 'profile.edit',
    icon: 'person-circle-outline',
    href: '/settings/profile',
  },
  { key: 'settings', labelKey: 'nav.settings', icon: 'settings-outline', href: '/profile' },
  { key: 'about', labelKey: 'profile.about', icon: 'help-circle-outline', href: '/settings/about' },
];

function Row({ row, onNavigate }: { row: DrawerRow; onNavigate: (href: string) => void }) {
  const theme = useTheme();
  const { t, formatNumber } = useI18n();
  // Named `direction` because this component already takes a `row` prop —
  // the drawer entry it renders.
  const direction = useRowDirection();

  return (
    <PressScale
      accessibilityRole="link"
      accessibilityLabel={
        row.badge
          ? `${t(row.labelKey)}, ${t('messages.unread', { count: row.badge })}`
          : t(row.labelKey)
      }
      onPress={() => onNavigate(row.href)}
      haptic="selection"
      scaleTo={0.98}
      style={{
        flexDirection: direction,
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        // Comfortably above the 44pt minimum: this is a one-handed reach at
        // the far edge of the screen.
        minHeight: 48,
        borderRadius: theme.radius.md,
      }}
      // `drawer-row-`, not `drawer-`: the identity block and the sign-out
      // button live under `drawer-*` too, and a prefix selector for the
      // shorter name would reach them as if they were navigation rows.
      testID={`drawer-row-${row.key}`}
    >
      <Ionicons name={row.icon} size={22} color={theme.colors.textSecondary} />
      <Text variant="body" style={{ flex: 1 }}>
        {t(row.labelKey)}
      </Text>
      {row.badge ? (
        <View
          testID={`drawer-row-${row.key}-badge`}
          style={{
            minWidth: 20,
            paddingHorizontal: 6,
            height: 20,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.primaryStrong,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="micro" style={{ color: theme.colors.textOnPrimary }}>
            {formatNumber(row.badge)}
          </Text>
        </View>
      ) : null}
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
  const { t } = useI18n();
  const row = useRowDirection();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const { user, isEnabled, signOut, isGuest } = useAuth();
  const profile = useOwnProfile();
  const unread = useUnreadTotal();
  const unreadNotifications = useUnreadNotifications();
  const canModerate = useCanModerate();
  /*
    THE CART ENTRY IS SHOWN ONLY WHEN THERE IS A SHOP.

    Selecting one is a database read now, so this is briefly unknown on a cold
    start and the entry is hidden until it is known. Hiding then revealing is
    the right way round: offering a cart and then withdrawing it is a promise
    the app could not keep, and it is the failure this gate exists to prevent.
  */
  const orderingAvailable = useMerchantSelection().merchant !== null;

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
  const bio = profile.data?.bio?.trim() || null;

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
      {/*
        WHO YOU ARE, and nothing else.

        This used to fall back to "Your username, name and how visible you
        are" when there was no handle — instructional copy about a settings
        screen, sitting where a name belongs, and truncating mid-word because
        it was never meant to be a subtitle. An identity block shows an
        identity: avatar, name, handle, and a bio if there is one. When there
        is no handle it shows a name and stops, which is the honest amount of
        information rather than a sentence explaining what is missing.

        Tapping opens the PUBLIC profile — what everyone else sees — because
        that is what a person looking at their own identity block wants to
        check. Editing it is one row below. A user with no handle has no public
        page to open, so they go to the editor that lets them claim one.
      */}
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={handle ? `${name}, @${handle}` : name}
        onPress={() => go(handle ? `/u/${handle}` : '/settings/profile')}
        haptic="selection"
        scaleTo={0.985}
        style={{
          flexDirection: row,
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
            <Text
              variant="footnote"
              color="textSecondary"
              lines={1}
              testID="drawer-identity-handle"
            >
              @{handle}
            </Text>
          ) : null}
          {bio ? (
            <Text variant="micro" color="textTertiary" lines={1} testID="drawer-identity-bio">
              {bio}
            </Text>
          ) : null}
        </View>
      </PressScale>

      <Divider />

      {PRIMARY_ROWS.map((row) => (
        <Row key={row.key} row={row} onNavigate={go} />
      ))}
      {orderingAvailable ? <Row row={CART_ROW} onNavigate={go} /> : null}

      {SOCIAL_ROWS.length > 0 ? (
        <>
          <Divider />
          {SOCIAL_ROWS.map((row) => (
            <Row
              key={row.key}
              row={
                row.key === 'messages'
                  ? { ...row, badge: unread }
                  : row.key === 'notifications'
                    ? { ...row, badge: unreadNotifications }
                    : row
              }
              onNavigate={go}
            />
          ))}
          {canModerate.data === true ? <Row row={MODERATOR_ROW} onNavigate={go} /> : null}
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
              flexDirection: row,
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
