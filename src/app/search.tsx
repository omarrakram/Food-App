import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { ResultsView } from '@/components/recipe/results-view';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useMealRequest, useMealSuggestions } from '@/features/recipes/hooks';
import {
  applyInterpretation,
  describeInterpretation,
  interpretQuery,
} from '@/features/search/interpret';
import { useI18n } from '@/i18n';
import { formatMoney, money } from '@/lib/format/money';
import { getItem, setItem, StorageKeys } from '@/lib/storage';
import { useTheme } from '@/theme';

/**
 * Seeded examples so an empty search screen still teaches what it can do.
 *
 * Translated rather than transliterated, and the Arabic versions are written
 * against the patterns `interpretQuery` actually recognises — an example chip
 * that the parser cannot read teaches the user the wrong thing.
 */
const EXAMPLE_KEYS = [
  'search.example1',
  'search.example2',
  'search.example3',
  'search.example4',
  'search.example5',
] as const;

const MAX_RECENT = 6;

export default function SearchScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { preferences } = usePreferences();

  const [draft, setDraft] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getItem<string[]>(StorageKeys.recentSearches);
      if (!cancelled && stored) setRecent(stored);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const baseRequest = useMealRequest(useMemo(() => ({ mode: 'search' as const }), []));

  const interpretation = useMemo(
    () => (submitted ? interpretQuery(submitted, preferences.currency) : null),
    [submitted, preferences.currency],
  );

  const request = useMemo(
    () =>
      interpretation && submitted
        ? applyInterpretation(baseRequest, interpretation, submitted)
        : baseRequest,
    [baseRequest, interpretation, submitted],
  );

  const { matches, isLoading, error, isGenerating, generationError, refetch } =
    useMealSuggestions(request);


  const chips = useMemo(() => {
    if (!interpretation) return [];
    return describeInterpretation(interpretation, {
      money: (minor) =>
        `≤ ${formatMoney(money(minor, preferences.currency), { locale })}`,
      minutes: (count) => `≤ ${t('common.min', { count })}`,
      servings: (count) => t('common.people', { count }),
      meal: (meal) => t(`meal.${meal}` as const),
      cuisine: (cuisine) => t(`cuisine.${cuisine}` as const),
      highProtein: t('budget.highProtein'),
      without: (ingredient) => t('search.without', { ingredient }),
    });
  }, [interpretation, preferences.currency, locale, t]);

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setDraft(trimmed);
    setSubmitted(trimmed);
    setRecent((current) => {
      const next = [trimmed, ...current.filter((entry) => entry !== trimmed)].slice(0, MAX_RECENT);
      void setItem(StorageKeys.recentSearches, next);
      return next;
    });
  };

  return (
    <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
      <ScreenHeader title={t('search.title')} />

      <Input
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={() => submit(draft)}
        placeholder={t('search.placeholder')}
        leadingIcon="search"
        trailingIcon={draft ? 'close-circle' : undefined}
        onTrailingIconPress={() => {
          setDraft('');
          setSubmitted('');
        }}
        returnKeyType="search"
        autoFocus
        autoCapitalize="none"
        testID="search-input"
      />

      {!submitted ? (
        <>
          {recent.length > 0 ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="caption" color="textTertiary">
                {t('search.recent')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {recent.map((entry) => (
                  <Chip key={entry} label={entry} size="sm" onPress={() => submit(entry)} />
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="caption" color="textTertiary">
              {t('search.examples')}
            </Text>
            <View style={{ gap: theme.spacing.sm }}>
              {EXAMPLE_KEYS.map((key) => (
                <Chip
                  key={key}
                  label={t(key)}
                  icon="sparkles-outline"
                  onPress={() => submit(t(key))}
                  style={{ alignSelf: 'flex-start' }}
                  testID={`search-example-${key.slice(-1)}`}
                />
              ))}
            </View>
          </View>
        </>
      ) : (
        <>
          {chips.length > 0 ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="caption" color="textTertiary">
                {t('search.understood')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                {chips.map((chip) => (
                  <Badge key={chip} label={chip} tone="primary" size="md" />
                ))}
              </View>
            </View>
          ) : null}

          <ResultsView
            request={request}
            matches={matches}
            isLoading={isLoading}
            error={error}
            isGenerating={isGenerating}
            generationError={generationError}
            onRetry={refetch}
            onAdjust={() => setSubmitted('')}
          />
        </>
      )}
    </ScreenScroll>
  );
}
