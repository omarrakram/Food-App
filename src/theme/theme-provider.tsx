import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { getItem, setItem, StorageKeys } from '@/lib/storage';

import { elevation as elevationFor, palettes, type ColorScheme, type Palette } from './palette';
import { duration, hitSize, layout, radius, spacing, typography, zIndex } from './tokens';

export type ColorSchemePreference = 'system' | 'light' | 'dark';

export type Theme = {
  scheme: ColorScheme;
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  duration: typeof duration;
  layout: typeof layout;
  zIndex: typeof zIndex;
  hitSize: typeof hitSize;
  /** `theme.elevation(2)` — already bound to the active scheme. */
  elevation: (level: 0 | 1 | 2 | 3) => ReturnType<typeof elevationFor>;
};

type ThemeContextValue = {
  theme: Theme;
  preference: ColorSchemePreference;
  setPreference: (next: ColorSchemePreference) => void;
  /** False until the persisted preference has been read from disk. */
  isHydrated: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function buildTheme(scheme: ColorScheme): Theme {
  const colors = palettes[scheme];
  return {
    scheme,
    colors,
    spacing,
    radius,
    typography,
    duration,
    layout,
    zIndex,
    hitSize,
    elevation: (level) => elevationFor(scheme, level),
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ColorSchemePreference>('system');
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getItem<ColorSchemePreference>(StorageKeys.colorSchemePreference);
      if (cancelled) return;
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
      }
      setIsHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ColorSchemePreference) => {
    setPreferenceState(next);
    void setItem(StorageKeys.colorSchemePreference, next);
  }, []);

  const scheme: ColorScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: buildTheme(scheme), preference, setPreference, isHydrated }),
    [scheme, preference, setPreference, isHydrated],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = use(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeContext must be used inside <ThemeProvider>');
  }
  return ctx;
}

/** The hook every component uses: `const t = useTheme();` */
export function useTheme(): Theme {
  return useThemeContext().theme;
}
