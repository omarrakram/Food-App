import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  LocalAddressRepository,
  prepareAddress,
  SupabaseAddressRepository,
  type AddressInput,
} from '../address-repository';
import { DEMO_DELIVERY_AREAS } from '../delivery-areas';

/**
 * WHERE SOMEBODY'S DINNER GOES.
 *
 * Two rules carry the weight here, and both are about the difference between
 * an address and a deliverable address:
 *
 *   THE AREA IS A KEY, chosen from a registry. Nothing derives it from typed
 *   text, so "Maadi Degla" never becomes "Degla" and an order is never
 *   accepted for a district nobody can reach.
 *
 *   THE PHONE IS CANONICALISED ON THE WAY IN. A courier who cannot ring the
 *   door is a delivery that fails at the last ten metres, and E.164 is what
 *   every gateway wants.
 */

function input(over: Partial<AddressInput> = {}): AddressInput {
  return {
    label: '  Home  ',
    recipientName: '  Nour  ',
    phone: '01001234567',
    areaKey: 'demo-maadi',
    street: '  Road 9  ',
    building: ' 12 ',
    floor: ' 3 ',
    apartment: ' 7 ',
    landmark: '  next to the bakery  ',
    notes: null,
    country: 'EG',
    ...over,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('prepareAddress', () => {
  it('canonicalises the phone to E.164 and trims everything else', () => {
    const prepared = prepareAddress(input());
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    expect(prepared.value.phone).toBe('+201001234567');
    expect(prepared.value.recipientName).toBe('Nour');
    expect(prepared.value.street).toBe('Road 9');
    expect(prepared.value.building).toBe('12');
    expect(prepared.value.label).toBe('Home');
  });

  it('turns blank optional fields into null rather than empty strings', () => {
    const prepared = prepareAddress(input({ floor: '   ', apartment: '', landmark: ' ' }));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    expect(prepared.value.floor).toBeNull();
    expect(prepared.value.apartment).toBeNull();
    expect(prepared.value.landmark).toBeNull();
  });

  // ALL OF THEM AT ONCE. One field per attempt is a form somebody fills in
  // five times.
  it('reports every problem in one pass', () => {
    const prepared = prepareAddress(
      input({ recipientName: ' ', phone: '', areaKey: '', street: '', building: '' }),
    );
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;

    expect([...prepared.errors].sort()).toEqual([
      'area_required',
      'building_required',
      'phone_required',
      'recipient_required',
      'street_required',
    ]);
  });

  it('separates a missing phone from an unusable one', () => {
    const missing = prepareAddress(input({ phone: '  ' }));
    const invalid = prepareAddress(input({ phone: '0100123' }));

    expect(missing.ok).toBe(false);
    expect(invalid.ok).toBe(false);
    if (missing.ok || invalid.ok) return;

    expect(missing.errors).toContain('phone_required');
    expect(missing.errors).not.toContain('phone_invalid');
    expect(invalid.errors).toContain('phone_invalid');
  });

  // A LANDMARK IS NOT AN AREA. Nothing in the free text can stand in for the
  // key, however much it looks like a district name.
  it('refuses an address whose only clue to the district is prose', () => {
    const prepared = prepareAddress(
      input({ areaKey: '', street: 'Maadi, Degla', landmark: 'Nasr City side' }),
    );
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.errors).toContain('area_required');
  });
});

describe('LocalAddressRepository', () => {
  it('stores a canonicalised address and reads it back', async () => {
    const repository = new LocalAddressRepository();
    const created = await repository.create(input());

    expect(created.phone).toBe('+201001234567');
    expect(await repository.list()).toEqual([created]);
  });

  it('refuses an invalid address rather than storing a half-one', async () => {
    const repository = new LocalAddressRepository();
    await expect(repository.create(input({ areaKey: '' }))).rejects.toThrow();
    expect(await repository.list()).toEqual([]);
  });

  it('keeps createdAt across an update and moves updatedAt', async () => {
    const repository = new LocalAddressRepository();
    const created = await repository.create(input());
    const updated = await repository.update(created.id, input({ building: '14' }));

    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.building).toBe('14');
  });

  it('removes only the address asked for', async () => {
    const repository = new LocalAddressRepository();
    const first = await repository.create(input());
    const second = await repository.create(input({ label: 'Work' }));

    await repository.remove(first.id);
    expect((await repository.list()).map((entry) => entry.id)).toEqual([second.id]);
  });

  it('offers the demo areas only, and every key it offers is real', async () => {
    const areas = await new LocalAddressRepository().listAreas();
    expect(areas).toEqual([...DEMO_DELIVERY_AREAS]);
    expect(areas.every((area) => area.isDemo)).toBe(true);
  });
});

describe('SupabaseAddressRepository, with the demo catalogue on', () => {
  /** Only the calls the repository makes; anything else fails loudly. */
  function client(rows: readonly Record<string, unknown>[]) {
    const builder = {
      select: () => builder,
      order: () => Promise.resolve({ data: rows, error: null }),
      eq: () => builder,
    };
    return { from: () => builder } as any;
  }

  const area = (key: string, isDemo: boolean) => ({
    key,
    governorate: 'cairo',
    name_en: key,
    name_ar: key,
    is_demo: isDemo,
  });

  // The other side of the gate. `delivery-area-registry.test.ts` mocks the
  // flag off and asserts the demo row is dropped; without this the filter
  // could simply drop everything and still look correct there.
  it('keeps demo areas so the demo branch is orderable in a dev build', async () => {
    const repository = new SupabaseAddressRepository(
      client([area('real-zamalek', false), area('demo-maadi', true)]),
      'user-1',
    );

    expect((await repository.listAreas()).map((entry) => entry.key)).toEqual([
      'real-zamalek',
      'demo-maadi',
    ]);
  });
});
