import { Ionicons } from '@expo/vector-icons';
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
import { useExpiringSoon, usePantryItems } from '@/features/pantry/hooks';
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

/**
 * A primary entry point into one of the two core journeys.
 *
 * WHAT THIS REPLACED, because the reason matters more than the markup: two
 * side-by-side diagonal-gradient cards, each with a stock icon inside a
 * translucent white circle and white text over the gradient. That exact
 * component — gradient card, circular icon chip, white title, white subtitle,
 * 26pt radius, drop shadow — is the single most reproduced pattern in
 * generated UI, and it was the first thing anyone saw on opening the app.
 *
 * This version is flat, bordered, and left-aligned to the same grid as
 * everything else on the page. The colour appears once, in a small square
 * icon plate, instead of flooding the whole surface; the type carries the
 * hierarchy; and the row can now hold a real piece of state (`hint`) rather
 * than a second line of marketing copy.
 */
function PrimaryAction({
  title,
  subtitle,
  hint,
  icon,
  accent,
  onPress,
  testID,
}: {
  title: string;
  subtitle: string;
  /** Live state for this journey, e.g. "12 items in your pantry". */
  hint?: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: 'primary' | 'success';
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  const { isRTL } = useI18n();

  const plate =
    accent === 'primary'
      ? { bg: theme.colors.primarySoft, fg: theme.colors.primarySoftText }
      : { bg: theme.colors.successSoft, fg: theme.colors.successSoftText };

  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      haptic="medium"
      scaleTo={0.99}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.lg,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          // Squared, not a circle. A circular icon chip is the other half of
          // the pattern this component exists to get away from.
          borderRadius: theme.radius.sm,
          backgroundColor: plate.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={21} color={plate.fg} />
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="headline">{title}</Text>
        <Text variant="footnote" color="textSecondary" lines={2}>
          {hint ?? subtitle}
        </Text>
      </View>

      <Ionicons
        name={isRTL ? 'chevron-back' : 'chevron-forward'}
        size={18}
        color={theme.colors.textTertiary}
      />
    </PressScale>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { preferences } = usePreferences();

  const pantry = usePantryItems();
  const pantryCount = pantry.data?.length ?? 0;
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
            <Text variant="micro" color="textTertiary" style={{ textTransform: 'uppercase' }}>
              {name ? `${greeting}, ${name}` : greeting}
            </Text>
            <Text variant="title1">{t('home.question')}</Text>
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
            minHeight: 48,
            paddingHorizontal: theme.spacing.md,
            // A search field is an input, and inputs in this system are
            // rectangles. The capsule version read as a button.
            borderRadius: theme.radius.md,
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
          icon="basket-outline"
          accent="primary"
          hint={
            pantryCount > 0
              ? t('home.cookWithPantryCount', { count: pantryCount })
              : undefined
          }
          onPress={() => router.push('/cook')}
        />
        <PrimaryAction
          testID="home-budget"
          title={t('home.eatWithinBudget')}
          subtitle={t('home.eatWithinBudgetSub')}
          icon="wallet-outline"
          accent="success"
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
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.warningSoft,
            borderWidth: 1,
            borderColor: theme.colors.warning,
          }}
        >
          <Ionicons name="time-outline" size={20} color={theme.colors.warningSoftText} />
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
