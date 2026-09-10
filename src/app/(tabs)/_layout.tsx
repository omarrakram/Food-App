import { Tabs } from 'expo-router/js-tabs';

import { AppTabBar } from '@/components/navigation/tab-bar';
import { useTranslation } from '@/i18n';

export default function TabsLayout() {
  const t = useTranslation();

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false, freezeOnBlur: true }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="discover" options={{ title: t('tabs.discover') }} />
      <Tabs.Screen name="pantry" options={{ title: t('tabs.pantry') }} />
      <Tabs.Screen name="saved" options={{ title: t('tabs.saved') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
