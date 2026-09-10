import { Ionicons } from '@expo/vector-icons';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { PressScale } from './press-scale';
import { Text } from './text';

export type ToastTone = 'neutral' | 'success' | 'danger' | 'warning';

export type ToastOptions = {
  message: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. Default 2800. */
  duration?: number;
  action?: { label: string; onPress: () => void };
};

type ToastContextValue = {
  show: (options: ToastOptions) => void;
  hide: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Lightweight top-anchored toast.
 *
 * Confirmations ("Added to your shopping list") use this rather than a native
 * Alert so they never interrupt a flow.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const show = useCallback(
    (options: ToastOptions) => {
      clearTimer();
      setToast(options);
      timerRef.current = setTimeout(() => setToast(null), options.duration ?? 2800);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => ({ show, hide }), [show, hide]);

  const tones: Record<ToastTone, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> =
    {
      neutral: {
        bg: theme.colors.surface,
        fg: theme.colors.text,
        icon: 'information-circle',
      },
      success: {
        bg: theme.colors.successSoft,
        fg: theme.colors.successSoftText,
        icon: 'checkmark-circle',
      },
      danger: { bg: theme.colors.dangerSoft, fg: theme.colors.dangerSoftText, icon: 'alert-circle' },
      warning: {
        bg: theme.colors.warningSoft,
        fg: theme.colors.warningSoftText,
        icon: 'warning',
      },
    };

  const tone = tones[toast?.tone ?? 'neutral'];

  return (
    <ToastContext value={value}>
      {children}
      {toast ? (
        <Animated.View
          entering={FadeInUp.duration(theme.duration.fast)}
          exiting={FadeOutUp.duration(theme.duration.fast)}
          pointerEvents="box-none"
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            top: insets.top + theme.spacing.sm,
            left: theme.spacing.lg,
            right: theme.spacing.lg,
            zIndex: theme.zIndex.toast,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              backgroundColor: tone.bg,
              borderRadius: theme.radius.lg,
              paddingVertical: theme.spacing.md,
              paddingHorizontal: theme.spacing.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
              ...theme.elevation(2),
            }}
          >
            <Ionicons name={tone.icon} size={19} color={tone.fg} />
            <Text variant="subhead" style={{ flex: 1, color: tone.fg }} lines={3}>
              {toast.message}
            </Text>
            {toast.action ? (
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={toast.action.label}
                onPress={() => {
                  toast.action?.onPress();
                  hide();
                }}
                hitSlop={8}
              >
                <Text variant="subhead" color="primary">
                  {toast.action.label}
                </Text>
              </PressScale>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext>
  );
}

export function useToast(): ToastContextValue {
  const ctx = use(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}
