import type { SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/lib/config/env';
import { toAppError } from '@/lib/errors';
import { toE164Egyptian } from '@/lib/format/phone';
import { LocalCollection, LocalCollectionKeys, newId, nowISO } from '@/lib/storage/local-collection';
import type { Database, DeliveryAddressRow } from '@/lib/supabase/database.types';
import type { DeliveryAddress, DeliveryArea } from '@/types/commerce';
import type { CountryCode } from '@/types/domain';

import { DEMO_DELIVERY_AREAS } from './delivery-areas';

/**
 * Where somebody's dinner goes.
 *
 * Same repository pattern as everything else: an interface, a local
 * implementation for guests, a Supabase one for signed-in users, and callers
 * that never learn which is active.
 *
 * THE LOCAL ONE IS FOR TYPING, NOT FOR ORDERING. A guest can fill in an
 * address and see whether their area is served — useful, and it means the form
 * is not a wall in front of the sign-in prompt — but no real order draft is
 * ever built from it. `create_order_draft` reads `delivery_addresses` with the
 * caller's own `auth.uid()`, so a local address simply is not visible to it.
 */

export type AddressInput = {
  readonly label: string | null;
  readonly recipientName: string;
  /** Raw, as typed. Normalised to E.164 on the way in. */
  readonly phone: string;
  readonly areaKey: string;
  readonly street: string;
  readonly building: string;
  readonly floor: string | null;
  readonly apartment: string | null;
  readonly landmark: string | null;
  readonly notes: string | null;
  readonly country: CountryCode;
};

export interface AddressRepository {
  /**
   * The area registry a customer picks from.
   *
   * Lives beside addresses because an address is not finished without one, and
   * because the two have to agree about which keys exist: a form offering an
   * area the registry does not carry produces an address no branch can match.
   *
   * DEMO AREAS ARE FILTERED OUT unless this build is running the demo
   * catalogue. A production customer must never be offered a district that
   * exists only for development.
   */
  listAreas(): Promise<DeliveryArea[]>;
  list(): Promise<DeliveryAddress[]>;
  create(input: AddressInput): Promise<DeliveryAddress>;
  update(id: string, input: AddressInput): Promise<DeliveryAddress>;
  remove(id: string): Promise<void>;
}

/** Required fields, stated once so both implementations agree. */
export const ADDRESS_FIELD_ERRORS = [
  'recipient_required',
  'phone_required',
  'phone_invalid',
  'area_required',
  'street_required',
  'building_required',
] as const;
export type AddressFieldError = (typeof ADDRESS_FIELD_ERRORS)[number];

/**
 * Validates and canonicalises, in one pass.
 *
 * Returns the errors rather than throwing on the first, so a form can show
 * everything wrong at once instead of one field per attempt.
 */
export function prepareAddress(
  input: AddressInput,
): { ok: true; value: AddressInput } | { ok: false; errors: readonly AddressFieldError[] } {
  const errors: AddressFieldError[] = [];

  if (!input.recipientName.trim()) errors.push('recipient_required');
  if (!input.areaKey) errors.push('area_required');
  if (!input.street.trim()) errors.push('street_required');
  if (!input.building.trim()) errors.push('building_required');

  const phone = input.phone.trim();
  if (!phone) errors.push('phone_required');

  const canonical = phone ? toE164Egyptian(phone) : null;
  if (phone && canonical === null) errors.push('phone_invalid');

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      ...input,
      recipientName: input.recipientName.trim(),
      phone: canonical!,
      street: input.street.trim(),
      building: input.building.trim(),
      floor: input.floor?.trim() || null,
      apartment: input.apartment?.trim() || null,
      landmark: input.landmark?.trim() || null,
      notes: input.notes?.trim() || null,
      label: input.label?.trim() || null,
    },
  };
}

class ValidationFailed extends Error {
  constructor(readonly errors: readonly AddressFieldError[]) {
    super(`address invalid: ${errors.join(', ')}`);
  }
}

