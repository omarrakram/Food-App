import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from '@/i18n';
import { useTheme } from '@/theme';

import { IconButton } from './button';
import { Text } from './text';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Sticky action area pinned to the bottom of the sheet. */
  footer?: ReactNode;
  /** Cap the sheet height as a fraction of the screen. Default 0.85. */
  maxHeightRatio?: number;
  scrollable?: boolean;
  testID?: string;
};

/**
 * Bottom sheet built on the platform Modal.
 *
 * We deliberately avoid a gesture-driven sheet library here: every sheet in the
 * app is a short, tap-driven form, and the extra dependency would cost more
 * bundle size than the interaction is worth. Swap-in point is this file only.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxHeightRatio = 0.85,
  scrollable = true,
  testID,
}: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const t = useTranslation();

  const Body = scrollable ? ScrollView : View;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          entering={FadeIn.duration(theme.duration.fast)}
          exiting={FadeOut.duration(theme.duration.fast)}
          style={{ ...StyleSheetAbsoluteFill, backgroundColor: theme.colors.scrim }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View
          testID={testID}
          entering={SlideInDown.duration(theme.duration.normal)}
          exiting={SlideOutDown.duration(theme.duration.fast)}
          style={{
            maxHeight: `${maxHeightRatio * 100}%`,
            backgroundColor: theme.colors.background,
            borderTopLeftRadius: theme.radius.xxl,
            borderTopRightRadius: theme.radius.xxl,
            paddingTop: theme.spacing.md,
          }}
        >
          {/* Grabber */}
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.borderStrong,
              marginBottom: theme.spacing.md,
            }}
          />

          {title ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: theme.spacing.md,
                paddingHorizontal: theme.layout.screenPadding,
                paddingBottom: theme.spacing.md,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="title3">{title}</Text>
                {subtitle ? (
                  <Text variant="footnote" color="textSecondary">
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <IconButton
                icon="close"
                onPress={onClose}
                accessibilityLabel={t('common.close')}
                size={34}
                testID={testID ? `${testID}-close` : undefined}
              />
            </View>
          ) : null}

          <Body
            style={scrollable ? { flexShrink: 1 } : undefined}
            contentContainerStyle={
              scrollable
                ? {
                    paddingHorizontal: theme.layout.screenPadding,
                    paddingBottom: footer ? theme.spacing.md : insets.bottom + theme.spacing.xl,
                  }
                : undefined
            }
            {...(scrollable ? { keyboardShouldPersistTaps: 'handled' as const } : {})}
          >
            {scrollable ? (
              children
            ) : (
              <View
                style={{
                  paddingHorizontal: theme.layout.screenPadding,
                  paddingBottom: footer ? theme.spacing.md : insets.bottom + theme.spacing.xl,
                }}
              >
                {children}
              </View>
            )}
          </Body>

          {footer ? (
            <View
              style={{
                paddingHorizontal: theme.layout.screenPadding,
                paddingTop: theme.spacing.md,
                paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
                gap: theme.spacing.sm,
              }}
            >
              {footer}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const StyleSheetAbsoluteFill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};
