import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

export default function OnboardingLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    />
  );
}