function toAddress(input: AddressInput, id: string, userId: string | null): DeliveryAddress {
  return {
    id,
    userId,
    label: input.label,
    recipientName: input.recipientName,
    phone: input.phone,
    areaKey: input.areaKey,
    street: input.street,
    building: input.building,
    floor: input.floor,
    apartment: input.apartment,
    landmark: input.landmark,
    country: input.country,
    notes: input.notes,
    isDefault: false,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

export class LocalAddressRepository implements AddressRepository {
  private readonly collection = new LocalCollection<DeliveryAddress>(
    LocalCollectionKeys.addresses,
  );

  async listAreas(): Promise<DeliveryArea[]> {
    // A guest has no server to read the registry from, so the only areas that
    // can exist locally are the demo ones — and only when the demo catalogue
    // is on. Otherwise: none, and the form says so rather than inventing one.
    return env.useDemoMerchantCatalogue ? [...DEMO_DELIVERY_AREAS] : [];
  }

  async list(): Promise<DeliveryAddress[]> {
    return this.collection.list();
  }

  async create(input: AddressInput): Promise<DeliveryAddress> {
    const prepared = prepareAddress(input);
    if (!prepared.ok) throw new ValidationFailed(prepared.errors);

    const address = toAddress(prepared.value, newId(), null);
    await this.collection.replaceAll([...(await this.collection.list()), address]);
    return address;
  }

  async update(id: string, input: AddressInput): Promise<DeliveryAddress> {
    const prepared = prepareAddress(input);
    if (!prepared.ok) throw new ValidationFailed(prepared.errors);

    const all = await this.collection.list();
    const existing = all.find((entry) => entry.id === id);
    if (!existing) throw new Error('address not found');

    const next: DeliveryAddress = {
      ...toAddress(prepared.value, id, null),
      createdAt: existing.createdAt,
      updatedAt: nowISO(),
    };
    await this.collection.replaceAll(all.map((entry) => (entry.id === id ? next : entry)));
    return next;
  }

  async remove(id: string): Promise<void> {
    const all = await this.collection.list();
    await this.collection.replaceAll(all.filter((entry) => entry.id !== id));
  }
}

function fromRow(row: DeliveryAddressRow): DeliveryAddress {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    recipientName: row.recipient_name,
    phone: row.phone,
    areaKey: row.area_key ?? '',
    street: row.street,
    building: row.building,
    floor: row.floor,
    apartment: row.apartment,
    landmark: row.landmark,
    country: row.country as CountryCode,
    notes: row.notes,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseAddressRepository implements AddressRepository {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async listAreas(): Promise<DeliveryArea[]> {
    const { data, error } = await this.client
      .from('delivery_areas')
      .select('*')
      .order('name_en', { ascending: true });

    if (error) throw toAppError(error, 'database');

    return (data ?? [])
      .filter((row) => (row.is_demo ? env.useDemoMerchantCatalogue : true))
      .map((row) => ({
        key: row.key,
        governorate: row.governorate,
        nameEn: row.name_en,
        nameAr: row.name_ar,
        isDemo: row.is_demo,
      }));
  }

  async list(): Promise<DeliveryAddress[]> {
    // RLS restricts this to the caller's own rows; the filter is belt AND
    // braces, and makes the intent readable without consulting a policy.
    const { data, error } = await this.client
      .from('delivery_addresses')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false });

    if (error) throw toAppError(error, 'database');
    return (data ?? []).map(fromRow);
  }

  async create(input: AddressInput): Promise<DeliveryAddress> {
    const prepared = prepareAddress(input);
    if (!prepared.ok) throw new ValidationFailed(prepared.errors);
    const v = prepared.value;

    const { data, error } = await this.client
      .from('delivery_addresses')
      .insert({
        user_id: this.userId,
        label: v.label,
        recipient_name: v.recipientName,
        phone: v.phone,
        area_key: v.areaKey,
        street: v.street,
        building: v.building,
        floor: v.floor,
        apartment: v.apartment,
        landmark: v.landmark,
        notes: v.notes,
        country: v.country,
      })
      .select('*')
      .single();

    if (error) throw toAppError(error, 'database');
    return fromRow(data);
  }

  async update(id: string, input: AddressInput): Promise<DeliveryAddress> {
    const prepared = prepareAddress(input);
    if (!prepared.ok) throw new ValidationFailed(prepared.errors);
    const v = prepared.value;

    const { data, error } = await this.client
      .from('delivery_addresses')
      .update({
        label: v.label,
        recipient_name: v.recipientName,
        phone: v.phone,
        area_key: v.areaKey,
        street: v.street,
        building: v.building,
        floor: v.floor,
        apartment: v.apartment,
        landmark: v.landmark,
        notes: v.notes,
      })
      .eq('id', id)
      .eq('user_id', this.userId)
      .select('*')
      .single();

    if (error) throw toAppError(error, 'database');
    return fromRow(data);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client
      .from('delivery_addresses')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) throw toAppError(error, 'database');
  }
}
