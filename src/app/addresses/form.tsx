import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { ScreenFooter, ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import {
  prepareAddress,
  type AddressFieldError,
  type AddressInput,
} from '@/features/commerce/address-repository';
import { areaDisplayName, canDeliver } from '@/features/commerce/delivery-areas';
import {
  useAddresses,
  useAddressMutations,
  useDeliveryAreas,
  useSelectedMerchant,
} from '@/features/commerce/hooks';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useI18n } from '@/i18n';
import { presentError } from '@/lib/errors';
import { toWesternNumerals } from '@/lib/format/numerals';
import { useTheme } from '@/theme';

/**
 * One delivery address.
 *
 * TWO THINGS ARE DELIBERATELY SEPARATE HERE.
 *
 *   THE AREA is a key chosen from a registry. It is the only field any
 *   deliverability decision reads, and nothing on this screen derives it from
 *   what the customer typed.
 *
 *   EVERYTHING ELSE is for the courier — the street, the building, the floor,
 *   the landmark — and is never parsed, normalised or matched against
 *   anything. It is a human's note to another human.
 *
 * The screen tells the customer immediately whether the branch covers the area
 * they picked, so that is learned here rather than at the end of checkout.
 */

const EMPTY: AddressInput = {
  label: null,
  recipientName: '',
  phone: '',
  areaKey: '',
  street: '',
  building: '',
  floor: null,
  apartment: null,
  landmark: null,
  notes: null,
  country: 'EG',
};

const ERROR_KEYS = {
  recipient_required: 'address.error.recipient_required',
  phone_required: 'address.error.phone_required',
  phone_invalid: 'address.error.phone_invalid',
  area_required: 'address.error.area_required',
  street_required: 'address.error.street_required',
  building_required: 'address.error.building_required',
} as const satisfies Record<AddressFieldError, string>;

