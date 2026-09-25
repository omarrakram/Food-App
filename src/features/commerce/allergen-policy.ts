/**
 * WHAT TO SAY WHEN A SHOP HAS NOT PUBLISHED ALLERGEN DATA.
 *
 * THE RULE ITSELF IS NOT NEGOTIABLE AND IS NOT IMPLEMENTED HERE. "Unknown must
 * not mean safe" lives in `sourcing.ts`, in the eligibility gate: a product a
 * merchant has published nothing about is never CHOSEN for a customer with a
 * declared allergy. It can be offered and it cannot be auto-selected. Nothing
 * in this file relaxes that, and nothing in this file could — it computes a
 * message.
 *
 * WHY A MESSAGE IS WORTH A MODULE. The gate is silent by construction: the
 * customer simply sees fewer matched lines than somebody else would, with no
 * explanation. From the inside that is indistinguishable from a shop with a
 * thin catalogue, or from a bug. A person who has told us they are coeliac and
 * then watches half their basket refuse to fill deserves the actual reason,
 * which is that the shop has not said what is in these products and we will
 * not guess.
 *
 * AND IT IS A PILOT LIMITATION, NOT A PRODUCT RULE. If the first partner's
 * feed carries no allergen data, automatic ordering is narrower for customers
 * with declared allergies until it does. That sentence belongs on the screen,
 * in the customer's own language, rather than in a document they will never
 * read.
 */

export type AllergenDataCoverage = {
  /** Candidates the shop offered for this basket, across every line. */
  readonly candidatesConsidered: number;
  /**
   * How many of them carry a published allergen list.
   *
   * PUBLISHED, not non-empty. A merchant declaring a product free of allergens
   * publishes an empty list, and that is a statement; a merchant who has said
   * nothing publishes null, and that is not.
   */
  readonly withPublishedData: number;
};

/**
 * Counted from the CANDIDATES THEMSELVES, not from the ranking's reason codes.
 *
 * `eligibility_unknown` was the obvious source and is the wrong one: it is
 * also pushed when a merchant published no DIETARY verdict, so a vegan with no
 * allergies would have inflated an allergen statistic. `productAllergens ===
 * null` is the exact fact — the merchant published nothing — and it is on the
 * candidate already.
 */
export function allergenCoverage(
  candidates: Iterable<{ readonly productAllergens: readonly unknown[] | null }>,
): AllergenDataCoverage {
  let candidatesConsidered = 0;
  let withPublishedData = 0;

  for (const candidate of candidates) {
    candidatesConsidered += 1;
    if (candidate.productAllergens !== null) withPublishedData += 1;
  }

  return { candidatesConsidered, withPublishedData };
}

export const ALLERGEN_NOTICES = [
  /** Nothing to say: no declared allergies, or the shop has published data. */
  'none',
  /** Some of the shelf is labelled and some is not. */
  'partial',
  /** The shop has published nothing at all. Ordering is materially narrower. */
  'absent',
] as const;
export type AllergenNotice = (typeof ALLERGEN_NOTICES)[number];

/**
 * Which sentence this customer needs, if any.
 *
 * Takes whether they have DECLARED an allergy rather than which ones: the
 * message is the same for every allergy and the list is not this module's
 * business.
 */
export function allergenNotice(
  hasDeclaredAllergens: boolean,
  coverage: AllergenDataCoverage,
): AllergenNotice {
  // Somebody with no declared allergies is not affected by any of this. Saying
  // it anyway would be noise, and noise is how a real warning stops being read.
  if (!hasDeclaredAllergens) return 'none';
  if (coverage.candidatesConsidered === 0) return 'none';
  if (coverage.withPublishedData === 0) return 'absent';
  if (coverage.withPublishedData < coverage.candidatesConsidered) return 'partial';
  return 'none';
}

/**
 * Is automatic ordering materially narrowed for this customer, right now?
 *
 * The one thing outside the message that reads this: a pilot report counting
 * how many customers are affected should ask a function rather than re-derive
 * the rule.
 */
export function orderingNarrowedByMissingAllergenData(notice: AllergenNotice): boolean {
  return notice === 'absent';
}
