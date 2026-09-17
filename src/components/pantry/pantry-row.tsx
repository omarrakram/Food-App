import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Badge } from '@/components/ui/badge';
import { PressScale, usePressFeedback } from '@/components/ui/press-scale';
import { Text } from '@/components/ui/text';
import { daysUntil, freshnessOf } from '@/features/ingredients/freshness';
import { useIngredientName } from '@/features/ingredients/display';
import { formatQuantity } from '@/features/pricing/units';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import type { PantryItem } from '@/types/domain';

const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  protein: 'nutrition-outline',
  vegetables: 'leaf-outline',
  fruit: 'nutrition-outline',
  dairy: 'water-outline',
  carbs: 'pizza-outline',
  spices: 'flask-outline',
  sauces: 'beaker-outline',
  frozen: 'snow-outline',
  bakery: 'cafe-outline',
  pantry: 'file-tray-outline',
  other: 'ellipse-outline',
};

/** Human phrase for an expiry date: "Today", "Tomorrow", "In 4 days". */
export function useExpiryLabel() {
  const { t } = useI18n();
  return (expiresOn: string | null) => {
    if (!expiresOn) return null;
    const days = daysUntil(expiresOn);
    if (days === null) return null;
    // Four states, each readable on its own without the row for context:
    // "Expired", "Expires today", "Expires tomorrow", "N days left".
    if (days < 0) return t('pantry.expiredDaysAgo', { count: Math.abs(days) });
    if (days === 0) return t('pantry.expiresToday');
    if (days === 1) return t('pantry.expiresTomorrow');
    return t('pantry.expiresInDays', { count: days });
  };
}

export function PantryRow({
  item,
  onPress,
  onRemove,
  testID,
}: {
  item: PantryItem;
  onPress: () => void;
  onRemove: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const { t, formatNumber } = useI18n();
  const displayName = useIngredientName();
  const expiryLabel = useExpiryLabel();

  const status = freshnessOf(item.expiresOn);
  const isExpired = status === 'expired';
  const isUrgent = status === 'expiring_soon' || status === 'expires_today';

  const quantityLabel = formatQuantity(item.quantity, item.unit, { t, formatNumber });
  const name = displayName(item.ingredientName);
  /*
    A staple has no quantity ON PURPOSE — it counts as available without one —
    so labelling it "not set" would report a deliberate choice as an omission.
    Anything else with no quantity genuinely has one missing, and saying so is
    more use than a blank space the reader has to interpret.
  */
  const quantityText = quantityLabel || (item.isStaple ? '' : t('pantry.quantityUnset'));
  const press = usePressFeedback(0.99);

  return (
    /*
      THE ROW IS NOT A BUTTON. It used to be a `PressScale` with
      `accessibilityRole="button"` containing the remove control, which is a
      button too — `<button>` inside `<button>` on web, invalid and ambiguous
      to a screen reader. Opening the item and deleting it are two different
      actions and must be two sibling controls.

      The press target takes the row's whole width bar the remove control, so
      tapping anywhere on the item still opens it, and the container carries
      the press scale so the row still responds as one piece.
    */
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingVertical: theme.spacing.md,
        },
        press.style,
      ]}
    >
      <PressScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${name}${quantityText ? `, ${quantityText}` : ''}`}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        haptic="selection"
        // The container scales; a second scale here would compound.
        scaleTo={1}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: theme.radius.md,
            backgroundColor: isExpired
              ? theme.colors.dangerSoft
              : isUrgent
                ? theme.colors.warningSoft
                : theme.colors.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={CATEGORY_ICON[item.category] ?? 'ellipse-outline'}
            size={20}
            color={
              isExpired
                ? theme.colors.danger
                : isUrgent
                  ? theme.colors.warningSoftText
                  : theme.colors.textSecondary
            }
          />
        </View>

        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Text variant="bodyMedium" lines={1} style={{ flexShrink: 1 }}>
              {name}
            </Text>
            {item.isStaple ? <Badge label={t('pantry.staple')} tone="neutral" /> : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            {quantityText ? (
              <Text variant="footnote" color="textSecondary" testID="pantry-row-quantity">
                {quantityText}
              </Text>
            ) : null}
            {item.expiresOn ? (
              <Text
                variant="footnote"
                color={isExpired ? 'danger' : isUrgent ? 'warningSoftText' : 'textTertiary'}
              >
                {isExpired ? t('pantry.expired') : expiryLabel(item.expiresOn)}
              </Text>
            ) : null}
          </View>
        </View>
      </PressScale>

      <PressScale
        accessibilityRole="button"
        accessibilityLabel={t('common.remove')}
        onPress={onRemove}
        hitSlop={10}
        haptic="light"
        scaleTo={0.85}
        testID={testID ? `${testID}-remove` : undefined}
      >
        <Ionicons name="close-circle" size={22} color={theme.colors.textTertiary} />
      </PressScale>
    </Animated.View>
  );
}
