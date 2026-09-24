import type { DeliveryArea, DeliveryAddress, MerchantLocation } from '@/types/commerce';

/**
 * WHETHER THIS BRANCH CAN SERVE THIS ADDRESS.
 *
 * Three separate things, deliberately never conflated:
 *
 *   AN ADDRESS          where one person lives
 *   AN AREA             a district, with a canonical key
 *   A MERCHANT LOCATION a branch, which declares the areas it covers
 *
 * A valid address is not a deliverable one, and the question is answered by
 * comparing KEYS. Nothing here reads the street, the building or the landmark:
 * those are for the courier, and deriving a district from them is how
 * "Maadi Degla" comes to equal "Degla" and an order is accepted that nobody
 * can deliver.
 */

export const DELIVERABILITY_REASONS = [
  /** The address has no area selected — it was never finished. */
  'no_area_selected',
  /** The branch has declared no coverage at all. Not "everywhere". */
  'branch_has_no_coverage',
  /** A real answer: this branch does not go there. */
  'outside_delivery_area',
] as const;
export type DeliverabilityReason = (typeof DELIVERABILITY_REASONS)[number];

export type Deliverability =
  | { readonly deliverable: true }
  | { readonly deliverable: false; readonly reason: DeliverabilityReason };

/**
 * `deliveryAreaKeys` EMPTY MEANS NO COVERAGE, never "delivers everywhere".
 *
 * The inverse is the kind of default that quietly accepts an order from
 * Aswan for a branch in Maadi, and it would do so most confidently for a
 * merchant whose data nobody had filled in yet.
 */
export function canDeliver(
  location: Pick<MerchantLocation, 'deliveryAreaKeys'>,
  address: Pick<DeliveryAddress, 'areaKey'>,
): Deliverability {
  if (!address.areaKey) return { deliverable: false, reason: 'no_area_selected' };
  if (location.deliveryAreaKeys.length === 0) {
    return { deliverable: false, reason: 'branch_has_no_coverage' };
  }
  if (!location.deliveryAreaKeys.includes(address.areaKey)) {
    return { deliverable: false, reason: 'outside_delivery_area' };
  }
  return { deliverable: true };
}

/**
 * The development area registry.
 *
 * REAL CAIRO DISTRICT NAMES, MARKED AS DEMO. Inventing fictional places would
 * make the flow untestable against anything resembling reality; claiming real
 * coverage would be a lie. `isDemo` is on the row, so the distinction survives
 * in the data rather than in a flag somebody can flip, exactly as `is_demo`
 * does on the merchant.
 */
export const DEMO_DELIVERY_AREAS: readonly DeliveryArea[] = [
  { key: 'demo-maadi', governorate: 'cairo', nameEn: 'Maadi', nameAr: 'المعادي', isDemo: true },
  { key: 'demo-degla', governorate: 'cairo', nameEn: 'Degla', nameAr: 'دجلة', isDemo: true },
  {
    key: 'demo-sarayat',
    governorate: 'cairo',
    nameEn: 'Sarayat El Maadi',
    nameAr: 'سرايات المعادي',
    isDemo: true,
  },
  // Deliberately NOT served by the demo branch, so the unsupported-area path
  // is reachable in a build somebody can open rather than only in a unit test.
  {
    key: 'demo-nasr-city',
    governorate: 'cairo',
    nameEn: 'Nasr City',
    nameAr: 'مدينة نصر',
    isDemo: true,
  },
];

export function areaByKey(
  areas: readonly DeliveryArea[],
  key: string | null,
): DeliveryArea | null {
  if (!key) return null;
  return areas.find((area) => area.key === key) ?? null;
}

/** The area's name in the reader's language. Same rule as every other name. */
export function areaDisplayName(area: DeliveryArea, language: 'en' | 'ar'): string {
  return language === 'ar' ? area.nameAr : area.nameEn;
}
