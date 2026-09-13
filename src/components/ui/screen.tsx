import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useRef, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

import { IconButton } from './button';
import { Text } from './text';

export type ScreenProps = {
  children?: ReactNode;
  /** Apply safe-area padding at the top. Off when a header renders above. */
  edges?: { top?: boolean; bottom?: boolean };
  /** Horizontal screen padding. Set false for edge-to-edge carousels. */
  padded?: boolean;
  background?: 'background' | 'backgroundAlt' | 'surface';
  style?: ViewStyle;
  testID?: string;
};

/** Base screen container: background colour, safe area, horizontal padding. */
export function Screen({
  children,
  edges = { top: true, bottom: false },
  padded = true,
  background = 'background',
  style,
  testID,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      testID={testID}
      style={[
        {
          flex: 1,
          backgroundColor: theme.colors[background],
          paddingTop: edges.top ? insets.top : 0,
          paddingBottom: edges.bottom ? insets.bottom : 0,
          paddingHorizontal: padded ? theme.layout.screenPadding : 0,
          // Keeps a phone layout at phone proportions on a wide browser.
          // `alignSelf: center` rather than margins so it composes inside a
          // flex parent; on any real device the cap is never reached.
          width: '100%',
          maxWidth: theme.layout.contentMaxWidth,
          alignSelf: 'center',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export type ScreenScrollProps = ScreenProps &
  Pick<ScrollViewProps, 'refreshControl' | 'onScroll' | 'scrollEventThrottle' | 'stickyHeaderIndices'> & {
    /** Extra bottom padding so content clears the tab bar / sticky footer. */
    bottomInset?: number;
    contentGap?: number;
    /**
     * Fired once per approach to the bottom, for paginated screens.
     *
     * A plain ScrollView has no such callback, and re-firing it on every scroll
     * event would queue a dozen page fetches for one flick. The latch below
     * clears only after the user scrolls back up out of the threshold.
     */
    onEndReached?: () => void;
    /** How close to the bottom counts as "the end", in points. */
    onEndReachedThreshold?: number;
  };

/** Scrollable screen with sensible keyboard + inset behaviour. */
export function ScreenScroll({
  children,
  edges = { top: true, bottom: false },
  padded = true,
  background = 'background',
  bottomInset = 0,
  contentGap,
  onEndReached,
  onEndReachedThreshold = 320,
  onScroll,
  scrollEventThrottle,
  style,
  testID,
  ...scrollProps
}: ScreenScrollProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const atEnd = useRef(false);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onScroll?.(event);
      if (!onEndReached) return;

      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distance = contentSize.height - layoutMeasurement.height - contentOffset.y;
      const reached = distance <= onEndReachedThreshold;

      if (reached && !atEnd.current) onEndReached();
      atEnd.current = reached;
    },
    [onScroll, onEndReached, onEndReachedThreshold],
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors[background] }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        testID={testID}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          {
            paddingTop: edges.top ? insets.top : 0,
            paddingBottom: (edges.bottom ? insets.bottom : 0) + bottomInset + theme.spacing.xxl,
            paddingHorizontal: padded ? theme.layout.screenPadding : 0,
            gap: contentGap,
            // Same cap as `Screen`, applied to the content rather than the
            // scroller so the scrollbar stays where the window edge is.
            width: '100%',
            maxWidth: theme.layout.contentMaxWidth,
            alignSelf: 'center',
          },
          style,
        ]}
        onScroll={onEndReached ? handleScroll : onScroll}
        scrollEventThrottle={scrollEventThrottle ?? (onEndReached ? 96 : undefined)}
        {...scrollProps}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export type ScreenHeaderProps = {
  title?: string;
  subtitle?: string;
  /** Show a back chevron. Defaults to true when the router can go back. */
  showBack?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  /** Adds safe-area top padding. Off when inside a `Screen` that already did. */
  withInset?: boolean;
  style?: ViewStyle;
};

/**
 * Lightweight in-content header. We do not use the native stack header for most
 * screens because the design calls for large, left-aligned titles that scroll.
 */
export function ScreenHeader({
  title,
  subtitle,
  showBack = true,
  onBack,
  right,
  withInset = false,
  style,
}: ScreenHeaderProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isRTL, t } = useI18n();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View
      style={[
        {
          paddingTop: withInset ? insets.top + theme.spacing.sm : theme.spacing.sm,
          paddingBottom: theme.spacing.md,
          gap: theme.spacing.sm,
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 40,
          gap: theme.spacing.md,
        }}
      >
        {showBack ? (
          <IconButton
            icon={isRTL ? 'chevron-forward' : 'chevron-back'}
            onPress={handleBack}
            accessibilityLabel={t('common.back')}
            variant="secondary"
            testID="screen-header-back"
          />
        ) : (
          <View style={{ width: 1 }} />
        )}
        {right ?? <View style={{ width: 1 }} />}
      </View>

      {title ? (
        <View style={{ gap: 4 }}>
          <Text variant="title1">{title}</Text>
          {subtitle ? (
            <Text variant="callout" color="textSecondary">
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Sticky footer holding a primary action. Sits above the home indicator and
 * casts a soft upward shadow so content scrolling underneath stays legible.
 */
export function ScreenFooter({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingHorizontal: theme.layout.screenPadding,
        paddingTop: theme.spacing.md,
        paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
        backgroundColor: theme.colors.background,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        gap: theme.spacing.sm,
      }}
    >
      {children}
    </View>
  );
}

/** Small helper for the chevron used in list rows, RTL-aware. */
export function RowChevron() {
  const theme = useTheme();
  const { isRTL } = useI18n();
  return (
    <Ionicons
      name={isRTL ? 'chevron-back' : 'chevron-forward'}
      size={18}
      color={theme.colors.textTertiary}
    />
  );
}
