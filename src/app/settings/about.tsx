import { View } from 'react-native';

import { ListGroup, ListRow } from '@/components/ui/list-row';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { INGREDIENT_CATALOGUE } from '@/features/ingredients/catalogue';
import { RECIPE_FIXTURES } from '@/features/recipes/fixtures';
import { useI18n } from '@/i18n';
import { env } from '@/lib/config/env';
import { useTheme } from '@/theme';

/**
 * About, and what is actually switched on.
 *
 * The second half of this screen is the interesting one. This app runs
 * completely on local data when no backend is configured, and that is a
 * legitimate way to use it — but a user who cannot see WHY sign-in is missing,
 * or why their pantry is not syncing, will reasonably conclude the app is
 * broken. So it says, plainly, which capabilities are live.
 *
 * It reports what `env` actually resolved, not what someone intended. A status
 * screen that lies is worse than no status screen.
 */
export default function AboutScreen() {
  const theme = useTheme();
  const { t, formatNumber, formatDate } = useI18n();
  const { isEnabled: authEnabled } = useAuth();

  return (
    <ScreenScroll bottomInset={theme.spacing.xxl} contentGap={theme.spacing.lg}>
      <ScreenHeader title={t('profile.about')} />

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="title2">{t('common.appName')}</Text>
        <Text variant="body" color="textSecondary">
          {t('about.tagline')}
        </Text>
        <Text variant="footnote" color="textTertiary">
          {t('profile.version', { version: env.appVersion })}
        </Text>
      </View>

      <Section title={t('about.whatIsOn')} subtitle={t('about.whatIsOnHint')}>
        <ListGroup>
          <ListRow
            title={t('about.recipes')}
            icon="restaurant-outline"
            iconTone="success"
            value={formatNumber(RECIPE_FIXTURES.length)}
          />
          <ListRow
            title={t('about.offline')}
            icon="cloud-offline-outline"
            iconTone="success"
            value={t('about.on')}
          />
          <ListRow
            title={t('about.accounts')}
            icon="person-outline"
            iconTone={authEnabled ? 'success' : 'neutral'}
            value={authEnabled ? t('about.on') : t('about.needsBackend')}
          />
          <ListRow
            title={t('about.sync')}
            icon="sync-outline"
            iconTone={authEnabled ? 'success' : 'neutral'}
            value={authEnabled ? t('about.on') : t('about.needsBackend')}
          />
          <ListRow
            title={t('about.aiSuggestions')}
            icon="sparkles-outline"
            iconTone={env.hasSupabase ? 'success' : 'neutral'}
            value={env.hasSupabase ? t('about.on') : t('about.needsBackend')}
          />
        </ListGroup>
      </Section>

      {/*
        Build identity. Shown outside production because the question it
        answers only arises there: a bug reported against a hosted preview is
        unanswerable until you know which commit the tester was looking at,
        and "still broken" versus "three commits behind" look identical from
        the outside.
      */}
      {env.isProduction ? null : (
        <Section title={t('about.developer')} subtitle={t('about.developerHint')}>
          <ListGroup>
            <ListRow
              title={t('about.commit')}
              icon="git-commit-outline"
              value={env.buildCommit ?? t('about.unknown')}
              testID="about-commit"
            />
            <ListRow
              title={t('about.builtAt')}
              icon="time-outline"
              value={
                env.builtAt
                  ? formatDate(env.builtAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : t('about.unknown')
              }
              testID="about-built-at"
            />
            <ListRow
              title={t('about.recipeCount')}
              icon="book-outline"
              value={formatNumber(RECIPE_FIXTURES.length)}
              testID="about-recipe-count"
            />
            <ListRow
              title={t('about.ingredientCount')}
              icon="leaf-outline"
              value={formatNumber(INGREDIENT_CATALOGUE.length)}
              testID="about-ingredient-count"
            />
          </ListGroup>
        </Section>
      )}

      <Text variant="micro" color="textTertiary">
        {t('about.estimatesNotice')}
      </Text>
    </ScreenScroll>
  );
}
