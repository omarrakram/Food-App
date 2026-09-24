import type { SourcedLine, SourcingResult } from './ports';

/**
 * What a bulk "add these to my cart" action is allowed to do.
 *
 * Kept OUT of the hooks file on purpose. This is the rule that decides what
 * lands in somebody's basket without them looking at it individually, and a
 * rule of that weight belongs somewhere a test can reach it directly rather
 * than inside a `useMemo`.
 */

/**
 * The lines a bulk action may add WITHOUT ASKING.
 *
 * ONLY `matched`. Every other status is a question the app has no business
 * answering on the user's behalf:
 *
 *   needs_confirmation   — we do not know this is the right product, or we do
 *                          not know whether it is safe for them.
 *   no_purchasable_match — the shop has none. Adding it produces an order the
 *                          merchant will reject at picking.
 *   no_eligible_match    — everything here conflicts with an allergy.
 *   unmapped             — this shop does not carry the ingredient at all.
 *
 * AND ONLY WITH A PACK COUNT. `packsNeeded` is null on a matched line when the
 * recipe asked for a MEASURED amount and the pack maths could not answer —
 * the merchant never published a pack size, or the units do not convert. One
 * pack might be 200 g against a 500 g requirement, and under-buying is the
 * error the cook only discovers with a pan already hot. A line the sourcer
 * could not size is a question too, and the screen shows it as one.
 *
 * ("Salt, to taste" is NOT that case: an unmeasured requirement is given one
 * pack by the sourcer itself, because one pack is the smallest thing the shop
 * will sell rather than a guess at an amount.)
 *
 * `chosen` is re-checked rather than trusted from the status, because the two
 * agreeing is an invariant of the sourcer and this is the last gate before
 * money.
 */
export function addableLines(result: SourcingResult): readonly SourcedLine[] {
  return result.lines.filter(
    (line) => line.status === 'matched' && line.chosen !== null && line.chosen.packsNeeded !== null,
  );
}
