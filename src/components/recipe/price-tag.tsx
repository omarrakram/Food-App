import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View, type ViewStyle } from 'react-native';

import { PressScale } from '@/components/ui/press-scale';
import { Sheet } from '@/components/ui/sheet';
import { Text, type TextColor } from '@/components/ui/text';
import { isPriceDataStale, PRICE_STALE_AFTER_DAYS } from '@/features/pricing/price-book';
import { useI18n } from '@/i18n';
import { formatPricedAmount } from '@/lib/format/money';
import { useTheme } from '@/theme';
import type { PricedAmount } from '@/types/domain';

/**
 * The ONLY component allowed to render a price.
 *
 * PRODUCT RULE (non-negotiable): an estimated price must never be presented as
 * a real one. This component prefixes estimates with `~`, labels them, and
 * offers a tap-through explainer. Routing every price through here means the
 * rule cannot be forgotten at an individual call site.
 */

export type PriceTagProps = {
  priced: PricedAmount | null;
  size?: 'sm' | 'md' | 'lg';
  color?: TextColor;
  /** Show the "Estimated" word, not just the `~`. Default true for md/lg. */
  showLabel?: boolean;
  /** Allow tapping to open the explainer sheet. Default true for estimates. */
  explainable?: boolean;
  style?: ViewStyle;
  testID?: string;
};

export function PriceTag({
  priced,
  size = 'md',
  color,
  showLabel,
  explainable,
  style,
  testID,
}: PriceTagProps) {
  const theme = useTheme();
  const { t, language } = useI18n();
  const [explainerOpen, setExplainerOpen] = useState(false);

  // No figure at all, or a figure we could not assemble from any real data.
  // Either way the honest answer is words, not a number: "~0 EGP" reads as
  // free, and that is how a salmon fillet ended up looking like it cost
  // nothing.
  if (!priced || priced.completeness === 'unavailable') {
    return (
      <Text variant="footnote" color="textTertiary" style={style} testID={testID}>
        {t('price.unavailable')}
      </Text>
    );
  }

  const locale = language === 'ar' ? 'ar-EG' : 'en-US';
  const { text, isEstimate } = formatPricedAmount(priced, { locale });

  const variant = size === 'lg' ? 'title3' : size === 'md' ? 'bodyMedium' : 'caption';
  const withLabel = showLabel ?? size !== 'sm';
  const canExplain = (explainable ?? isEstimate) && isEstimate;

  const isPartial = priced.completeness === 'partial';
  const unpriced = priced.unpricedCount ?? 0;
  const partialNote =
    unpriced === 1 ? t('price.partialOne') : t('price.partialOther', { count: unpriced });
  const isStale = priced.lastUpdated ? isPriceDataStale(priced.lastUpdated) : false;

  const row = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text variant={variant} color={color ?? 'text'} testID={testID}>
        {text}
      </Text>
      {/* A partial total is a floor, so it says what it covers rather than
          passing itself off as the price of the dish. */}
      {isPartial && withLabel ? (
        <Text variant="micro" color="textTertiary">
          {t('price.pricedItemsOnly')}
        </Text>
      ) : null}
      {withLabel && isEstimate && !isPartial ? (
        <Text variant="micro" color="textTertiary">
          {t('common.estimated')}
        </Text>
      ) : null}
      {canExplain ? (
        <Ionicons
          name={isPartial || isStale ? 'alert-circle-outline' : 'information-circle-outline'}
          size={13}
          color={isPartial ? theme.colors.warningSoftText : theme.colors.textTertiary}
        />
      ) : null}
      {!isEstimate && priced.storeName ? (
        <Text variant="micro" color="successSoftText">
          {priced.storeName}
        </Text>
      ) : null}
    </View>
  );

  const content =
    isPartial && withLabel ? (
      <View style={{ gap: 2 }}>
        {row}
        <Text variant="micro" color="warningSoftText" testID={testID ? `${testID}-partial` : undefined}>
          {partialNote}
        </Text>
      </View>
    ) : (
      row
    );

  if (!canExplain) {
    return <View style={style}>{content}</View>;
  }

  return (
    <>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`${t('price.estimatedLabel')}: ${text}`}
        accessibilityHint={t('price.estimateExplainerTitle')}
        onPress={() => setExplainerOpen(true)}
        hitSlop={8}
        scaleTo={0.95}
        style={style}
      >
        {content}
      </PressScale>

      <Sheet
        visible={explainerOpen}
        onClose={() => setExplainerOpen(false)}
        title={t('price.estimateExplainerTitle')}
        scrollable={false}
      >
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="body" color="textSecondary">
            {t('price.estimateExplainerBody')}
          </Text>
          {isPartial ? (
            <Text variant="body" color="warningSoftText">
              {t('price.incompleteExplainer')}
            </Text>
          ) : null}
          {priced.lastUpdated ? (
            <Text variant="footnote" color="textTertiary">
              {t('price.dataAge', { date: priced.lastUpdated })}
            </Text>
          ) : null}
          {isStale ? (
            <Text variant="footnote" color="warningSoftText">
              {t('price.staleWarning', { months: Math.floor(PRICE_STALE_AFTER_DAYS / 30) })}
            </Text>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
