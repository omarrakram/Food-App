import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { DrawerButton } from '@/components/navigation/drawer-button';
import { RecipeCardCompact } from '@/components/recipe/recipe-card';
import { Badge } from '@/components/ui/badge';
import { PressScale } from '@/components/ui/press-scale';
import { ScreenScroll } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useExpiringSoon } from '@/features/pantry/hooks';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useLocalSuggestions, useMealRequest } from '@/features/recipes/hooks';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

/** Time-of-day greeting. Local hours, so it matches the user's morning. */
function greetingKey(hour: number) {
  if (hour < 12) return 'home.greetingMorning' as const;
  if (hour < 18) return 'home.greetingAfternoon' as const;
  return 'home.greetingEvening' as const;
}

function PrimaryAction({
  title,
  subtitle,
  icon,
  colors,
  onPress,
  testID,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: readonly [string, string];
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();

  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      haptic="medium"
      scaleTo={0.975}
      style={{ borderRadius: theme.radius.xl, ...theme.elevation(2) }}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: theme.radius.xl,
          padding: theme.spacing.xl,
          gap: theme.spacing.sm,
          minHeight: 132,
          justifyContent: 'space-between',
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: theme.radius.pill,
            backgroundColor: 'rgba(255,255,255,0.22)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={22} color="#FFFFFF" />
        </View>

        <View style={{ gap: 2 }}>
          <Text variant="title3" style={{ color: '#FFFFFF' }}>
            {title}
          </Text>
          <Text variant="footnote" style={{ color: 'rgba(255,255,255,0.88)' }} lines={2}>
            {subtitle}
          </Text>
        </View>
      </LinearGradient>
    </PressScale>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { preferences } = usePreferences();

  const expiring = useExpiringSoon();
  const quickRequest = useMealRequest(
    useMemo(() => ({ mode: 'ingredients' as const, maxMinutes: 30 }), []),
  );
  const quickIdeas = useLocalSuggestions(quickRequest, 8);

  const greeting = t(greetingKey(new Date().getHours()));
  const name = preferences.displayName;
  const expiringCount = expiring.data?.length ?? 0;

  return (
    <ScreenScroll bottomInset={theme.layout.tabBarHeight} contentGap={theme.spacing.xxl}>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
          <DrawerButton testID="home-open-drawer" />
          <View style={{ gap: 2, flex: 1 }}>
            <Text variant="callout" color="textSecondary">
              {name ? `${greeting}, ${name}` : greeting}
            </Text>
            <Text variant="display">{t('home.question')}</Text>
          </View>
        </View>

        <PressScale
          accessibilityRole="search"
          accessibilityLabel={t('home.searchPlaceholder')}
          onPress={() => router.push('/search')}
          haptic="selection"
          scaleTo={0.985}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            minHeight: 50,
            paddingHorizontal: theme.spacing.lg,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Ionicons name="search" size={18} color={theme.colors.textTertiary} />
          <Text variant="callout" color="textTertiary" lines={1} style={{ flex: 1 }}>
            {t('home.searchPlaceholder')}
          </Text>
        </PressScale>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <PrimaryAction
          testID="home-cook-with"
          title={t('home.cookWithWhatIHave')}
          subtitle={t('home.cookWithWhatIHaveSub')}
          icon="restaurant"
          colors={['#F5773E', '#E85D2A'] as const}
          onPress={() => router.push('/cook')}
        />
        <PrimaryAction
          testID="home-budget"
          title={t('home.eatWithinBudget')}
          subtitle={t('home.eatWithinBudgetSub')}
          icon="wallet"
          colors={['#3FBE85', '#217A52'] as const}
          onPress={() => router.push('/budget')}
        />
      </View>

      {expiringCount > 0 ? (
        <PressScale
          testID="home-expiring"
          accessibilityRole="button"
          accessibilityLabel={t('home.expiringSoon')}
          onPress={() => router.push('/pantry')}
          haptic="light"
          scaleTo={0.985}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            padding: theme.spacing.lg,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.warningSoft,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: theme.radius.pill,
              backgroundColor: 'rgba(255,255,255,0.55)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="time" size={20} color={theme.colors.warningSoftText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyMedium" style={{ color: theme.colors.warningSoftText }}>
              {t('home.expiringSoon')}
            </Text>
            <Text variant="footnote" style={{ color: theme.colors.warningSoftText }} lines={2}>
              {t('home.expiringSoonSub', { count: expiringCount })}
            </Text>
          </View>
          <Badge label={t('home.expiringCta')} tone="warning" />
        </PressScale>
      ) : null}

      <Section
        title={t('home.quickIdeas')}
        action={{ label: t('common.seeAll'), onPress: () => router.push('/discover') }}
      >
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.md,
          }}
        >
          {quickIdeas.isLoading
            ? Array.from({ length: 4 }, (_, index) => (
                <View key={index} style={{ width: 160, gap: theme.spacing.sm }}>
                  <Skeleton height={160} radius={theme.radius.md} />
                  <Skeleton width="80%" height={14} />
                </View>
              ))
            : quickIdeas.matches.slice(0, 6).map((match) => (
                <RecipeCardCompact
                  key={match.recipe.id}
                  recipe={match.recipe}
                  width={160}
                  badge={
                    match.missingIngredients.length === 0 && match.requiredCount > 0
                      ? t('results.matchFull')
                      : undefined
                  }
                  onPress={() => router.push(`/recipe/${match.recipe.id}`)}
                  testID={`home-quick-${match.recipe.id}`}
                />
              ))}
        </View>
      </Section>
    </ScreenScroll>
  );
}
