import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import { DrawerButton } from '@/components/navigation/drawer-button';
import { useRowDirection } from '@/components/ui/direction';
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
 * THE product proposition, given the weight it earns.
 *
 * Both journeys used to be the same component at the same size, which made the
 * screen read as a settings list: two identical rows, equal emphasis, no view
 * about what this app is for. "Cook with what I have" is the reason the product
 * exists; "Eat within my budget" is a second way in. They are now different
 * components, and the difference is structural rather than decorative — a
 * tinted field, a bigger plate, a heading rather than a row label, and a stated
 * action — so the hierarchy survives without a gradient or a shadow.
 */
function HeroAction({
  title,
  subtitle,
  hint,
  cta,
  icon,
  onPress,
  testID,
}: {
  title: string;
  subtitle: string;
  /** Live state for this journey, e.g. "12 ingredients in your kitchen". */
  hint?: string;
  cta: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  const { isRTL } = useI18n();
  const row = useRowDirection();

  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      haptic="medium"
      scaleTo={0.99}
      style={{
        padding: theme.spacing.xl,
        gap: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.primarySoft,
        borderWidth: 1,
        borderColor: theme.colors.primary,
      }}
    >
      <View style={{ flexDirection: row, alignItems: 'center', gap: theme.spacing.lg }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={26} color={theme.colors.textOnPrimary} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="title2" style={{ color: theme.colors.primarySoftText }}>
            {title}
          </Text>
          <Text variant="footnote" style={{ color: theme.colors.primarySoftText }} lines={2}>
            {hint ?? subtitle}
          </Text>
        </View>
      </View>

      {/* Named, not implied. A card that states its action converts better than
          a card that merely looks tappable. */}
      <View style={{ flexDirection: row, alignItems: 'center', gap: theme.spacing.xs }}>
        <Text variant="subhead" style={{ color: theme.colors.primary }}>
          {cta}
        </Text>
        <Ionicons
          name={isRTL ? 'arrow-back' : 'arrow-forward'}
          size={16}
          color={theme.colors.primary}
        />
      </View>
    </PressScale>
  );
}

/** The second way in. Clearly reachable, clearly not the headline. */
function SecondaryAction({
  title,
  subtitle,
  icon,
  onPress,
  testID,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  const { isRTL } = useI18n();
  const row = useRowDirection();

  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      haptic="light"
      scaleTo={0.99}
      style={{
        flexDirection: row,
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.lg,
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Ionicons name={icon} size={20} color={theme.colors.textSecondary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline">{title}</Text>
        {/* Two lines, not one. At one line this truncated mid-word — "…we will
            find m…" — which reads as a layout accident rather than a summary. */}
        <Text variant="footnote" color="textSecondary" lines={2}>
          {subtitle}
        </Text>
      </View>
      <Ionicons
        name={isRTL ? 'chevron-back' : 'chevron-forward'}
        size={17}
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
  const row = useRowDirection();
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
        <View style={{ flexDirection: row, alignItems: 'flex-start', gap: theme.spacing.md }}>
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
            flexDirection: row,
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
        <HeroAction
          testID="home-cook-with"
          title={t('home.cookWithWhatIHave')}
          subtitle={t('home.cookWithWhatIHaveSub')}
          cta={t('home.cookWithCta')}
          icon="basket-outline"
          hint={
            pantryCount > 0 ? t('home.cookWithPantryCount', { count: pantryCount }) : undefined
          }
          onPress={() => router.push('/cook')}
        />
        <SecondaryAction
          testID="home-budget"
          title={t('home.eatWithinBudget')}
          subtitle={t('home.eatWithinBudgetSub')}
          icon="wallet-outline"
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
            flexDirection: row,
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
        {/*
          A rail, not a wrapping grid. The grid stacked into three rows of two
          on a phone, so the last thing on Home was a long column of small
          cards and the screen never ended. A rail keeps the section to one
          screen-height, and a partly visible next card is what tells a reader
          there is more — which is the job "See all" was doing alone.
        */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.spacing.md, paddingRight: theme.spacing.xl }}
        >
          {quickIdeas.isLoading
            ? Array.from({ length: 4 }, (_, index) => (
                <View key={index} style={{ width: 150, gap: theme.spacing.sm }}>
                  <Skeleton height={150} radius={theme.radius.md} />
                  <Skeleton width="80%" height={14} />
                </View>
              ))
            : quickIdeas.matches.slice(0, 8).map((match) => (
                <RecipeCardCompact
                  key={match.recipe.id}
                  recipe={match.recipe}
                  width={150}
                  badge={
                    match.missingIngredients.length === 0 && match.requiredCount > 0
                      ? t('results.matchFull')
                      : undefined
                  }
                  onPress={() => router.push(`/recipe/${match.recipe.id}`)}
                  testID={`home-quick-${match.recipe.id}`}
                />
              ))}
        </ScrollView>
      </Section>
    </ScreenScroll>
  );
}
