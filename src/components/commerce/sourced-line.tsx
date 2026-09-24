import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { PriceTag } from '@/components/recipe/price-tag';
import { Text } from '@/components/ui/text';
import type { SourcedLine, SourcingStatus } from '@/features/commerce/ports';
import { useI18n } from '@/i18n';
import type { TranslationKey } from '@/i18n/locales/en';
import { useTheme } from '@/theme';
import type { PricedAmount } from '@/types/domain';

/**
 * What the shop can do about one missing ingredient.
 *
 * Sits UNDER its recipe line, indented, deliberately quieter than the
 * ingredient above it. The page is a recipe; the product is a service the
 * recipe offers, not the reason anybody opened the screen.
 *
 * FIVE STATES, FIVE SENTENCES. Collapsing them into "unavailable" throws away
 * the only information the cook can act on: an out-of-stock item might be
 * there tomorrow, an unmapped one never will be, and one excluded for an
 * allergy must not quietly turn into a suggestion to buy something else.
 */

type Tone = 'ok' | 'attention' | 'muted';

type Copy = {
  title: TranslationKey;
  body: TranslationKey;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
};

const STATUS_COPY: Record<Exclude<SourcingStatus, 'matched'>, Copy> = {
  needs_confirmation: {
    title: 'commerce.statusNeedsConfirmation',
    body: 'commerce.statusNeedsConfirmationBody',
    icon: 'help-circle-outline',
    tone: 'attention',
  },
  no_purchasable_match: {
    title: 'commerce.statusNoPurchasable',
    body: 'commerce.statusNoPurchasableBody',
    icon: 'remove-circle-outline',
    tone: 'muted',
  },
  no_eligible_match: {
    title: 'commerce.statusNoEligible',
    body: 'commerce.statusNoEligibleBody',
    icon: 'alert-circle-outline',
    tone: 'attention',
  },
  unmapped: {
    title: 'commerce.statusUnmapped',
    body: 'commerce.statusUnmappedBody',
    icon: 'ellipse-outline',
    tone: 'muted',
  },
};

/** An ingredient the sourcer was never even asked about. */
const UNSOURCEABLE_COPY: Copy = {
  title: 'commerce.unsourceable',
  body: 'commerce.unsourceableBody',
  icon: 'ellipse-outline',
  tone: 'muted',
};

function useIndent() {
  const theme = useTheme();
  return { paddingStart: theme.spacing.xl, gap: 2 } as const;
}

function StatusNote({ copy, testID }: { copy: Copy; testID?: string }) {
  const theme = useTheme();
  const { t } = useI18n();
  const indent = useIndent();
  const colour =
    copy.tone === 'attention' ? theme.colors.warningSoftText : theme.colors.textTertiary;

  return (
    <View style={indent} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        <Ionicons name={copy.icon} size={13} color={colour} />
        <Text variant="footnote" style={{ color: colour }}>
          {t(copy.title)}
        </Text>
      </View>
      <Text variant="caption" color="textTertiary">
        {t(copy.body)}
      </Text>
    </View>
  );
}

/**
 * An ingredient with no canonical slug, so no shop can be asked about it.
 *
 * Distinct from `unmapped`, which means this shop does not carry it. Here the
 * app itself cannot name the thing, and buying whatever a fuzzy name search
 * returns is exactly the failure the canonical layer exists to prevent.
 */
export function UnsourceableLineRow({ testID }: { testID?: string }) {
  return <StatusNote copy={UNSOURCEABLE_COPY} testID={testID} />;
}

export type SourcedLineRowProps = {
  line: SourcedLine;
  merchantName: string;
  testID?: string;
};

export function SourcedLineRow({ line, merchantName, testID }: SourcedLineRowProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const indent = useIndent();

  if (line.status !== 'matched' || !line.chosen) {
    return (
      <StatusNote
        copy={STATUS_COPY[line.status as Exclude<SourcingStatus, 'matched'>]}
        testID={testID}
      />
    );
  }

  const chosen = line.chosen;
  const packs = chosen.packsNeeded;

  /*
    A PRODUCT WE CANNOT COUNT IS NOT A PRICE.

    `packsNeeded` is null when the recipe asked for a measured amount and the
    merchant never published a pack size — so we know WHICH product and not
    HOW MUCH of it. Printing one pack's price here would be a number the cook
    could plan around and we could not stand behind, and `addableLines` keeps
    the same line out of the cart for the same reason.
  */
  if (packs === null) {
    return (
      <View style={indent} testID={testID}>
        <Text variant="footnote" numberOfLines={2}>
          {chosen.product.name}
        </Text>
        <Text variant="caption" color="textTertiary">
          {t('commerce.packSizeUnknown')}
        </Text>
      </View>
    );
  }

  // A merchant price is LIVE by construction. `PriceTag` is the only component
  // allowed to render money, and it reads `source` to decide whether to say
  // "estimated" — so mislabelling this would put a `~` on a real shelf price.
  const priced: PricedAmount = {
    money: {
      amountMinor: chosen.product.price.amountMinor * packs,
      currency: chosen.product.price.currency,
    },
    source: 'live',
    storeName: merchantName,
    completeness: 'complete',
  };

  return (
    <View style={indent} testID={testID}>
      <Text variant="footnote" numberOfLines={2}>
        {chosen.product.name}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          flexWrap: 'wrap',
        }}
      >
        <Text variant="caption" color="textTertiary">
          {t('commerce.packs', { count: packs })}
        </Text>
        <PriceTag priced={priced} size="sm" showLabel={false} explainable={false} />
      </View>
    </View>
  );
}