export default function AddressFormScreen() {
  const theme = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { preferences } = usePreferences();

  const { id } = useLocalSearchParams<{ id?: string }>();
  const addresses = useAddresses();
  const areas = useDeliveryAreas();
  const merchant = useSelectedMerchant();
  const { create, update, remove } = useAddressMutations();

  const [form, setForm] = useState<AddressInput>({ ...EMPTY, country: preferences.country });
  const [errors, setErrors] = useState<readonly AddressFieldError[]>([]);
  const [seededFrom, setSeededFrom] = useState<string | null>(null);

  const existing = id ? (addresses.data ?? []).find((entry) => entry.id === id) : undefined;

  // Seeded during render, once per address — the same rule as the profile
  // form: an effect would paint an empty form and then overwrite whatever the
  // user had started typing on the next background refetch.
  if (existing && seededFrom !== existing.id) {
    setSeededFrom(existing.id);
    setForm({
      label: existing.label,
      recipientName: existing.recipientName,
      phone: existing.phone,
      areaKey: existing.areaKey,
      street: existing.street,
      building: existing.building,
      floor: existing.floor,
      apartment: existing.apartment,
      landmark: existing.landmark,
      notes: existing.notes,
      country: existing.country,
    });
  }

  const has = (error: AddressFieldError) => errors.includes(error);
  const errorFor = (error: AddressFieldError) => (has(error) ? t(ERROR_KEYS[error]) : null);
  const set = <K extends keyof AddressInput>(key: K, value: AddressInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  /**
   * Whether the branch in play covers the chosen area.
   *
   * By KEY, through the same function checkout and the database both use. A
   * second implementation here would eventually disagree with them, and the
   * disagreement would be discovered by a customer.
   */
  const coverage =
    merchant && form.areaKey
      ? canDeliver(merchant.location, { areaKey: form.areaKey })
      : null;

  const save = () => {
    const prepared = prepareAddress(form);
    if (!prepared.ok) {
      setErrors(prepared.errors);
      return;
    }
    setErrors([]);

    // The same fallback `ScreenHeader` uses: this screen is reachable by a
    // direct link from checkout, so there is not always somewhere to go back
    // to — and a save that appears to do nothing is worse than a save that
    // lands somewhere sensible.
    const leave = () => {
      if (router.canGoBack()) router.back();
      else router.replace('/addresses');
    };

    const onDone = () => {
      toast.show({ message: t('common.saved'), tone: 'success' });
      leave();
    };
    const onError = (error: unknown) =>
      toast.show({ message: t(presentError(error).bodyKey), tone: 'danger' });

    if (existing) update.mutate({ id: existing.id, input: form }, { onSuccess: onDone, onError });
    else create.mutate(form, { onSuccess: onDone, onError });
  };

  const isSaving = create.isPending || update.isPending;

  return (
    <>
      <ScreenScroll bottomInset={theme.spacing.huge * 2} contentGap={theme.spacing.lg}>
        <ScreenHeader title={existing ? t('checkout.editAddress') : t('address.add')} />

        <Section title={t('address.recipient')}>
          <Input
            label={t('address.recipient')}
            value={form.recipientName}
            onChangeText={(value) => set('recipientName', value)}
            error={errorFor('recipient_required')}
            autoCapitalize="words"
            testID="address-recipient"
          />
          <Input
            label={t('address.phone')}
            value={form.phone}
            onChangeText={(value) => set('phone', value)}
            error={errorFor('phone_required') ?? errorFor('phone_invalid')}
            hint={t('address.phoneHint')}
            keyboardType="phone-pad"
            testID="address-phone"
          />
        </Section>

        <Section title={t('address.area')} subtitle={t('address.areaHint')}>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}
            testID="address-areas"
          >
            {(areas.data ?? []).map((area) => (
              <Chip
                key={area.key}
                label={areaDisplayName(area, language)}
                selected={form.areaKey === area.key}
                emphasis="solid"
                onPress={() => set('areaKey', area.key)}
                testID={`address-area-${area.key}`}
              />
            ))}
          </View>
          {has('area_required') ? (
            <Text variant="footnote" color="danger" testID="address-missing-area">
              {t('address.error.area_required')}
            </Text>
          ) : null}

          {/*
            SAID HERE, NOT AT THE END OF CHECKOUT. An area the branch does not
            cover is not an invalid address — it is a real place we cannot
            reach — so the address still saves and the limit is named.
          */}
          {coverage ? (
            <Text
              variant="footnote"
              style={{
                color: coverage.deliverable
                  ? theme.colors.successSoftText
                  : theme.colors.warningSoftText,
              }}
              testID={coverage.deliverable ? 'address-served' : 'address-not-served'}
            >
              {coverage.deliverable ? t('address.served') : t('address.notServed')}
            </Text>
          ) : null}
        </Section>

        <Section title={t('checkout.deliverTo')}>
          <Input
            label={t('address.street')}
            value={form.street}
            onChangeText={(value) => set('street', value)}
            error={errorFor('street_required')}
            testID="address-street"
          />
          <Input
            label={t('address.building')}
            value={form.building}
            onChangeText={(value) => set('building', value)}
            error={errorFor('building_required')}
            testID="address-building"
          />
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Input
              label={t('address.floor')}
              value={form.floor ?? ''}
              onChangeText={(value) => set('floor', value)}
              containerStyle={{ flex: 1 }}
              testID="address-floor"
            />
            <Input
              label={t('address.apartment')}
              value={form.apartment ?? ''}
              onChangeText={(value) => set('apartment', value)}
              containerStyle={{ flex: 1 }}
              testID="address-apartment"
            />
          </View>
          <Input
            label={t('address.landmark')}
            value={form.landmark ?? ''}
            onChangeText={(value) => set('landmark', value)}
            hint={t('address.landmarkHint')}
            testID="address-landmark"
          />
          <Input
            label={t('address.label')}
            value={form.label ?? ''}
            onChangeText={(value) => set('label', value)}
            placeholder={t('address.labelPlaceholder')}
            testID="address-label"
          />
          <Input
            label={t('address.notes')}
            value={form.notes ?? ''}
            onChangeText={(value) => set('notes', value)}
            multiline
            testID="address-notes"
          />
        </Section>

        {existing ? (
          <Button
            label={t('address.delete')}
            variant="ghost"
            onPress={() =>
              remove.mutate(existing.id, {
                onSuccess: () => {
                  if (router.canGoBack()) router.back();
                  else router.replace('/addresses');
                },
                onError: (error) =>
                  toast.show({ message: t(presentError(error).bodyKey), tone: 'danger' }),
              })
            }
            testID="address-delete"
          />
        ) : null}

        {/* The stored number, echoed back in the numerals AKALT always uses. */}
        {existing ? (
          <Text variant="caption" color="textTertiary">
            {toWesternNumerals(existing.phone)}
          </Text>
        ) : null}
      </ScreenScroll>

      <ScreenFooter>
        <Button
          label={t('address.save')}
          size="lg"
          loading={isSaving}
          onPress={save}
          testID="address-save"
        />
      </ScreenFooter>
    </>
  );
}
