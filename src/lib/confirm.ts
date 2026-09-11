import { Alert, Platform } from 'react-native';

/**
 * A confirmation the user can actually answer, on every platform.
 *
 * `Alert.alert` is a no-op in react-native-web: it neither renders nor throws.
 * Every confirmation in the app was therefore silently dead on the web build —
 * pressing "exit" in cooking mode after making progress did nothing at all,
 * leaving no way out of the screen, and sign-out, account deletion and
 * clear-history behaved the same way.
 *
 * Native keeps the platform dialog it always had; web gets the browser's own
 * modal confirm, which is the one blocking prompt available without building a
 * dialog system for a handful of call sites.
 */
export type ConfirmOptions = {
  title: string;
  message?: string;
  /** Label for the affirmative action. Defaults to the platform's "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the affirmative action as destructive on iOS. */
  destructive?: boolean;
};

export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
}: ConfirmOptions): Promise<boolean> {
  if (Platform.OS === 'web') {
    // `window.confirm` returns synchronously; the promise keeps one shape for
    // callers so nothing has to branch on platform.
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(text)
        : // Server-side rendering has no window. Refusing is the safe answer:
          // a confirmation exists to stop something irreversible.
          false,
    );
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel ?? 'OK',
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
