import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list-row';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { areaByKey, areaDisplayName } from '@/features/commerce/delivery-areas';
import { useAddresses, useDeliveryAreas } from '@/features/commerce/hooks';
import { useI18n } from '@/i18n';
import { presentError } from '@/lib/errors';
import { toWesternNumerals } from '@/lib/format/numerals';
import { useTheme } from '@/theme';
import type { DeliveryAddress, DeliveryArea } from '@/types/commerce';

/**
 * Saved delivery addresses.
 *
 * A separate screen from checkout on purpose: choosing where an order goes and
 * maintaining the list of places you might send one are different jobs, and
 * putting a delete button inside a payment flow is how somebody removes the
 * address they were about to use.
 */

/** One line of the address, in reading order, for the row's subtitle. */
function summarise(
  address: DeliveryAddress,
  areas: readonly DeliveryArea[],
  language: 'en' | 'ar',
): string {
  const area = areaByKey(areas, address.areaKey);
  return toWesternNumerals(
    [address.street, address.building, area ? areaDisplayName(area, language) : null]
      .filter(Boolean)
      .join(' · '),
  );
}

export default function AddressesScreen() {
  const theme = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();

  const addresses = useAddresses();
  const areas = useDeliveryAreas();

  const header = <ScreenHeader title={t('address.title')} showBack />;

  return (
    <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
      {header}

      {addresses.isLoading ? (
        <SkeletonList count={3} variant="row" />
      ) : addresses.isError ? (
        <ErrorState
          title={t(presentError(addresses.error).titleKey)}
          body={t(presentError(addresses.error).bodyKey)}
          action={{ label: t('common.retry'), onPress: () => void addresses.refetch() }}
        />
      ) : (addresses.data ?? []).length === 0 ? (
        <EmptyState
          icon="location-outline"
          title={t('address.none')}
          body={t('address.noneBody')}
          action={{ label: t('address.add'), onPress: () => router.push('/addresses/form') }}
          testID="addresses-empty"
        />
      ) : (
        <View style={{ gap: theme.spacing.lg }} testID="addresses-list">
          <ListGroup>
            {(addresses.data ?? []).map((address) => (
              <ListRow
                key={address.id}
                icon="location-outline"
                title={toWesternNumerals(address.label ?? address.recipientName)}
                subtitle={summarise(address, areas.data ?? [], language)}
                showChevron
                onPress={() => router.push(`/addresses/form?id=${address.id}`)}
                testID={`address-row-${address.id}`}
              />
            ))}
          </ListGroup>

          <View style={{ gap: theme.spacing.sm }}>
            <Button
              label={t('address.add')}
              variant="secondary"
              onPress={() => router.push('/addresses/form')}
              testID="address-add"
            />
            <Text variant="caption" color="textTertiary" style={{ textAlign: 'center' }}>
              {t('address.areaHint')}
            </Text>
          </View>
        </View>
      )}
    </ScreenScroll>
  );
}
